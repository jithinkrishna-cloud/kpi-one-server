import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { withRetry } from "../utils/retry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", "config", ".env") });

const baseUrl = process.env.ONE_API_BASE_URL;

const ENDPOINTS = {
  // Identity & Org
  EMPLOYEES: "/getEmployees",
  EMPLOYEE_DETAIL: "/getEmployeeById",
  SALES_EMPLOYEES: "/sales-employees",
  TEAMS: "/getTeams",
  ROLES: "/filterEmployeesByRole",

  // Leads (Phase F12-B)
  LEADS: "/lead-generation/getleads",
  LEAD_STATS: "/lead-generation/lead-stats",

  // Revenue (Phase F12-B)
  DEALS: "/getdeals",
  DEAL_WIDGETS: "/getwidgets",
  ORDERS: "/orderlist",
  ORDER_METRICS: "/ordermetrics",

  // Activity Feed
  CALLYSER: "/api/callyser/calls",
  INTERAKT: "/api/interakt/messages",
};

/**
 * Verifies the JWT token locally using the shared ONE_JWT_SECRET
 * @param {string} token - The Bearer token from the request
 * @returns {Promise<Object>} - Decoded JWT payload
 */
export const verifyToken = async (token) => {
  try {
    const secret = process.env.ONE_JWT_SECRET;
    if (!secret) {
      throw new Error("ONE_JWT_SECRET is not defined in .env");
    }

    // Verify the token locally
    const decoded = jwt.verify(token, secret);

    // CRM Tokens usually have userId or id. Standardizing to common fields.
    return {
      ...decoded,
      id: decoded.userId || decoded.id,
      username: decoded.username || decoded.name,
    };
  } catch (error) {
    console.error("Local Token Verification Error:", error.message);
    throw new Error("Unauthorized: Token verification failed");
  }
};

/**
 * Generic request handler for ONE CRM APIs with retry logic.
 * @param {string} endpoint - Relative path (e.g., /leads)
 * @param {Object} options - axios options (headers, params, data, method)
 * @param {string} token - Bearer token
 * @returns {Promise<any>}
 */
export const oneApiRequest = async (endpoint, options = {}, token = null) => {
  const url = `${baseUrl}${endpoint}`;
  const config = {
    ...options,
    url,
    headers: {
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  };

  try {
    return await withRetry(async () => {
      const response = await axios(config);
      return response.data;
    }, 2);
  } catch (error) {
    console.error(
      `❌ ONE API Error [${options.method || "GET"}] ${url}:`,
      error.message,
    );
    throw error;
  }
};

/**
 * Domain-Specific Wrappers
 */

// Employee/Org
export const getEmployees = (params, token) =>
  oneApiRequest(ENDPOINTS.EMPLOYEES, { method: "GET", params }, token);

export const getEmployeeById = (id, token) =>
  oneApiRequest(`${ENDPOINTS.EMPLOYEE_DETAIL}/${id}`, { method: "GET" }, token);

export const getTeams = (params, token) =>
  oneApiRequest(ENDPOINTS.TEAMS, { method: "GET", params }, token);

export const getSalesEmployees = (params, token) =>
  oneApiRequest(ENDPOINTS.SALES_EMPLOYEES, { method: "GET", params }, token);

export const getRoles = (data, token) =>
  oneApiRequest(ENDPOINTS.ROLES, { method: "POST", data }, token);

// Sales/KPIs
export const getLeads = (data, token) =>
  oneApiRequest(ENDPOINTS.LEADS, { method: "POST", data }, token);

export const getDeals = (data, token) =>
  oneApiRequest(ENDPOINTS.DEALS, { method: "POST", data }, token);

export const getOrders = (data, token) =>
  oneApiRequest(ENDPOINTS.ORDERS, { method: "POST", data }, token);

export const getOrderMetrics = (token) =>
  oneApiRequest(ENDPOINTS.ORDER_METRICS, { method: "GET" }, token);

// Engagement/Communications
export const getCallLogs = (params, token) =>
  oneApiRequest(ENDPOINTS.CALLYSER, { method: "GET", params }, token);

export const getMessageLogs = (params, token) =>
  oneApiRequest(ENDPOINTS.INTERAKT, { method: "GET", params }, token);
