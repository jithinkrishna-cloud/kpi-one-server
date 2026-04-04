import express from "express";
import * as controller from "./actuals.controller.js";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Actuals Routes
 * Handles performance entry logic.
 */

const router = express.Router();

router.get("/:executiveId", authenticate, controller.getActuals);
router.post("/collection", authenticate, authorize("KPI Manager", "KPI Admin"), controller.createManualActual);

export default router;
