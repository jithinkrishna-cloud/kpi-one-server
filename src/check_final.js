import axios from "axios";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
dotenv.config({ path: "src/config/.env" });

const KPI_BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// Using the REAL CRM token provided in previous turns for end-to-end verification
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjE4MiwidXNlcm5hbWUiOiJVbWVzaCIsImlhdCI6MTc3NTI5NDkyMSwiZXhwIjoxNzc1MzIzNzIxfQ.0hqZElD6htZnZEryjb3w8NHReR3bzSoP89ZZbqY2Ym4";

async function checkFinal() {
    console.log("🏁 Final System Verification...");

    // 1. Check our new Employee List API (local)
    console.log("\n📁 Checking KPI Employee Directory (Local API)...");
    try {
        const res = await axios.get(`${KPI_BASE_URL}/employees`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✅ Success: Retrieved ${res.data.data.length} employees from local cache.`);
        console.log("Sample Data:", JSON.stringify(res.data.data[0], null, 2));
    } catch (err) {
        console.error(`❌ KPI API Failed: ${err.message}`);
        if (err.response) console.error(err.response.data);
    }

    // 2. Check direct ONE integration (Remote API)
    // We already know /getEmployees (GET) works from previous tests.
    // Let's test the POST ones now that we fixed the method.
    console.log("\n🌐 Checking ONE Platform Integration (Deals - POST)...");
    try {
        const dealRes = await axios.post(`${process.env.ONE_API_BASE_URL}/getdeals`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`✅ Success: ONE Platform returned ${dealRes.data.length || 0} deals.`);
    } catch (err) {
        console.error(`❌ ONE API Failed (Deals): ${err.message}`);
    }
}

checkFinal();
