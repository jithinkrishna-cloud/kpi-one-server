import express from "express";
import * as controller from "./periods.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

/**
 * KPI Period Routes
 * Managed within the modular KPI sub-system.
 */

const router = express.Router();

router.get("/", authenticate, controller.getPeriods);

export default router;
