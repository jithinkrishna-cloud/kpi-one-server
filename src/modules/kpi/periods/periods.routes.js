import express from "express";
import * as controller from "./periods.controller.js";

import authMiddleware from "../../../shared/middlewares/authMiddleware.js";
import roleGuard from "../../../shared/middlewares/roleGuard.js";

const router = express.Router();

/**
 * Routes: KPI Period Management
 * Roles: Admin (Full), Manager/Executive (View)
 */

router.get("/", authMiddleware, controller.getAllPeriods);
router.get("/:id", authMiddleware, controller.getPeriodById);

// Admin can create, approve, reject, or close periods
router.post("/", authMiddleware, roleGuard(["KPI Admin"]), controller.createPeriod);
router.post("/:id/approve", authMiddleware, roleGuard(["KPI Admin"]), controller.approvePeriod);
router.post("/:id/reject", authMiddleware, roleGuard(["KPI Admin"]), controller.rejectPeriod);
router.post("/:id/close", authMiddleware, roleGuard(["KPI Admin"]), controller.closePeriod);

export default router;
