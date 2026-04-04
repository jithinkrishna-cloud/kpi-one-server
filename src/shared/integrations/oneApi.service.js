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
  EMPLOYEES: "/employees",
  TEAMS: "/teams",
  ROLES: "/roles",
  LEADS: "/leads",
  DEALS: "/deals",
  QUOTES: "/quotes",
  ORDERS: "/orders",
  SERVICES: "/services",
  CALLS: "/calls",
  MESSAGES: "/messages",
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

  return withRetry(async () => {
    const response = await axios(config);
    return response.data;
  }, 2); // 2 retries (total 3 attempts)
};

/**
 * Domain-Specific Wrappers
 */

// Employee/Org
export const getEmployees = (params, token) => 
  oneApiRequest(ENDPOINTS.EMPLOYEES, { method: "GET", params }, token);

export const getEmployeeById = (id, token) => 
  oneApiRequest(`${ENDPOINTS.EMPLOYEES}/${id}`, { method: "GET" }, token);

export const getTeams = (params, token) => 
  oneApiRequest(ENDPOINTS.TEAMS, { method: "GET", params }, token);

export const getRoles = (params, token) => 
  oneApiRequest(ENDPOINTS.ROLES, { method: "GET", params }, token);

// Sales
export const getLeads = (params, token) => 
  oneApiRequest(ENDPOINTS.LEADS, { method: "GET", params }, token);

export const getDeals = (params, token) => 
  oneApiRequest(ENDPOINTS.DEALS, { method: "GET", params }, token);

export const getQuotes = (params, token) => 
  oneApiRequest(ENDPOINTS.QUOTES, { method: "GET", params }, token);

export const getOrders = (params, token) => 
  oneApiRequest(ENDPOINTS.ORDERS, { method: "GET", params }, token);

// Engagement
export const getServices = (params, token) => 
  oneApiRequest(ENDPOINTS.SERVICES, { method: "GET", params }, token);

export const getCalls = (params, token) => 
  oneApiRequest(ENDPOINTS.CALLS, { method: "GET", params }, token);

export const getMessages = (params, token) => 
  oneApiRequest(ENDPOINTS.MESSAGES, { method: "GET", params }, token);
