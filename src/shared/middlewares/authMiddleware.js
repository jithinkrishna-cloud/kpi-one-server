import jwt from 'jsonwebtoken';
import { verifyToken } from '../integrations/oneApi.service.js';
import { getOrSyncEmployee } from '../../modules/employee/employee.service.js';
import { error } from '../utils/response.js';

/**
 * Maps ONE CRM roles to KPI Module Roles
 */
const mapRole = (oneRole) => {
  const roles = {
    'Admin': 'KPI Admin',
    'Bizpole Admin': 'KPI Admin',
    'Manager': 'KPI Manager',
    'Team Lead': 'KPI Manager',
    'Franchisee': 'KPI Franchisee',
    'Franchisee Admin': 'KPI Franchisee',
    'BDE': 'KPI Executive',
    'CRE': 'KPI Executive',
    'Operations Executive': 'KPI Executive',
  };

  return roles[oneRole] || 'KPI Executive';
};

const authMiddleware = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    // Check for token in Authorization header (standard) or cookies (new)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return error(res, 'Authorization token is required (header or cookie)', null, 401);
    }
    let userId;

    // --- STEP 1: TOKEN VERIFICATION (Local Shared Secret) ---
    // We trust the token signature locally using ONE_JWT_SECRET.
    // Remote verification (/auth/verify) is not used.
    try {
      const secret = process.env.ONE_JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      
      // Extract userId from your platform's specific payload (userId, id, or _id)
      userId = decoded.userId || decoded.id || decoded._id;
      
      if (!userId) {
        return error(res, 'Unauthorized: Token payload is missing User ID', null, 401);
      }

      console.log(`✅ Local JWT verified for User ID: ${userId}`);
    } catch (err) {
      console.error('❌ JWT Verification Failed:', err.message);
      return error(res, 'Unauthorized: Invalid or expired token', null, 401);
    }

    // --- STEP 2: METADATA ENRICHMENT (Fetch/Cache Employee Profile) ---
    // Since the token payload is minimal, we ALWAYS fetch/sync the full profile from ONE API
    // to get the correct 'role', 'teamId', and 'franchiseeId'.
    const employeeData = await getOrSyncEmployee(userId, token);

    if (!employeeData) {
      return error(res, 'Internal Error: Could not retrieve or cache user metadata from ONE CRM', null, 500);
    }

    // --- STEP 3: ROLE MAPPING & REQUEST POPULATION ---
    req.user = {
      ...employeeData,
      id: employeeData.one_employee_id, // Normalize to CRM ID
      kpiRole: mapRole(employeeData.role),
    };

    next();
  } catch (err) {
    console.error('Auth Middleware Fault:', err.message);
    return error(res, err.message || 'Unauthorized: Token verification failed', null, 401);
  }
};

export default authMiddleware;
