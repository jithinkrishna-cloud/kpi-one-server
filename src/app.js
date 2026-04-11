import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Import utilities & middlewares (ESM requires .js extension)
import errorHandler from "./shared/middlewares/errorHandler.js";
import { error } from "./shared/utils/response.js";

// Import Modules
import healthModule from "./modules/health/index.js";
import employeeModule from "./modules/employee/index.js";
import authModule from "./modules/auth/index.js";
import kpiModule from "./modules/kpi/index.js";
import { checkDbConnection } from "./config/db.js";

// Load environment variables explicitly from src/config/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "config", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middlewares
app.use(
  cors({
    origin:
      process.env.CLIENT_URL ||
      "http://localhost:3000" ||
      "http://localhost:3001/",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Register Modules
app.use("/health", healthModule.router);
app.use("/employees", employeeModule.router);
app.use("/auth", authModule.router);
app.use("/kpi", kpiModule.router);

// 404 Handler
app.use((_req, res) => {
  return error(res, "Resource not found", null, 404);
});

import fs from "fs";

// ... (existing imports) ...

// Global Error Handler
app.use((err, req, res, next) => {
  const errorLog = `[${new Date().toISOString()}] ${err.stack}\n---\n`;
  fs.appendFileSync(path.join(__dirname, "..", "error.log"), errorLog);
  console.error("🔥 Global Error Caught:", err.message);
  return error(res, err.message || "Internal Server Error", null, 500);
});

// Start Server
app.listen(PORT, async () => {
  console.log(`
  🚀 KPI Backend is running! (ESM Mode)
  📡 Port: ${PORT}
  🌍 Environment: ${process.env.NODE_ENV}
  🔗 Health Check: http://localhost:${PORT}/health
  `);

  try {
    await checkDbConnection();
  } catch (error) {
    console.warn(
      "⚠️ Database check failed during startup. (Make sure your local MySQL is running)",
    );
  }
});

export default app;
