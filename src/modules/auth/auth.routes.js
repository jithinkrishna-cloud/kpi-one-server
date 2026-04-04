import express from "express";
import { login, logout, getMe, getOrgContext } from "./auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);
router.get("/org-context", authenticate, getOrgContext);

export default router;
