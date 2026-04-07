import {
  findByOneId,
  upsert,
  upsertMultiTeam,
  findAll,
  findTeamIdsByManagerId,
  findEmployeesByTeamIds,
} from "./employee.repository.js";
import {
  getTeams,
  getRolesAll,
} from "../../shared/integrations/oneApi.service.js";
import {
  mapKpiRole,
  resolveFromFranchiseeRoles,
} from "../../shared/utils/kpiRoleMapper.js";

// PRD: Refresh every 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;

// Re-export so auth.middleware can import from a single place
export { mapKpiRole };

/**
 * Resolves the best available ONE CRM token for outgoing API calls.
 * Priority: request-time oneToken → stored crm_token from DB cache
 *
 * @param {Object} currentUser  - req.user (has .oneToken from middleware)
 * @param {string} employeeId   - ONE CRM EmployeeID to look up stored token
 */
const resolveCrmToken = async (currentUser, employeeId) => {
  if (currentUser.oneToken) return currentUser.oneToken;

  // Fall back to the token stored in the DB at last login
  const cached = await findByOneId(employeeId);
  return cached?.crm_token || null;
};

/**
 * Retrieves an employee from cache, or fetches and caches from ONE CRM if missing/stale.
 *
 * PRD Algorithm:
 *   1. Call GET /getTeams
 *   2. Loop all teams → find entries where EmployeeID === userId
 *   3. Collect RoleIDs and TeamIDs
 *   4. Call GET /getRoles → build RoleID → RoleTypeId map
 *   5. Deduplicate RoleTypeIds
 *   6. Derive KPI role via mapKpiRole (highest privilege wins)
 *
 * Edge cases:
 *   - Employee belongs to no teams → default to KPI Executive
 *   - Duplicate team memberships → deduplicated via Set
 *   - Unknown RoleID → ignored safely
 *   - API failure → falls back to stale cache; throws if no cache exists
 *
 * @param {string|number} userId  - ONE CRM EmployeeID
 * @param {string}        token   - Bearer token forwarded to ONE APIs
 * @returns {Promise<Object>}     - Cached employee row with roles/teamIds
 */
export const getOrSyncEmployee = async (userId, token) => {
  const cached = await findByOneId(userId);
  const isStale =
    !cached ||
    new Date() - new Date(cached.cached_at) > CACHE_TTL_MS;

  if (cached && !isStale) {
    return cached;
  }

  try {
    // Use the stored CRM token if the caller-supplied token might be a KPI token.
    // crm_token is written to the DB at login, so it's always the real ONE CRM token.
    const effectiveToken = cached?.crm_token || token;

    // --- Fetch teams and role definitions in parallel ---
    const [teamsResponse, rolesResponse] = await Promise.all([
      getTeams({}, effectiveToken),
      getRolesAll(effectiveToken),
    ]);

    // --- Build RoleID → RoleTypeId lookup map ---
    // PRD: Use RoleTypeId for all logic; never depend on RoleName
    const roleTypeMap = new Map();
    const rolesList = Array.isArray(rolesResponse)
      ? rolesResponse
      : rolesResponse?.data ?? [];

    for (const r of rolesList) {
      const roleId = String(r.RoleID ?? r.roleId ?? "");
      const typeId = r.RoleTypeId ?? r.roleTypeId;
      if (roleId && typeId !== undefined) {
        roleTypeMap.set(roleId, typeId);
      }
    }

    // --- Scan all teams for this employee's memberships ---
    const teams = Array.isArray(teamsResponse)
      ? teamsResponse
      : teamsResponse?.data ?? [];

    const matchedTeamIds     = new Set();
    const matchedRoleTypeIds = new Set();
    let   resolvedName       = cached?.name ?? null; // filled from EmployeeName if found

    for (const team of teams) {
      const teamId = team.TeamID ?? team.teamId;
      const members = team.TeamMembers ?? team.teamMembers ?? [];

      for (const member of members) {
        const memberId = String(
          member.EmployeeID ?? member.employeeId ?? ""
        );

        if (memberId !== String(userId)) continue;

        // Collect this team
        if (teamId !== undefined && teamId !== null) {
          matchedTeamIds.add(teamId);
        }

        // Grab name from API if we don't have one yet
        if (!resolvedName) {
          resolvedName = member.EmployeeName ?? member.employeeName ?? null;
        }

        // Map RoleID → RoleTypeId; ignore unknown RoleIDs
        const roleId = String(member.RoleID ?? member.roleId ?? "");
        if (roleTypeMap.has(roleId)) {
          matchedRoleTypeIds.add(roleTypeMap.get(roleId));
        }
      }
    }

    const roles = [...matchedRoleTypeIds];      // e.g. [1, 2]
    const teamIds = [...matchedTeamIds];        // e.g. [26, 23]
    const kpiRole = mapKpiRole(roles);          // highest-privilege wins

    // --- Persist to cache ---
    await upsertMultiTeam({
      one_employee_id: userId,
      roles,
      teamIds,
      kpiRole,
      name:      resolvedName ?? String(userId),
      crmToken:  effectiveToken,
    });

    console.log(
      `✅ Employee synced: ${userId} | kpiRole=${kpiRole} | teams=[${teamIds}] | roleTypeIds=[${roles}]`
    );

    return await findByOneId(userId);
  } catch (err) {
    console.error(
      `❌ getOrSyncEmployee Error for ${userId}:`,
      err.message
    );

    // Fallback: return stale cache rather than fail the request
    if (cached) {
      console.warn(`⚠️  Returning stale cache for ${userId}`);
      return cached;
    }

    throw new Error(
      `Failed to sync employee ${userId} from ONE CRM: ${err.message}`
    );
  }
};

