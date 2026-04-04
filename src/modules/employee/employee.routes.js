import express from 'express';
import { getProfile, syncProfile, getEmployees } from './employee.controller.js';
import authMiddleware from '../../shared/middlewares/authMiddleware.js';
import roleGuard from '../../shared/middlewares/roleGuard.js';

const router = express.Router();

// Protected: Only logged-in users can see their own profile
router.get('/me', authMiddleware, getProfile);

// Protected: Manual sync from ONE CRM
router.get('/me/sync', authMiddleware, syncProfile);

/**
 * KPI Dashboard: List employees for target setting and tracking
 * GET /kpi/employees
 */
router.get('/', authMiddleware, roleGuard(['KPI Admin', 'KPI Manager', 'Sales TL']), getEmployees);

export default router;
