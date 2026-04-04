import express from "express";
import * as controller from "./targets.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Target Routes
 * Handles individual and team target logic with RBAC.
 */

const router = express.Router();

// Individual Targets
router.get("/:executiveId", authenticate, controller.getTargets);
router.post("/", authenticate, authorize("KPI Manager", "KPI Admin"), controller.createTarget);
router.post("/approve", authenticate, authorize("KPI Manager", "KPI Admin"), controller.approveTargets);

// Team Targets
router.get("/team/:teamId", authenticate, controller.getTeamTargets);
router.post("/team/override", authenticate, authorize("KPI Manager", "KPI Admin"), controller.overrideTeamTarget);

export default router;
