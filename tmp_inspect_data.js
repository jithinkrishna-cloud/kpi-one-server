import dbServer from "./src/config/db.js";

async function inspectData() {
    console.log("🔍 Inspecting 'one_employee_cache' data...");
    try {
        const [rows] = await dbServer.query("SELECT * FROM one_employee_cache WHERE one_employee_id = '182'");
        if (rows.length > 0) {
            console.log("✅ Data found for ID 182:");
            console.log(JSON.stringify(rows[0], null, 2));
        } else {
            console.log("❌ No data found for ID 182 in cache.");
        }
    } catch (err) {
        console.error("❌ Failed to query data:", err.message);
    }
    process.exit(0);
}

inspectData();
