import express from "express";
import { login, logout, getMe } from "./auth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);

export default router;
