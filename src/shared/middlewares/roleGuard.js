import { error } from '../utils/response.js';

/**
 * Role-based access guard.
 *
 * PRD Rule: KPI Admin has full access and bypasses all role restrictions.
 * Other roles must be explicitly listed in the allowed array.
 *
 * @param {string[]} roles - Allowed KPI role names for this route
 */
const roleGuard = (roles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.kpiRole) {
      return error(res, 'Unauthorized: Access token missing or invalid', null, 401);
    }

    // Admin bypasses all role restrictions — PRD: full access to all actions
    if (req.user.kpiRole === 'KPI Admin') return next();

    if (roles.length && !roles.includes(req.user.kpiRole)) {
      return error(res, `Forbidden: ${req.user.kpiRole} does not have permission for this action`, null, 403);
    }

    next();
  };
};

export default roleGuard;
