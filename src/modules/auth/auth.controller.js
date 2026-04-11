import axios from "axios";
import { success, error } from "../../shared/utils/response.js";
import { syncFromLoginResponse } from "../employee/employee.service.js";
import {
  getTeams,
  getEmployees,
} from "../../shared/integrations/oneApi.service.js";
import { signKpiToken } from "./auth.service.js";

/**
 * Secure Auth Proxy for BIZPOLE ONE CRM
 * Delegates login directly to the main platform via its API.
 * Maps role and creates a local KPI module session.
 */
export const login = async (req, res) => {
  const { Username, Password } = req.body;

  if (!Username || !Password) {
    return error(res, "Username and Password are required", null, 400);
  }

  try {
    const loginUrl = `${process.env.ONE_API_BASE_URL}/login`;

    console.log(`🔗 Proxying login request to: ${loginUrl}`);

    // Proxy login to the main CRM
    const response = await axios.post(loginUrl, { Username, Password });

    const { user, token: oneToken } = response.data;
    if (!user || !oneToken) {
      throw new Error("Invalid response from ONE CRM: user or token missing");
    }

    // 🚀 SYNC: Persist all franchise roles + teams to the local cache
    // syncFromLoginResponse processes ALL franchiseeRoles entries so the DB row
    // has: one_employee_id (CRM id), roles (RoleTypeIds), team_ids, kpi_role, franchisee_id
    // Pass oneToken so it's stored in the DB cache for outgoing ONE CRM API calls
    const localUser = await syncFromLoginResponse(user, oneToken);
    if (!localUser) {
      throw new Error("Failed to sync user profile from ONE CRM response");
    }

    // 🏷️ SESSION: Create a dedicated KPI module token (Stateless JWT)
    // signKpiToken reads one_employee_id (not the internal DB id), kpi_role, team_ids.
    // No role re-mapping needed here — kpi_role is already correct in localUser.
    const kpiToken = signKpiToken(localUser);

    // 🍪 SET COOKIES
    // `token`     — KPI module JWT (signed with KPI_JWT_SECRET), used by this backend for auth
    // `one_token` — Original ONE CRM token (signed with ONE_JWT_SECRET), used to proxy ONE CRM API calls
    const cookieOpts = {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    };
    res.cookie("token",     kpiToken, cookieOpts);
    res.cookie("one_token", oneToken, cookieOpts);

    // Return the combined identity to the client
    return res.status(response.status).json({
      ...response.data,
      kpiToken,
      kpiRole: localUser.kpi_role,
    });
  } catch (err) {
    // err.response exists  → axios error from ONE CRM (wrong credentials, network, etc.)
    // err.response missing → internal error (mapping, DB, JWT secret missing, etc.)
    console.error("Login Error:", err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    const message    = err.response?.data?.message || err.message || "Login failed";
    return error(res, message, err.response?.data || null, statusCode);
  }
};

/**
 * Logout - Clears the authentication token cookie.
 */
export const logout = (req, res) => {
  const cookieOpts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
  };
  res.clearCookie("token",     cookieOpts);
  res.clearCookie("one_token", cookieOpts);
  return success(res, "Logout successful");
};

/**
 * Get Current User Profile
 * Returns the hydrated user object from the request context.
 */
export const getMe = (req, res) => {
  if (!req.user) {
    return error(res, "User identity not found in context", null, 404);
  }

  // Omit token/oneToken — they live in httpOnly cookies, no need to expose in body
  const { token, oneToken, ...safeUser } = req.user;
  return success(res, "User profile retrieved", { user: safeUser });
};

/**
 * Get Organizational Context
 * Returns team hierarchy and role scope for the current user.
 * Consolidated from the ONE platform APIs.
 */
export const getOrgContext = async (req, res) => {
  // Extract token from cookie or Authorization header
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];

  try {
    // Fetch Teams and Employees in parallel for efficiency
    // Note: filterEmployeesByRole requires at least one filter, so we use getEmployees instead
    const [teams, employees] = await Promise.all([
      getTeams({}, token),
      getEmployees({}, token),
    ]);

    return success(res, "Organizational context retrieved", {
      teams:     teams     || [],
      employees: employees || [],
      scope: {
        kpiRole:      req.user.kpiRole,
        teamIds:      req.user.teamIds,
        franchiseeId: req.user.franchiseeId,
      },
    });
  } catch (err) {
    console.error("Org Context retrieval error:", err.message);
    return error(res, "Failed to retrieve organizational context", null, 500);
  }
};
