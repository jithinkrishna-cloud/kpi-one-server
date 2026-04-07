/**
 * KPI Role Mapper — Single Source of Truth
 *
 * PRD roles:
 *   Admin / Bizpole Admin / Super Admin   → KPI Admin    (RoleTypeId 1)
 *   Manager / Team Lead / Sales TL / Operation TL → KPI Manager  (RoleTypeId 2)
 *   Everything else                       → KPI Executive (RoleTypeId 3)
 *
 * Two mapping paths:
 *   A. Login path  — we only have CRM RoleNames  → name → RoleTypeId → KPI role
 *   B. Sync path   — we have RoleTypeIds from /getRoles API → directly → KPI role
 *
 * Priority order: Admin (1) > Manager (2) > Executive (3)
 */

/** Maps CRM role name → RoleTypeId. Unknown names default to 3 (Executive). */
const ROLE_NAME_TO_TYPE_ID = {
  "Admin":          1,
  "Bizpole Admin":  1,
  "Super Admin":    1,
  "Manager":        2,
  "Team Lead":      2,
  "Sales TL":       2,
  "Operation TL":   2,
};

/**
 * Converts a CRM role name to a RoleTypeId.
 * @param {string} roleName
 * @returns {number} 1 | 2 | 3
 */
export const roleNameToTypeId = (roleName = "") =>
  ROLE_NAME_TO_TYPE_ID[roleName] ?? 3;

/**
 * Derives the highest-privilege KPI role from an array of RoleTypeIds.
 * This is the canonical role resolution function — use for BOTH login and sync paths.
 *
 * @param {number[]} roleTypeIds
 * @returns {"KPI Admin" | "KPI Manager" | "KPI Executive"}
 */
export const mapKpiRole = (roleTypeIds = []) => {
  if (roleTypeIds.includes(1)) return "KPI Admin";
  if (roleTypeIds.includes(2)) return "KPI Manager";
  return "KPI Executive";
};

/**
 * Derives the KPI role and RoleTypeIds from a franchiseeRoles array (login response).
 * Scans ALL team memberships so multi-team users get their highest privilege.
 *
 * @param {Object[]} franchiseeRoles  - CRM login response array
 * @returns {{ kpiRole: string, roleTypeIds: number[], teamIds: any[], franchiseeId: any }}
 */
export const resolveFromFranchiseeRoles = (franchiseeRoles = []) => {
  const typeIdSet = new Set();
  const teamIdSet = new Set();
  let franchiseeId = null;

  for (const entry of franchiseeRoles) {
    const roleName = entry.RoleName || entry.roleName || "";
    typeIdSet.add(roleNameToTypeId(roleName));

    const tid = entry.TeamID ?? entry.teamId;
    if (tid !== undefined && tid !== null) teamIdSet.add(tid);

    // Use the first FranchiseID found (they should all be the same org)
    if (!franchiseeId) {
      franchiseeId = entry.FranchiseID ?? entry.franchiseId ?? null;
    }
  }

  const roleTypeIds = [...typeIdSet];
  const teamIds     = [...teamIdSet];
  const kpiRole     = mapKpiRole(roleTypeIds);

  return { kpiRole, roleTypeIds, teamIds, franchiseeId };
};
