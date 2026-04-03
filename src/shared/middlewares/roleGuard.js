import { error } from '../utils/response.js';

/**
 * Checks if the user's role is allowed to access the route
 * @param {string[]} roles - Array of allowed KPI Role levels
 * @returns {Array<Middleware>} - Middleware function array
 */
const roleGuard = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.kpiRole) {
      return error(res, 'Unauthorized: Access token missing or invalid', null, 401);
    }

    if (roles.length && !roles.includes(req.user.kpiRole)) {
      return error(res, 'Forbidden: You do not have permission to access this resource', null, 403);
    }

    next();
  };
};

export default roleGuard;
