import express from "express";
import * as controller from "./incentives.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Incentive Routes
 * Handles financial configuration and attainment results.
 */

const router = express.Router();

router.get("/config/:executiveId", authenticate, authorize("KPI Admin"), controller.getIncentiveConfig);
router.post("/config", authenticate, authorize("KPI Admin"), controller.saveIncentiveConfig);
router.post("/calculate", authenticate, authorize("KPI Admin", "KPI Manager"), controller.calculateIncentive);
router.get("/results/:executiveId", authenticate, controller.getIncentiveResults);

export default router;
