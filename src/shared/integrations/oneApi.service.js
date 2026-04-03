import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', 'config', '.env') });

const baseUrl = process.env.ONE_API_BASE_URL;
const verifyUrl = `${baseUrl}/auth/verify`;

/**
 * Verifies the JWT token with ONE CRM
 * @param {string} token - The Bearer token from the request
 * @returns {Promise<Object>} - User details including role, team, and franchisee
 */
export const verifyToken = async (token) => {
  try {
    const response = await axios.get(verifyUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    // Assuming ONE API returns { success: true, user: { id, role, teamId, franchiseeId, ... } }
    if (response.data && (response.data.success || response.status === 200)) {
      return response.data.user || response.data;
    }
    
    throw new Error('Token verification failed at ONE CRM');
  } catch (error) {
    console.error('ONE API Verification Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Unauthorized: Token verification failed');
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
        Authorization: `Bearer ${token}`
      }
    });

    return response.data;
  } catch (error) {
    console.error('ONE API Employee Fetch Error:', error.response?.data || error.message);
    return null;
  }
};
