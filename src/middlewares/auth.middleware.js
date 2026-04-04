import { verifyToken } from "../shared/integrations/oneApi.service.js";
import { getOrSyncEmployee } from "../modules/employee/employee.service.js";
import { error } from "../shared/utils/response.js";
import { verifyKpiToken } from "../modules/auth/auth.service.js";

/**
 * Maps ONE roles to KPI roles
 * @param {string} oneRole
 * @returns {string} Mapped KPI role
 */
const mapRole = (oneRole) => {
  const roles = {
    Admin: "KPI Admin",
    Manager: "KPI Manager",
    Executive: "KPI Executive",
    Franchisee: "KPI Franchisee",
  };
  return roles[oneRole] || "KPI Executive"; // Default to KPI Executive
};

/**
 * Determines the data access scope based on the role
 * @param {string} kpiRole
 * @param {Object} user
 * @returns {Object} Scope and filter metadata
 */
const getScope = (kpiRole, user) => {
  const userId = user.id || user.one_employee_id;
  const teamId = user.teamId || user.team_id || user.TeamID;
  const franchiseeId = user.franchiseeId || user.franchisee_id || user.FranchiseID;

  switch (kpiRole) {
    case "KPI Admin":
      return { type: "all" };
    case "KPI Manager":
      return { type: "team", teamId };
    case "KPI Franchisee":
      return { type: "franchise", franchiseeId };
    case "KPI Executive":
    default:
      return { type: "own", oneEmployeeId: userId };
  }
};

/**
 * Authentication Middleware
 * Verifies the local KPI token (primary) or falls back to ONE CRM token.
 * Hydrates req.user with KPI roles and scopes.
 */
export const authenticate = async (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return error(res, "Unauthorized: No token provided", null, 401);
  }

  try {
    // 1. Try local KPI-JWT first (Stateless & Fast)
    const kpiDecoded = verifyKpiToken(token);
    
    if (kpiDecoded) {
      req.user = {
        ...kpiDecoded,
        kpiRole: kpiDecoded.role,
        token,
      };
      return next();
    }

    // 2. Fallback: Verify with ONE CRM (External or Legacy)
    const oneDecoded = await verifyToken(token);
    if (!oneDecoded || !oneDecoded.id) {
      return error(res, "Unauthorized: Invalid token", null, 401);
    }

    // Hydrate from cache/ONE to build a full KPI session
    const userData = await getOrSyncEmployee(oneDecoded.id, token);
    if (!userData) {
      return error(res, "Unauthorized: Profile sync failed", null, 401);
    }

    const kpiRole = mapRole(userData.role || userData.RoleName);
    
    req.user = {
      ...userData,
      kpiRole,
      scope: getScope(kpiRole, userData),
      token,
    };

    next();
  } catch (err) {
    console.error("Authentication Middleware Error:", err.message);
    return error(res, "Unauthorized: Token verification failed", null, 401);
  }
};

/**
 * Authorization Middleware
 * @param {...string} allowedRoles List of KPI roles allowed to access the route
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.kpiRole)) {
      return error(
        res,
        `Forbidden: ${req.user?.kpiRole || "Unknown role"} cannot perform this action`,
        null,
        403,
      );
    }
    next();
  };
};
