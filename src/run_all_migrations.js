import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrations = [
    "001_create_employee_cache.sql",
    "001_update_employee_cache_json.sql",
    "002_create_periods_and_targets.sql",
    "003_create_actuals_daily.sql",
    "004_create_incentive_engine.sql",
    "005_fix_kpi_schema_v2.sql",
    "006_add_period_type.sql",
    "007_production_kpi_arch_v5.sql"
];

const runMigrations = async () => {
    try {
        for (const file of migrations) {
            console.log(`🚀 Processing: ${file}`);
            const migrationPath = path.join(__dirname, "database", "migrations", file);
            const sql = fs.readFileSync(migrationPath, "utf8");

            const statements = sql
                .replace(/\/\*[\s\S]*?\*\//g, "") // Block comments
                .split(";")
                .map(s => s.trim())
                .filter(s => {
                    const lines = s.split("\n").map(l => l.trim());
                    return lines.filter(l => l.length > 0 && !l.startsWith("--")).length > 0;
                });

            for (let statement of statements) {
                try {
                    const processedStatement = statement.split("\n")
                        .map(l => l.split("--")[0].trim())
                        .filter(l => l.length > 0)
                        .join(" ");

                    if (processedStatement.length === 0) continue;

                    await db.query(processedStatement);
                    console.log("   ✅ OK");
                } catch (err) {
                    if (err.message.includes("Duplicate") || err.message.includes("already exists")) {
                        console.log("   ⚠️ Skipping duplicate");
                    } else {
                        throw new Error(`Migration Failed in ${file}: ${err.message}`);
                    }
                }
            }
        }
        console.log("🎊 All migrations completed.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Fatal Error:", err.message);
        process.exit(1);
    }
};

runMigrations();
