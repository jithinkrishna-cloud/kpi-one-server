import * as targetService from "./modules/kpi/targets/targets.service.js";
import * as periodService from "./modules/kpi/periods/periods.service.js";
import db from "./config/db.js";
import { KPI_CODES, PERIOD_STATUS } from "./modules/kpi/shared/kpi.constants.js";

const runTests = async () => {
    console.log("\n🧪 Starting PHASE 1 (F12-A) PRODUCTION VERIFICATION SUITE...");

    try {
        // 1. Setup Data
        console.log("\n--- [SETUP] Synchronizing Test Data ---");
        await db.query(`
            INSERT INTO one_employee_cache (one_employee_id, name, role, team_id)
            VALUES 
                (5001, 'Manager Red', 'Manager', 'TEAM_RED'),
                (5002, 'Exec Red 1', 'BDE', 'TEAM_RED')
            ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)
        `);

        // Create a Quarterly Period (Pending)
        const [pResult] = await db.query(
            "INSERT INTO kpi_periods (name, start_date, end_date, type, status) VALUES (?, ?, ?, ?, ?)",
            ["Q1 2025 Test", "2025-01-01", "2025-03-31", "quarterly", "pending"]
        );
        const periodId = pResult.insertId;
        const managerA = { id: 5001, kpiRole: 'KPI Manager', teamId: 'TEAM_RED' };
        const adminUser = { id: 1, kpiRole: 'KPI Admin' };

        console.log(`   ✅ Test Period Created ID: ${periodId} (STATUS: PENDING)`);

        // --- TEST SUITE ---

        // Test 1: Empty Period Approval Block
        console.log("\n🔥 Test 1: Empty Period Approval Block");
        try {
            await periodService.approvePeriod(periodId, adminUser.id);
            console.log("   ❌ Test 1 Failed: Approved empty period!");
        } catch (err) {
            console.log("   ✅ Success: Empty period blocked -", err.message);
        }

        // Test 2: Target Creation & Team Auto-Sum
        console.log("\n🔥 Test 2: Target Creation & Team Auto-Sum");
        await targetService.createTarget(5002, periodId, KPI_CODES.SALES_REVENUE, { target_value: 1000 }, managerA);
        const [teamTarget] = await db.query("SELECT * FROM kpi_team_targets WHERE team_id = 'TEAM_RED' AND period_id = ? AND kpi_code = ?", [periodId, KPI_CODES.SALES_REVENUE]);
        console.log(`   ✅ Target Created. Team Auto-Sum: ${teamTarget[0].auto_sum} | Final: ${teamTarget[0].final_value}`);

        // Test 3: Override Stability (Final Value Resolution)
        console.log("\n🔥 Test 3: Override Stability (Final Value Resolution)");
        await targetService.overrideTeamTarget('TEAM_RED', periodId, KPI_CODES.SALES_REVENUE, 5000, managerA, "Special Project");
        
        // Change individual target -> Auto-sum changes
        await targetService.createTarget(5002, periodId, KPI_CODES.SALES_REVENUE, { target_value: 1500 }, managerA);
        const [teamTargetUpdated] = await db.query("SELECT * FROM kpi_team_targets WHERE team_id = 'TEAM_RED' AND period_id = ? AND kpi_code = ?", [periodId, KPI_CODES.SALES_REVENUE]);
        
        if (parseFloat(teamTargetUpdated[0].final_value) === 5000) {
            console.log(`   ✅ Success: Override Preserved. Auto-Sum: ${teamTargetUpdated[0].auto_sum} | Final: ${teamTargetUpdated[0].final_value}`);
        } else {
            console.log(`   ❌ Failure: Override Lost! Final: ${teamTargetUpdated[0].final_value}`);
        }

        // Test 4: Idempotent Approval
        console.log("\n🔥 Test 4: Idempotent Approval");
        await periodService.approvePeriod(periodId, adminUser.id);
        const [p1] = await db.query("SELECT status FROM kpi_periods WHERE id = ?", [periodId]);
        console.log(`   - First Approval: ${p1[0].status}`);
        
        const result = await periodService.approvePeriod(periodId, adminUser.id);
        console.log(`   ✅ Success: Second call handled - ${result.message || "OK"}`);

        // Test 5: Rejection Flow & Locking
        console.log("\n🔥 Test 5: Rejection Flow & Locking");
        // We'll create a new period for this to avoid affecting the one we just activated
        const [pResult2] = await db.query(
            "INSERT INTO kpi_periods (name, start_date, end_date, type, status) VALUES (?, ?, ?, ?, ?)",
            ["Reject Test", "2025-04-01", "2025-04-30", "monthly", "pending"]
        );
        const rejectId = pResult2.insertId;
        await periodService.rejectPeriod(rejectId, adminUser.id, "Invalid targets");
        
        try {
            await targetService.createTarget(5002, rejectId, KPI_CODES.SALES_REVENUE, { target_value: 100 }, managerA);
            console.log("   ❌ Test 5 Failed: Edits allowed on rejected period!");
        } catch (err) {
            console.log("   ✅ Success: Edits blocked on rejected period -", err.message);
        }

        // Test 6: Audit Log Integrity
        console.log("\n🔥 Test 6: Audit Log Integrity (Lightweight Diffs)");
        const [logs] = await db.query("SELECT * FROM kpi_audit_log WHERE record_id = ? AND entity_type = 'target' ORDER BY id DESC LIMIT 1", [5002]);
        if (logs.length > 0) {
            console.log("   ✅ Success: Audit log found.");
            // console.log("      - New Value Diff:", logs[0].new_value);
        }

        // Cleanup
        console.log("\n🧹 Cleaning up test data...");
        await db.query("DELETE FROM kpi_targets WHERE period_id IN (?, ?)", [periodId, rejectId]);
        await db.query("DELETE FROM kpi_team_targets WHERE period_id IN (?, ?)", [periodId, rejectId]);
        await db.query("DELETE FROM kpi_periods WHERE id IN (?, ?)", [periodId, rejectId]);
        await db.query("DELETE FROM kpi_audit_log WHERE record_id IN (?, ?, ?)", [periodId, rejectId, 5002]);

        console.log("\n✨ Verification Suite Completed Successfully.");
        await db.end();
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Verification Suite Failed:", err.message);
        console.error("   Stack Trace:", err.stack);
        await db.end();
        process.exit(1);
    }
};

runTests();
