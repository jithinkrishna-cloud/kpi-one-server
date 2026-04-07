import { refreshCache, listEmployees, getTeamsByManagerId, getEmployeesByManagerId } from './employee.service.js';
import { success, error } from '../../shared/utils/response.js';

/**
 * Manual refresh of the logged-in user's metadata from ONE CRM
 */
export const syncProfile = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const result = await refreshCache(req.user.id, token);
    
    if (result) {
      return success(res, 'Profile metadata synced from ONE CRM');
    }
    return error(res, 'Failed to sync metadata from CRM', null, 500);
  } catch (err) {
    return error(res, err.message, null, 500);
  }
};

/**
 * Returns the current user's profile metadata from cache
 */
export const getProfile = async (req, res) => {
  return success(res, 'Current profile retrieved', req.user);
};

/**
 * Returns a list of employees based on filters and RBAC scope
 */
export const getEmployees = async (req, res) => {
  try {
    const filters = {
      role: req.query.role,
      teamId: req.query.teamId,
      franchiseeId: req.query.franchiseeId
    };

    const employees = await listEmployees(filters, req.user);
    return success(res, 'Employees retrieved successfully', employees);
  } catch (err) {
    return error(res, err.message, null, 500);
  }
};

/**
 * GET /employees/manager/:managerId/teams
 * Returns all team IDs the given manager belongs to.
 * Admin: can query any manager.
 * Manager: can only query themselves.
 */
export const getManagerTeams = async (req, res) => {
  try {
    const teamIds = await getTeamsByManagerId(req.params.managerId, req.user);
    return success(res, 'Teams retrieved successfully', { managerId: req.params.managerId, teamIds });
  } catch (err) {
    return error(res, err.message, null, err.status || 500);
  }
};

/**
 * GET /employees/manager/:managerId/employees
 * Returns all employees across every team the given manager belongs to.
 * Admin: can query any manager.
 * Manager: can only query themselves.
 */
export const getManagerEmployees = async (req, res) => {
  try {
    const employees = await getEmployeesByManagerId(req.params.managerId, req.user);
    return success(res, 'Employees retrieved successfully', { managerId: req.params.managerId, employees });
  } catch (err) {
    return error(res, err.message, null, err.status || 500);
  }
};