/**
 * Manual cache refresh — forces a re-sync regardless of TTL.
 * Falls back to getEmployeeById for name/profile data.
 */
export const refreshCache = async (employeeId, token) => {
  await getOrSyncEmployee(employeeId, token); // Bypass TTL by deleting cache first
  return true;
};

/**
 * Direct sync from CRM login response payload.
 *
 * Processes ALL franchiseeRoles entries so multi-team employees get every
 * team and the correct highest-privilege KPI role stored on first login.
 *
 * @param {Object} userData  - 'user' object from ONE CRM /login response
 * @param {string} crmToken  - Original ONE CRM bearer token from login response
 * @returns {Promise<Object|null>}
 */
export const syncFromLoginResponse = async (userData, crmToken = null) => {
  const employeeId = userData?.id || userData?.EmployeeID;
  if (!employeeId) return null;

  const franchiseeRoles =
    userData.franchiseeRoles || userData.Franchisees || userData.metadata || [];

  const { kpiRole, roleTypeIds, teamIds, franchiseeId } =
    resolveFromFranchiseeRoles(franchiseeRoles);

  const name =
    userData.username || userData.EmployeeName || userData.name || String(employeeId);

  await upsertMultiTeam({
    one_employee_id: employeeId,
    roles:           roleTypeIds,
    teamIds,
    kpiRole,
    name,
    franchiseeId,
    crmToken,          // stored for future outgoing ONE CRM API calls
  });

  return await findByOneId(employeeId);
};

/**
 * Returns the team IDs a manager belongs to.
 * Source of truth: local cache (populated at login / 10-min sync).
 * Admins can query any manager; managers can only query themselves.
 *
 * @param {string|number} managerId   - ONE CRM EmployeeID to look up
 * @param {Object}        currentUser - req.user from authMiddleware
 * @returns {Promise<number[]>}
 */
export const getTeamsByManagerId = async (managerId, currentUser) => {
  if (
    currentUser.kpiRole === "KPI Manager" &&
    String(currentUser.id) !== String(managerId)
  ) {
    throw Object.assign(
      new Error("Forbidden: Managers can only view their own teams"),
      { status: 403 }
    );
  }

  // If the manager is the logged-in user, use the already-resolved teamIds from req.user
  if (String(currentUser.id) === String(managerId) && currentUser.teamIds?.length) {
    return currentUser.teamIds;
  }

  return findTeamIdsByManagerId(managerId);
};

