import express from "express";
import * as controller from "./dashboard.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Dashboard Routes
 * Aggregated reporting with role-based visibility.
 */

const router = express.Router();

router.get("/executive/:executiveId", authenticate, controller.getExecutiveDashboard);
router.get("/team/:teamId", authenticate, authorize("KPI Manager", "KPI Admin"), controller.getTeamDashboard);

export default router;
