import { refreshCache } from './employee.service.js';
import { success, error } from '../../shared/utils/response.js';

/**
 * Manual refresh of the logged-in user's metadata from ONE CRM
 */
export const syncProfile = async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const result = await refreshCache(req.user.id, token);
    
    if (result) {
      return success(res, 'Profile metadata synced from ONE CRM');
    }
    return error(res, 'Failed to sync metadata from CRM', null, 500);
  } catch (err) {
    return error(res, err.message, null, 500);
  }
};

/**
 * Returns the current user's profile metadata from cache
 */
export const getProfile = async (req, res) => {
  return success(res, 'Current profile retrieved', req.user);
};
