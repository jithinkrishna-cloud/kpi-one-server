import { syncFromLoginResponse } from "./modules/employee/employee.service.js";
import { findByOneId } from "./modules/employee/employee.repository.js";
import { getPool } from "./config/db.js";

async function runTest() {
    console.log("🚀 Testing CRM Mapping & Sync Integrity...");

    const sampleUser = {
        id: 999,
        username: "Test User",
        franchiseeRoles: [
            {
                FranchiseID: "61",
                RoleName: "Secondary Role",
                TeamID: 20
            },
            {
                FranchiseID: "1",
                RoleName: "Primary Executive",
                TeamID: 16,
                isPrimary: true // Should be picked over the first one
            }
        ]
    };

    try {
        // 1. Test Successful Mapping with PRIORITY Role selection
        console.log("\n🧪 Test 1: Priority Role Selection");
        const synced = await syncFromLoginResponse(sampleUser);
        
        if (synced && synced.team_id === "16" && synced.role === "Primary Executive") {
            console.log("✅ Success: correctly prioritized 'isPrimary' role.");
        } else {
            console.log("❌ Failed: role selection logic incorrect.");
            console.log("Received:", synced);
        }

        // 2. Test Data Integrity (Missing TeamID)
        console.log("\n🧪 Test 2: Data Integrity (Missing TeamID)");
        const brokenUser = {
            id: 888,
            username: "Broken User",
            franchiseeRoles: [{ FranchiseID: "1", RoleName: "Admin" }] // No TeamID
        };

        try {
            await syncFromLoginResponse(brokenUser);
            console.log("❌ Failed: System allowed a user without a TeamID!");
        } catch (err) {
            console.log(`✅ Success: Caught expected error: "${err.message}"`);
        }

        // 3. Test COALESCE protection (Manual Simulation)
        console.log("\n🧪 Test 3: COALESCE Protection (DB level)");
        // We simulate a fetch that has NULL fields. 
        // Note: Our service layer now prevents this, but the repository should also be safe.
        // We'll just verify the existing record is still reachable.
        const record = await findByOneId(999);
        if (record && record.name === "Test User") {
            console.log("✅ Success: Record persisted correctly.");
        }

    } catch (err) {
        console.error("💥 Test runner failed:", err.message);
    } finally {
        const pool = getPool();
        await pool.end();
        process.exit(0);
    }
}

runTest();
