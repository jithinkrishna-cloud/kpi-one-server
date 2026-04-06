import axios from "axios";
import { success, error } from "../../shared/utils/response.js";
import { syncFromLoginResponse } from "../employee/employee.service.js";
import { getTeams, getEmployees } from "../../shared/integrations/oneApi.service.js";
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
      throw new Error("Invalid response from ONE CRM: User data or token missing");
    }

    // 🚀 SYNC: Hydrate local cache and get KPI metadata
    const localUser = await syncFromLoginResponse(user);
    
    // 🏷️ SESSION: Create a dedicated KPI module token (Stateless JWT)
    const kpiToken = signKpiToken({
      ...localUser,
      kpiRole: localUser.role, // Assuming role is already mapped in syncFromLoginResponse
    });

    // 🍪 SET COOKIE: Store the local KPI token securely
    res.cookie("token", kpiToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return the combined identity to the client
    return res.status(response.status).json({
      ...response.data,
      kpiToken, // Expose for testing if needed
      role: localUser.role
    });
  } catch (err) {
    console.error("Login Proxy Error:", err.response?.data || err.message);
    const statusCode = err.response?.status || 500;
    const message = err.response?.data?.message || "Login failed via ONE CRM";
    return error(res, message, err.response?.data || null, statusCode);
  }
};

/**
 * Logout - Clears the authentication token cookie.
 */
export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

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

  return success(res, "User profile retrieved", {
    user: req.user,
  });
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
      teams: teams || [],
      employees: employees || [],
      scope: {
        currentRole: req.user.role,
        teamId: req.user.teamId,
        franchiseeId: req.user.franchiseeId
      }
    });
  } catch (err) {
    console.error("Org Context retrieval error:", err.message);
    return error(res, "Failed to retrieve organizational context", null, 500);
  }
};
