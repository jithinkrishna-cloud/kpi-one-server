import db from "./config/db.js";
import { KPI_CODES } from "./modules/kpi/shared/kpi.constants.js";
import * as targetService from "./modules/kpi/targets/targets.service.js";
import * as periodService from "./modules/kpi/periods/periods.service.js";

const seedDemoData = async () => {
  console.log("🚀 Seeding Demo KPI Data...");

  try {
    // 1. Seed Dummy Employees for Team ALPHA
    console.log("👥 Seeding dummy employees...");
    await db.query(`
      INSERT INTO one_employee_cache (one_employee_id, name, role, team_id)
      VALUES 
        (101, 'John Doe', 'BDE', 'TEAM_ALPHA'),
        (102, 'Jane Smith', 'BDE', 'TEAM_ALPHA'),
        (100, 'Team Manager', 'Manager', 'TEAM_ALPHA')
      ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)
    `);

    // 2. Create a Monthly Period
    console.log("📅 Creating April 2024 period...");
    const periodId = await periodService.createPeriod({
      name: "April 2024 Sales",
      start_date: "2024-04-01",
      end_date: "2024-04-30",
      type: "monthly",
      status: "active"
    });

    const managerUser = { id: 100, kpiRole: "KPI Manager", teamId: "TEAM_ALPHA" };

    // 3. Set Individual Targets
    console.log("🎯 Setting individual targets...");
    
    // John Doe: Revenue 500,000
    await targetService.createTarget(101, periodId, KPI_CODES.SALES_REVENUE, {
      target_value: 500000,
      reason: "Standard monthly target"
    }, managerUser);

    // Jane Smith: Revenue 750,000
    await targetService.createTarget(102, periodId, KPI_CODES.SALES_REVENUE, {
      target_value: 750000,
      reason: "High performer target"
    }, managerUser);

    // 4. Set a TAT Target (Dual Value) for John Doe
    console.log("⏱️ Setting TAT target...");
    await targetService.createTarget(101, periodId, KPI_CODES.COMPLETION_TAT, {
      benchmark_value: 120, // 2 hours
      ceiling_value: 240,   // 4 hours
      reason: "SLA compliance"
    }, managerUser);

    console.log("\n✅ Demo Data Seeded Successfully.");

    // 5. Verification Queries
    const [targets] = await db.query("SELECT * FROM kpi_targets WHERE period_id = ?", [periodId]);
    const [teamTargets] = await db.query("SELECT * FROM kpi_team_targets WHERE period_id = ?", [periodId]);
    const [audit] = await db.query("SELECT * FROM kpi_audit_log ORDER BY timestamp DESC LIMIT 3");

    console.log("\n--- VERIFICATION ---");
    console.log(`Individual Targets Created: ${targets.length}`);
    console.log(`Team Target (TEAM_ALPHA) Final Value: ${teamTargets[0]?.final_value} (Auto-Sum: ${teamTargets[0]?.auto_sum})`);
    console.log(`Recent Audit Actions: ${audit.map(a => a.action).join(", ")}`);

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Seeding Failed:", err.message);
    process.exit(1);
  }
};

seedDemoData();
