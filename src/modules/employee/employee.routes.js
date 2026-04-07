import express from 'express';
import { getProfile, syncProfile, getEmployees, getManagerTeams, getManagerEmployees } from './employee.controller.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Own profile
router.get('/me',      authenticate, getProfile);
router.get('/me/sync', authenticate, syncProfile);

// List all employees (Admin + Manager)
router.get('/', authenticate, authorize('KPI Admin', 'KPI Manager'), getEmployees);

/**
 * GET /employees/manager/:managerId/teams
 * Returns all team IDs the manager belongs to.
 * Admin can query any manager; Manager can only query themselves.
 */
router.get('/manager/:managerId/teams',     authenticate, authorize('KPI Admin', 'KPI Manager'), getManagerTeams);

/**
 * GET /employees/manager/:managerId/employees
 * Returns all employees across all teams the manager belongs to.
 * Admin can query any manager; Manager can only query themselves.
 */
router.get('/manager/:managerId/employees', authenticate, authorize('KPI Admin', 'KPI Manager'), getManagerEmployees);

export default router;
