import { success } from '../../shared/utils/response.js';

export const getStatus = (req, res) => {
  return success(res, 'KPI Module Backend is Running (ESM)', {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