/**
 * Returns all employees across all teams a manager belongs to.
 *
 * Source of truth: ONE CRM /getTeams API (not local cache) so results are
 * always complete regardless of who has logged in locally.
 * Each member is enriched with cached profile data where available.
 *
 * @param {string|number} managerId   - ONE CRM EmployeeID of the manager
 * @param {Object}        currentUser - req.user (includes .token and .teamIds)
 * @returns {Promise<Object[]>}
 */
export const getEmployeesByManagerId = async (managerId, currentUser) => {
  if (
    currentUser.kpiRole === "KPI Manager" &&
    String(currentUser.id) !== String(managerId)
  ) {
    throw Object.assign(
      new Error("Forbidden: Managers can only view their own employees"),
      { status: 403 }
    );
  }

  // Resolve the manager's team IDs
  const teamIds =
    String(currentUser.id) === String(managerId) && currentUser.teamIds?.length
      ? currentUser.teamIds
      : await findTeamIdsByManagerId(managerId);

  if (!teamIds.length) return [];

  // Fetch the full team roster from ONE CRM.
  // Priority: request-time oneToken → DB-stored crm_token (saved at last login).
  // Never use the KPI token — ONE CRM rejects it.
  const apiToken = await resolveCrmToken(currentUser, managerId);
  if (!apiToken) {
    throw Object.assign(
      new Error("ONE CRM token unavailable — please log in again to refresh your session"),
      { status: 401 }
    );
  }

  const teamsResponse = await getTeams({}, apiToken);
  const allTeams = Array.isArray(teamsResponse)
    ? teamsResponse
    : teamsResponse?.data ?? [];

  // Collect unique active members across the manager's teams, excluding the manager
  const memberMap = new Map(); // employeeId → member data

  for (const team of allTeams) {
    const teamId   = team.TeamID   ?? team.teamId;
    const teamName = team.TeamName ?? team.teamName ?? null;

    // Only process teams the manager belongs to
    if (!teamIds.map(String).includes(String(teamId))) continue;

    const members = team.TeamMembers ?? team.teamMembers ?? [];

    for (const member of members) {
      const empId = String(member.EmployeeID ?? member.employeeId ?? "");
      if (!empId || empId === String(managerId)) continue;

      // Skip inactive or disabled members
      if (member.IsActive === 0 || member.IsDisable === 1) continue;

      if (memberMap.has(empId)) {
        memberMap.get(empId).teamIds.push(teamId);
        memberMap.get(empId).teamNames.push(teamName);
      } else {
        memberMap.set(empId, {
          one_employee_id: empId,
          name:            member.EmployeeName ?? member.employeeName ?? null,
          roleName:        member.RoleName     ?? member.roleName     ?? null,
          roleId:          member.RoleID       ?? member.roleId       ?? null,
          franchiseeId:    member.FranchiseID  ?? member.franchiseId  ?? null,
          teamIds:         [teamId],
          teamNames:       [teamName],
        });
      }
    }
  }

  if (!memberMap.size) return [];

  // Enrich with local cache data (kpi_role etc.) where available
  const results = await Promise.all(
    [...memberMap.values()].map(async (member) => {
      const cached = await findByOneId(member.one_employee_id);
      return {
        one_employee_id: member.one_employee_id,
        name:            member.name             ?? cached?.name ?? null,
        kpi_role:        cached?.kpi_role         ?? null,
        franchisee_id:   member.franchiseeId      ?? cached?.franchisee_id ?? null,
        teamIds:         member.teamIds,
        teamNames:       member.teamNames,
        roleName:        member.roleName,
        roleId:          member.roleId,
        cached:          !!cached,
      };
    })
  );

  return results.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
};

/**
 * Lists employees with role-based scoping enforced by RBAC.
 *
 * KPI Manager: sees all executives across every team they belong to.
 * KPI Admin: unrestricted — respects query params only.
 *
 * @param {Object} query       - { role, teamId, franchiseeId }
 * @param {Object} currentUser - req.user populated by authMiddleware
 */
export const listEmployees = async (query = {}, currentUser) => {
  const filters = { ...query };

  if (currentUser.kpiRole === "KPI Manager") {
    // Manager scope: all teams the manager belongs to (PRD: per-employee, not per-team)
    filters.teamIds = currentUser.teamIds || [];
  }

  return await findAll(filters);
};
