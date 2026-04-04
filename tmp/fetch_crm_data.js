import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: "src/config/.env" });

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjE4MiwidXNlcm5hbWUiOiJVbWVzaCIsImlhdCI6MTc3NTI5NDkyMSwiZXhwIjoxNzc1MzIzNzIxfQ.0hqZElD6htZnZEryjb3w8NHReR3bzSoP89ZZbqY2Ym4";
const baseUrl = process.env.ONE_API_BASE_URL;

async function probePaths() {
    const targets = [
        { path: "/getEmployeeById/182", method: "GET" },
        { path: "/getEmployeeDetails/182", method: "GET" },
        { path: "/getEmployeeById", method: "POST", data: { EmployeeID: 182 } },
        { path: "/getEmployeeDetails", method: "POST", data: { EmployeeID: 182 } }
    ];

    for (const target of targets) {
        console.log(`\n🔍 Probing [${target.method}] ${target.path}...`);
        try {
            const res = await axios({
                url: `${baseUrl}${target.path}`,
                method: target.method,
                data: target.data,
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log(`✅ SUCCESS: ${target.path}`);
            console.log("Keys returned:", Object.keys(res.data).slice(0, 5));
        } catch (err) {
            console.error(`❌ FAILED: ${target.path} (${err.response?.status || err.message})`);
        }
    }
}

probePaths();
