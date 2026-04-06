import { findByOneId, upsert, findAll } from "./employee.repository.js";
import { getEmployeeById } from "../../shared/integrations/oneApi.service.js";

/**
 * Shared Helper: Selects the primary franchise role from the CRM response.
 * Prefer 'isPrimary' or 'isDefault' if available.
 */
const selectPrimaryRole = (roles) => {
  if (!roles || roles.length === 0) return {};
  return roles.find((r) => r.isPrimary || r.isDefault) || roles[0];
};

// Admin role names as returned by ONE CRM — these users are cross-team (no TeamID required)
const ADMIN_ROLES = ["Admin", "Bizpole Admin", "Super Admin"];

/**
 * Shared Helper: Maps raw CRM user data to our local Employee Cache structure.
 * Handles both Login ('franchiseeRoles') and API ('Franchisees') formats.
 */
const mapCrmUserToEmployee = (userData, isStrict = true) => {
  if (!userData || (!userData.id && !userData.EmployeeID)) return null;

  const roles =
    userData.franchiseeRoles || userData.Franchisees || userData.metadata || [];
  const primaryRole = selectPrimaryRole(roles);

  const roleName = primaryRole.RoleName || userData.RoleName || userData.role || "";
  const isAdmin  = ADMIN_ROLES.includes(roleName);

  // TeamID is required for Managers/Executives so they are scoped to their team.
  // Admins are cross-team — they have no TeamID and that is expected.
  if (isStrict && !isAdmin && !primaryRole.TeamID) {
    throw new Error(
      `Invalid CRM mapping: Missing TeamID for user ${userData.id || userData.EmployeeID} (role: ${roleName || "unknown"})`,
    );
  }

  return {
    id: userData.id || userData.EmployeeID,
    name: userData.username || userData.EmployeeName || userData.name || "",
    role: roleName || "Employee",
    franchiseeId: primaryRole.FranchiseID || null,
    teamId: primaryRole.TeamID || null,
    metadata: roles,
  };
};

/**
 * Retrieves an employee from cache, or fetches and caches if missing/stale.
 * @param {string} employeeId - ONE CRM internal ID
 * @param {string} token - Bearer token for remote fetch
 * @returns {Promise<Object>}
 */
export const getOrSyncEmployee = async (employeeId, token) => {
  const cached = await findByOneId(employeeId);

  // PRD Section 10: TTL is 1 hour
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const isStale =
    cached && new Date() - new Date(cached.cached_at) > CACHE_TTL_MS;

  if (cached && !isStale) {
    return cached;
  }

  try {
    // Fetch fresh data from ONE CRM
    const freshData = await getEmployeeById(employeeId, token);

    if (freshData) {
      const employeeObject = mapCrmUserToEmployee(freshData, false); // Background sync is not strict
      await upsert(employeeObject);
      return await findByOneId(employeeId);
    }
    return cached;
  } catch (err) {
    console.error(
      `❌ getOrSyncEmployee Critical Error for ID ${employeeId}:`,
      err.message,
    );
    return cached; // Fallback to stale on error
  }
};

/**
 * Manual trigger to refresh the employee data
 */
export const refreshCache = async (employeeId, token) => {
  const freshData = await getEmployeeById(employeeId, token);
  if (freshData) {
    const employeeObject = mapCrmUserToEmployee(freshData, false); // Manual refresh is not strict
    await upsert(employeeObject);
    return true;
  }
  return false;
};

/**
 * Direct sync from the CRM login response.
 * @param {Object} userData - The 'user' object from CRM login response
 */
export const syncFromLoginResponse = async (userData) => {
  const employeeObject = mapCrmUserToEmployee(userData);
  if (!employeeObject) return null;

  await upsert(employeeObject);
  return await findByOneId(userData.id);
};

/**
 * Lists employees with role-based scoping
 * @param {Object} query - { role, teamId, franchiseeId }
 * @param {Object} currentUser - The req.user from JWT
 */
export const listEmployees = async (query = {}, currentUser) => {
  const filters = { ...query };

  // RBAC Enforcement (System-wide Logic)
  // KPI Manager: Strictly isolated to their own team
  if (currentUser.role === "KPI Manager" || currentUser.role === "Sales TL") {
    filters.teamId = currentUser.teamId;
  }

  // KPI Admin: Can see everything, respect query params from dashboard
  return await findAll(filters);
};
