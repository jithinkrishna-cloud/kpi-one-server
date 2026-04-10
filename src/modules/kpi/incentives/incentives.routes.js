import express from "express";
import * as controller from "./incentives.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * F12-C: Incentive Engine Routes
 *
 * ── Config Workflow (Manager → Admin) ──────────────────────────────────────
 * GET  /kpi/incentives/config/:executiveId?periodId=          → Get all configs
 * POST /kpi/incentives/config                                 → Save KPI config (Manager)
 * POST /kpi/incentives/config/composite                       → Save composite config (Manager)
 * POST /kpi/incentives/config/:executiveId/:periodId/submit   → Submit for approval (Manager)
 * POST /kpi/incentives/config/:executiveId/:periodId/approve  → Admin approves
 * POST /kpi/incentives/config/:executiveId/:periodId/reject   → Admin rejects
 *
 * ── Calculation (Manager trigger → locks results) ──────────────────────────
 * POST /kpi/incentives/calculate                              → Run 3-layer calculation (Manager)
 *
 * ── Results & Payout Approval (Admin) ─────────────────────────────────────
 * GET  /kpi/incentives/results/:executiveId?periodId=         → Per-KPI results + summary
 * GET  /kpi/incentives/payouts?periodId=                      → All payouts for period (Admin)
 * POST /kpi/incentives/payout/:executiveId/:periodId/approve  → Admin approves payout
 * POST /kpi/incentives/payout/:executiveId/:periodId/reject   → Admin rejects payout
 */

const router = express.Router();

// ── Config ──────────────────────────────────────────────────────────────────

router.get(
    "/config/:executiveId",
    authenticate,
    authorize("KPI Manager"),   // Admin bypasses automatically via roleGuard
    controller.getConfig
);

router.post(
    "/config",
    authenticate,
    authorize("KPI Manager"),
    controller.saveKpiConfig
);

router.post(
    "/config/composite",
    authenticate,
    authorize("KPI Manager"),
    controller.saveCompositeConfig
);

router.post(
    "/config/:executiveId/:periodId/submit",
    authenticate,
    authorize("KPI Manager"),
    controller.submitConfig
);

router.post(
    "/config/:executiveId/:periodId/approve",
    authenticate,
    authorize("KPI Admin"),     // Admin only
    controller.approveConfig
);

router.post(
    "/config/:executiveId/:periodId/reject",
    authenticate,
    authorize("KPI Admin"),
    controller.rejectConfig
);

// ── Calculation ──────────────────────────────────────────────────────────────

router.post(
    "/calculate",
    authenticate,
    authorize("KPI Manager"),
    controller.calculateIncentive
);

// ── Results & Payout ─────────────────────────────────────────────────────────

router.get(
    "/payouts",
    authenticate,
    authorize("KPI Admin"),
    controller.getAllPayouts
);

router.get(
    "/results/:executiveId",
    authenticate,
    controller.getResults          // all roles can view results
);

// Admin reset: clears calculated results so Manager can recalculate (blocked if approved)
router.post(
    "/results/:executiveId/:periodId/reset",
    authenticate,
    authorize("KPI Admin"),
    controller.resetCalculation
);

router.post(
    "/payout/:executiveId/:periodId/approve",
    authenticate,
    authorize("KPI Admin"),
    controller.approvePayout
);

router.post(
    "/payout/:executiveId/:periodId/reject",
    authenticate,
    authorize("KPI Admin"),
    controller.rejectPayout
);

export default router;
