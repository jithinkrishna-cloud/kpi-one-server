import express from "express";
import * as controller from "./health.controller.js";
import authMiddleware from "../../shared/middlewares/authMiddleware.js";
import roleGuard from "../../shared/middlewares/roleGuard.js";

const router = express.Router();

// Public health check
router.get("/", controller.getStatus);

// Protected health check (Verification for ONE CRM Integration)
router.get(
  "/protected",
  authMiddleware,
  roleGuard(["KPI Admin", "KPI Manager"]),
  controller.getStatus,
);

export default router;
