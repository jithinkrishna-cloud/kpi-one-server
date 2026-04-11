import jwt from "jsonwebtoken";
import { getOrSyncEmployee, mapKpiRole } from "../../modules/employee/employee.service.js";
import { error } from "../utils/response.js";

/**
 * Authentication & Employee Sync Middleware
 *
 * PRD Flow:
 *   1. Extract Bearer token from Authorization header or cookie
 *   2. Verify JWT locally using ONE_JWT_SECRET (shared secret — no remote call)
 *   3. Extract userId from token payload
 *   4. Call getOrSyncEmployee(userId, token):
 *        → GET /getTeams (scan all teams for userId's memberships)
 *        → GET /getRoles (build RoleID → RoleTypeId map)
 *        → Deduplicate RoleTypeIds and TeamIDs
 *        → Derive KPI role via mapKpiRole (highest privilege wins)
 *   5. Attach to req.user:
 *        { id, roles, kpiRole, teamIds, name, franchiseeId }
 *
 * PRD Rules:
 *   - NEVER depend on RoleName for role logic
 *   - ALWAYS use RoleTypeId (1=Admin, 2=Manager, 3=Executive)
 *   - One employee can belong to multiple teams — teamIds is an array
 *   - KPI role is derived by priority: Admin > Manager > Executive
 */
const authMiddleware = async (req, res, next) => {
  try {
    // --- STEP 1: Extract token ---
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return error(
        res,
        "Authorization token is required (Authorization header or cookie)",
        null,
        401
      );
    }

    // --- STEP 2: Verify JWT — try KPI secret first, fall back to ONE secret ---
    let userId;
    try {
      const kpiSecret = process.env.KPI_JWT_SECRET;
      const oneSecret = process.env.ONE_JWT_SECRET;

      let decoded = null;

      // Prefer KPI token (issued by this backend at login)
      if (kpiSecret) {
        try {
          decoded = jwt.verify(token, kpiSecret);
        } catch (_) {
          // Not a KPI token — try ONE CRM token next
        }
      }

      // Fallback: ONE CRM token (used for direct API proxying)
      if (!decoded && oneSecret) {
        decoded = jwt.verify(token, oneSecret);
      }

      if (!decoded) {
        throw new Error("Token could not be verified with any known secret");
      }

      // KPI tokens use `id`; ONE CRM tokens may use userId, id, or _id
      userId = decoded.id || decoded.userId || decoded._id;

      if (!userId) {
        return error(
          res,
          "Unauthorized: Token payload is missing a User ID",
          null,
          401
        );
      }

      console.log(`✅ JWT verified for userId: ${userId}`);
    } catch (err) {
      console.error("❌ JWT Verification failed:", err.message);
      return error(res, "Unauthorized: Invalid or expired token", null, 401);
    }

    // --- STEP 3: Sync employee from ONE CRM via /getTeams + /getRoles ---
    // Cache TTL = 10 minutes (PRD). Falls back to stale cache on API error.
    const employeeData = await getOrSyncEmployee(userId, token);

    if (!employeeData) {
      return error(
        res,
        "Internal Error: Could not retrieve employee profile from ONE CRM",
        null,
        500
      );
    }

    // --- STEP 4: Populate req.user ---
    // roles    = unique RoleTypeIds across all teams  e.g. [1, 2]
    // teamIds  = unique TeamIDs the employee belongs to  e.g. [26, 23]
    // kpiRole  = highest-privilege KPI role string
    const roles   = Array.isArray(employeeData.roles)    ? employeeData.roles    : [];
    const teamIds = Array.isArray(employeeData.team_ids) ? employeeData.team_ids : [];
    const kpiRole = employeeData.kpi_role || mapKpiRole(roles);

    req.user = {
      id:           String(employeeData.one_employee_id),
      name:         employeeData.name,
      roles,        // [1, 2]  — RoleTypeIds
      kpiRole,      // "KPI Manager"  — highest-privilege role
      teamIds,      // [26, 23] — all teams the employee belongs to
      franchiseeId: employeeData.franchisee_id || null,
    };

    console.log(
      `🔐 req.user set: id=${req.user.id} | kpiRole=${kpiRole} | teams=[${teamIds}]`
    );

    next();
  } catch (err) {
    console.error("Auth Middleware fault:", err.message);
    return error(
      res,
      err.message || "Unauthorized: Authentication failed",
      null,
      401
    );
  }
};

export default authMiddleware;
