/**
 * Migration Runner
 * Applies all pending SQL migration files in order.
 *
 * Usage:
 *   npm run migrate
 *
 * Tracks applied migrations in the `_migrations` table so each file runs only once.
 * Safe to run repeatedly — already-applied migrations are skipped.
 */

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "database", "migrations");

/**
 * Detects whether a given migration's effect is already present in the DB.
 * Maps each migration filename to a schema check (table or column existence).
 * Returns true if the migration has already been applied (schema exists).
 * Returns false if the migration still needs to run.
 *
 * Add a new entry here for every new migration file.
 */
async function migrationAlreadyApplied(conn, filename, dbName) {
  const tableExists = async (table) => {
    const [r] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [dbName, table]
    );
    return r[0].cnt > 0;
  };

  const columnExists = async (table, column) => {
    const [r] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [dbName, table, column]
    );
    return r[0].cnt > 0;
  };

  const checks = {
    "001_create_employee_cache.sql":         () => tableExists("one_employee_cache"),
    "001_update_employee_cache_json.sql":    () => columnExists("one_employee_cache", "metadata"),
    "002_create_periods_and_targets.sql":    () => tableExists("kpi_periods"),
    "003_create_actuals_daily.sql":          () => tableExists("kpi_actuals_daily"),
    "004_create_incentive_engine.sql":       () => tableExists("kpi_incentive_configs"),
    "005_fix_kpi_schema_v2.sql":             () => columnExists("kpi_periods", "status")
                                                     .then((has) => has && tableExists("kpi_master")),
    "006_add_period_type.sql":               () => columnExists("kpi_periods", "type"),
    "007_production_kpi_arch_v5.sql":        () => columnExists("kpi_periods", "approved_by"),
    "008_f12b_actuals_tracking.sql":         () => columnExists("kpi_actuals_daily", "source"),
    "009_f12c_incentive_engine.sql":         () => columnExists("kpi_incentive_configs", "slab_type"),
    // New migrations — columns that didn't exist before
    "010_alter_employee_cache_multiteam.sql":          () => columnExists("one_employee_cache", "roles"),
    "011_add_crm_token_to_employee_cache.sql":         () => columnExists("one_employee_cache", "crm_token"),
  };

  const check = checks[filename];
  if (!check) return false; // Unknown migration — let it run
  return check();
}

async function run() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     Number(process.env.DB_PORT) || 3306,
    ssl:      { rejectUnauthorized: false },
    multipleStatements: true,   // needed to run multi-statement SQL files
  });

  console.log("✅ Connected to", process.env.DB_NAME);

  // Create migrations tracking table if it doesn't exist
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      filename   VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bootstrap detection: the DB may have been set up manually before this runner existed.
  // Strategy: for each migration file, check if its key schema object already exists in the DB.
  // If yes → mark it as applied (INSERT IGNORE) so we don't re-run it.
  // If no  → leave it out of _migrations so the runner applies it normally.
  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of allFiles) {
    const alreadyTracked = await conn
      .execute("SELECT 1 FROM _migrations WHERE filename = ?", [file])
      .then(([r]) => r.length > 0);

    if (alreadyTracked) continue;

    const schemaExists = await migrationAlreadyApplied(conn, file, process.env.DB_NAME);
    if (schemaExists) {
      await conn.execute("INSERT IGNORE INTO _migrations (filename) VALUES (?)", [file]);
      console.log(`  📋 Bootstrapped (schema exists): ${file}`);
    }
  }

  // Get list of already-applied migrations
  const [applied] = await conn.execute("SELECT filename FROM _migrations");
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Read migration files in alphabetical order (001_, 002_, ... 010_, ...)
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ranCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  ⏭  Skipped (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    console.log(`  ▶  Applying: ${file}`);
    try {
      await conn.query(sql);
      await conn.execute("INSERT INTO _migrations (filename) VALUES (?)", [file]);
      console.log(`  ✅ Applied:  ${file}`);
      ranCount++;
    } catch (err) {
      // These MySQL error codes mean the schema change is already present —
      // the migration was applied before this runner existed. Mark it as done.
      const ALREADY_EXISTS_CODES = [
        "ER_TABLE_EXISTS_ERROR",   // 1050 — CREATE TABLE IF NOT EXISTS wasn't used
        "ER_DUP_FIELDNAME",        // 1060 — ALTER TABLE ADD COLUMN already present
        "ER_DUP_KEYNAME",          // 1061 — Duplicate index/key name
        "ER_MULTIPLE_PRI_KEY",     // 1068 — Multiple primary key defined
      ];

      if (ALREADY_EXISTS_CODES.includes(err.code)) {
        console.warn(`  ⚠️  Already applied (schema exists): ${file}`);
        await conn.execute("INSERT IGNORE INTO _migrations (filename) VALUES (?)", [file]);
        continue;
      }

      console.error(`  ❌ Failed:   ${file}`);
      console.error("     ", err.message);
      await conn.end();
      process.exit(1);
    }
  }

  await conn.end();

  if (ranCount === 0) {
    console.log("\n✔  All migrations already up to date.");
  } else {
    console.log(`\n✔  ${ranCount} migration(s) applied successfully.`);
  }
}

run().catch((err) => {
  console.error("Migration runner error:", err.message);
  process.exit(1);
});
