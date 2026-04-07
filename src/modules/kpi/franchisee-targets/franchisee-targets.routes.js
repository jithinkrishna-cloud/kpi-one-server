import express from "express";
import {
  getFranchiseeTarget,
  overrideFranchiseeTargetHandler,
  resetFranchiseeOverrideHandler,
} from "./franchisee-targets.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * Routes: KPI Franchisee Target Management (F12-A)
 *
 * GET  /franchisee/:franchiseeId/period/:periodId  — Admin + Manager (own franchisee)
 * POST /override                                   — Admin only
 * DELETE /override                                 — Admin only
 */

router.get(
  "/franchisee/:franchiseeId/period/:periodId",
  authenticate,
  authorize("KPI Admin", "KPI Manager"),
  getFranchiseeTarget,
);

router.post(
  "/override",
  authenticate,
  authorize("KPI Admin"),
  overrideFranchiseeTargetHandler,
);

router.delete(
  "/override",
  authenticate,
  authorize("KPI Admin"),
  resetFranchiseeOverrideHandler,
);

export default router;
