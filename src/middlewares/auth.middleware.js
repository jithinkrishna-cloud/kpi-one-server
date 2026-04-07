import { verifyToken } from "../shared/integrations/oneApi.service.js";
import { getOrSyncEmployee } from "../modules/employee/employee.service.js";
import { error } from "../shared/utils/response.js";
import { verifyKpiToken } from "../modules/auth/auth.service.js";
import { mapKpiRole } from "../shared/utils/kpiRoleMapper.js";

/**
 * Builds the RBAC data-access scope for the current user.
 * Used by controllers to scope DB queries without repeating logic.
 *
 * Manager scope now includes ALL teams they belong to (multi-team PRD rule).
 */
const getScope = (kpiRole, user) => {
  switch (kpiRole) {
    case "KPI Admin":
      return { type: "all" };
    case "KPI Manager":
      // Managers see every executive across all their teams
      return { type: "team", teamIds: user.teamIds || [] };
    case "KPI Executive":
    default:
      return { type: "own", oneEmployeeId: user.id };
  }
};

/**
 * Authentication Middleware
 *
 * Flow:
 *   1. Extract token from Authorization header or cookie
 *   2. Verify as KPI token (fast local check) — extract userId only
 *      OR verify as ONE CRM token (fallback)
 *   3. Always re-fetch employee data from cache/ONE API
 *      → Ensures role is NEVER taken blindly from a potentially stale token
 *      → Cache TTL is 10 min so this is cheap
 *   4. Build req.user from fresh DB data
 *
 * req.user shape:
 *   {
 *     id:           200,             ← ONE CRM EmployeeID (never internal DB pk)
 *     name:         "Suma",
 *     kpiRole:      "KPI Manager",   ← highest-privilege, derived from all teams
 *     roles:        [2],             ← RoleTypeIds
 *     teamIds:      [9, 29],         ← all TeamIDs
 *     franchiseeId: "1",
 *     scope:        { type, teamIds }
 *   }
 */
export const authenticate = async (req, res, next) => {
  const token =
    req.cookies?.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return error(res, "Unauthorized: No token provided", null, 401);
  }

  // ONE CRM token — needed to proxy calls to ONE CRM APIs (e.g. /getTeams).
  // Stored in a separate `one_token` cookie at login, or passed via X-One-Token header.
  // This is distinct from `token` (KPI JWT) which is only valid within this backend.
  const oneToken =
    req.cookies?.one_token ||
    req.headers["x-one-token"] ||
    null;

  try {
    // --- Step 1: Identify the user from the token (do NOT trust payload role) ---
    let oneEmployeeId;

    const kpiDecoded = verifyKpiToken(token);
    if (kpiDecoded) {
      // KPI token verified — use id as the CRM EmployeeID
      // After the signKpiToken fix, token.id = one_employee_id (CRM id)
      oneEmployeeId = kpiDecoded.id;
    } else {
      // Fallback: try ONE CRM token
      const oneDecoded = await verifyToken(token);
      if (!oneDecoded?.id) {
        return error(res, "Unauthorized: Invalid or expired token", null, 401);
      }
      oneEmployeeId = oneDecoded.id;
    }

    if (!oneEmployeeId) {
      return error(res, "Unauthorized: Token is missing a User ID", null, 401);
    }

    // --- Step 2: Always load fresh employee data from cache / ONE CRM ---
    // PRD: DO NOT trust token role blindly — re-derive from latest data.
    // Pass the ONE CRM token for any live API calls inside getOrSyncEmployee.
    // If oneToken is unavailable (e.g. first request before re-login), fall back to token.
    const employee = await getOrSyncEmployee(oneEmployeeId, oneToken || token);
    if (!employee) {
      return error(res, "Unauthorized: Employee profile not found", null, 401);
    }

    // --- Step 3: Build req.user from DB record ---
    const roles   = Array.isArray(employee.roles)    ? employee.roles    : [];
    const teamIds = Array.isArray(employee.team_ids) ? employee.team_ids : [];

    // kpi_role is pre-derived and stored during sync. Recompute as safety fallback.
    const kpiRole = employee.kpi_role || mapKpiRole(roles);

    req.user = {
      id:           String(employee.one_employee_id), // ONE CRM EmployeeID — identity
      name:         employee.name,
      kpiRole,                                        // "KPI Admin" | "KPI Manager" | "KPI Executive"
      roles,                                          // [1] | [2] | [3] | [1,2] etc.
      teamIds,                                        // [9, 29]
      franchiseeId: employee.franchisee_id || null,
      scope:        getScope(kpiRole, { id: String(employee.one_employee_id), teamIds }),
      token,                                          // KPI token — for internal KPI auth only
      oneToken,                                       // ONE CRM token — for proxying ONE API calls
    };

    console.log(
      `🔐 Auth: id=${req.user.id} | ${kpiRole} | teams=[${teamIds}]`
    );

    next();
  } catch (err) {
    console.error("Authentication Middleware Error:", err.message);
    return error(res, "Unauthorized: Token verification failed", null, 401);
  }
};

/**
 * Authorization Middleware
 *
 * PRD Rule: KPI Admin has full access and bypasses all role restrictions.
 * Other roles must be explicitly listed in allowedRoles.
 *
 * @param {...string} allowedRoles - KPI roles permitted for this route
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user?.kpiRole) {
      return error(res, "Unauthorized: No role found on request", null, 401);
    }

    // Admin bypasses all role restrictions — PRD: full access
    if (req.user.kpiRole === "KPI Admin") return next();

    if (!allowedRoles.includes(req.user.kpiRole)) {
      return error(
        res,
        `Forbidden: ${req.user.kpiRole} does not have permission for this action`,
        null,
        403,
      );
    }

    next();
  };
};
