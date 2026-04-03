import express from 'express';
import { getProfile, syncProfile } from './employee.controller.js';
import authMiddleware from '../../shared/middlewares/authMiddleware.js';

const router = express.Router();

// Protected: Only logged-in users can see their own profile
router.get('/me', authMiddleware, getProfile);

// Protected: Manual sync from ONE CRM
router.get('/me/sync', authMiddleware, syncProfile);

export default router;
