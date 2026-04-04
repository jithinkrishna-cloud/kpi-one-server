import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", "config", ".env") });

const baseUrl = process.env.ONE_API_BASE_URL;

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
 * Fetches full employee details from ONE CRM
 * @param {string} employeeId - ONE CRM internal ID
 * @param {string} token - Bearer token for auth
 */
export const getEmployeeById = async (employeeId, token) => {
  try {
    const response = await axios.get(`${baseUrl}/employees/${employeeId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error(
      "ONE API Employee Fetch Error:",
      error.response?.data || error.message,
    );
    return null;
  }
};
