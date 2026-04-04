import express from "express";
import * as controller from "./targets.controller.js";
import authMiddleware from "../../../shared/middlewares/authMiddleware.js";
import roleGuard from "../../../shared/middlewares/roleGuard.js";

const router = express.Router();

/**
 * Routes: KPI Target Management
 * Roles: Admin (Full), Manager (Team CRUD), Executive (Own View)
 */

// View Targets (All authenticated users can see available targets)
router.get("/executive/:executiveId/period/:periodId", authMiddleware, controller.getTargets);
router.get("/team/:teamId/period/:periodId", authMiddleware, controller.getTeamTargets);

// Set/Update Targets (Admin or Manager only)
router.post("/", authMiddleware, roleGuard(["KPI Admin", "KPI Manager"]), controller.setTarget);
router.post("/bulk", authMiddleware, roleGuard(["KPI Admin", "KPI Manager"]), controller.setBulkTargets);

// Team Override (Admin or Manager only)
router.post("/override", authMiddleware, roleGuard(["KPI Admin", "KPI Manager"]), controller.overrideTeamTarget);

export default router;
