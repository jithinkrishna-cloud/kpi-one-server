import { verifyToken } from "../shared/integrations/oneApi.service.js";
import { getOrSyncEmployee } from "../modules/employee/employee.service.js";
import { error } from "../shared/utils/response.js";

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
  switch (kpiRole) {
    case "KPI Admin":
      return { type: "all" };
    case "KPI Manager":
      return { type: "team", teamId: user.team_id || user.TeamID };
    case "KPI Franchisee":
      return {
        type: "franchise",
        franchiseeId: user.franchisee_id || user.FranchiseID,
      };
    case "KPI Executive":
    default:
      return { type: "own", oneEmployeeId: user.id || user.one_employee_id };
  }
};

/**
 * Authentication Middleware
 * Verifies the token with ONE CRM and hydrates req.user with KPI roles and scopes.
 */
export const authenticate = async (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];

  console.log({ token });

  if (!token) {
    return error(res, "Unauthorized: No token provided", null, 401);
  }

  try {
    const decoded = await verifyToken(token);

    if (!decoded || !decoded.id) {
      return error(
        res,
        "Unauthorized: Invalid token payload",
        null,
        401,
      );
    }

    // Hydrate full profile from cache or ONE CRM
    // This ensures we have RoleName, TeamID, FranchiseID which might not be in the JWT.
    const userData = await getOrSyncEmployee(decoded.id, token);

    if (!userData) {
      return error(
        res,
        "Unauthorized: Could not retrieve user profile from ONE CRM",
        null,
        401,
      );
    }

    // Role mapping - assuming RoleName is available in userData after verification
    // Note: oneApi.service.js verifyToken returns response.data.user
    const oneRole =
      userData.role ||
      userData.RoleName ||
      "Executive";
    const kpiRole = mapRole(oneRole);

    // Store in request context
    req.user = {
      ...userData,
      kpiRole,
      scope: getScope(kpiRole, userData),
      token, // Pass through the token if needed for downstream API calls
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
