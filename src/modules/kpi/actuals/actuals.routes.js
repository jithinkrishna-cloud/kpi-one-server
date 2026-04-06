import express from "express";
import * as controller from "./actuals.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Actuals Routes (F12-B)
 *
 * GET  /kpi/actuals/:executiveId                  → Raw actuals (date range)
 * GET  /kpi/actuals/:executiveId/attainment        → Actuals + attainment per KPI
 * POST /kpi/actuals/collection                    → Manual Collection Revenue entry
 * POST /kpi/actuals/sync                          → Trigger real-time auto-sync
 */

const router = express.Router();

// Manual entry — Manager/Admin only; immutable once saved
router.post(
    "/collection",
    authenticate,
    authorize("KPI Manager", "KPI Admin"),
    controller.createManualActual
);

// Real-time auto-sync — Manager/Admin only
router.post(
    "/sync",
    authenticate,
    authorize("KPI Manager", "KPI Admin"),
    controller.syncActuals
);

// Attainment view — all authenticated roles (executives see their own via scope)
router.get("/:executiveId/attainment", authenticate, controller.getActualsWithAttainment);

// Raw actuals (date range) — all authenticated roles
router.get("/:executiveId", authenticate, controller.getActuals);

export default router;
