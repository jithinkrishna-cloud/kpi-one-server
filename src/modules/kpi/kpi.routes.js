import express from "express";
import periodsRoutes from "./periods/periods.routes.js";
import targetsRoutes from "./targets/targets.routes.js";
import actualsRoutes from "./actuals/actuals.routes.js";
import incentivesRoutes from "./incentives/incentives.routes.js";
import dashboardRoutes from "./dashboards/dashboard.routes.js";

const router = express.Router();

/**
 * KPI Modular Routes (Fintech Architecture)
 * Each sub-module handles its own concerns, validation, and authorization.
 */

router.use("/periods", periodsRoutes);
router.use("/targets", targetsRoutes);
router.use("/actuals", actualsRoutes);
router.use("/incentives", incentivesRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
