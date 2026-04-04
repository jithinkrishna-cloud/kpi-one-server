import dbServer from "./src/config/db.js";

async function checkSchema() {
  console.log("🔍 Checking Database Schema for 'one_employee_cache'...");
  try {
    const [columns] = await dbServer.query("DESCRIBE one_employee_cache;");
    process.stdout.write(JSON.stringify(columns, null, 2));
  } catch (err) {
    console.error("❌ Failed to query schema:", err.message);
  }
  process.exit(0);
}

checkSchema();
