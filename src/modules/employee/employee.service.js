import { findByOneId, upsert } from './employee.repository.js';
import { getEmployeeById } from '../../shared/integrations/oneApi.service.js';

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
  const isStale = cached && (new Date() - new Date(cached.cached_at)) > CACHE_TTL_MS;

  if (cached && !isStale) {
    return cached;
  }

  // Fetch fresh data from ONE CRM
  const freshData = await getEmployeeById(employeeId, token);
  
  if (freshData) {
    // Upsert into local cache
    await upsert(freshData);
    return await findByOneId(employeeId);
  }

  return cached; // Fallback to stale if remote fails
};

/**
 * Manual trigger to refresh the employee data
 */
export const refreshCache = async (employeeId, token) => {
  const freshData = await getEmployeeById(employeeId, token);
  if (freshData) {
    await upsert(freshData);
    return true;
  }
  return false;
};

/**
 * Direct sync from the CRM login response.
 * Maps the complex multi-franchise object to our local cache columns.
 * @param {Object} userData - The 'user' object from CRM login response
 */
export const syncFromLoginResponse = async (userData) => {
  if (!userData || !userData.id) return null;

  // Map the first role as the "Primary" for legacy single-column queries
  const primaryRole = userData.franchiseeRoles?.[0] || {};

  const employeeObject = {
    id: userData.id,
    name: userData.username || "", 
    role: primaryRole.RoleName || "Employee",
    franchiseeId: primaryRole.FranchiseID || null,
    teamId: primaryRole.TeamID || null,
    metadata: userData.franchiseeRoles || [], // Complete array of all roles/permissions
  };

  await upsert(employeeObject);
  return await findByOneId(userData.id);
};
