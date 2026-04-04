import { getOrSyncEmployee } from "./src/modules/employee/employee.service.js";
import dotenv from "dotenv";
dotenv.config({ path: "src/config/.env" });

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjE4MiwidXNlcm5hbWUiOiJVbWVzaCIsImlhdCI6MTc3NTI5NDkyMSwiZXhwIjoxNzc1MzIzNzIxfQ.0hqZElD6htZnZEryjb3w8NHReR3bzSoP89ZZbqY2Ym4";

async function testSync() {
  console.log("🛠️  Testing Internal Sync for User ID 182...");
  try {
    const result = await getOrSyncEmployee(182, token);
    if (result) {
      console.log("✅ Sync Successful!");
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("❌ Sync returned null.");
    }
  } catch (err) {
    console.error("🔥 CRITICAL ERROR:", err.message);
    console.error(err.stack);
  }
  process.exit(0);
}

testSync();
