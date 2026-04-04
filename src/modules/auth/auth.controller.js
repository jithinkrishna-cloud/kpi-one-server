import axios from 'axios';
import { success, error } from '../../shared/utils/response.js';
import { syncFromLoginResponse } from '../employee/employee.service.js';

/**
 * Secure Auth Proxy for BIZPOLE ONE CRM
 * Delegates login directly to the main platform via its API.
 * Ensures 100% compatibility with CRM tokens and roles.
 */
export const login = async (req, res) => {
  const { Username, Password } = req.body;

  if (!Username || !Password) {
    return error(res, 'Username and Password are required', null, 400);
  }

  try {
    const loginUrl = `${process.env.ONE_API_BASE_URL}/login`;
    
    console.log(`🔗 Proxying login request to: ${loginUrl}`);

    // Forward credentials exactly as the main CRM expects (Capitalized)
    const response = await axios.post(loginUrl, {
      Username,
      Password
    });

    // 🚀 IMMEDIATE SYNC: Populate the local cache using the data from the login response.
    // This allows the KPI module to have full role/permission metadata instantly.
    const { user, token } = response.data;
    if (user) {
      syncFromLoginResponse(user).catch(err => {
        console.error('⚠️ Background Profile Sync Failed:', err.message);
      });
    }

    // 🍪 SET COOKIE: Store the token in an httpOnly cookie for better security.
    if (token) {
      res.cookie('token', token, {
        httpOnly: true, // Prevents XSS access to the token
        secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
        sameSite: 'strict', // Strong CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    // Forward the exact CRM response (token, user metadata, franchiseeRoles)
    return res.status(response.status).json(response.data);

  } catch (err) {
    console.error('Login Proxy Error:', err.response?.data || err.message);
    
    const statusCode = err.response?.status || 500;
    const message = err.response?.data?.message || 'Login failed via ONE CRM';
    
    return error(res, message, err.response?.data || null, statusCode);
  }
};

/**
 * Logout - Clears the authentication token cookie.
 */
export const logout = (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  
  return success(res, 'Logout successful');
};
