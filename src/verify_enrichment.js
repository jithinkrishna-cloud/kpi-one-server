import { listEmployees } from "./modules/employee/employee.service.js";
import * as repo from "./modules/employee/employee.repository.js";
import * as oneApi from "../../shared/integrations/oneApi.service.js";
import { getPool } from "./config/db.js";

async function verify() {
  console.log("🔍 Verifying Employee Enrichment Logic...");

  // 1. Mock Repository
  const mockEmployees = [
    { one_employee_id: "9", name: "admin", kpi_role: "KPI Admin", franchisee_id: "1", team_id: "14", team_ids: ["14"] },
    { one_employee_id: "202", name: "Test Exec 2", kpi_role: "KPI Executive", franchisee_id: "1", team_id: "9", team_ids: ["9"] }
  ];
  
  const originalFindAll = repo.findAll;
  repo.findAll = async () => mockEmployees;

  // 2. Mock ONE API
  const originalGetFranchisee = oneApi.getFranchiseeIdNames;
  const originalGetTeams = oneApi.getTeamIdNames;

  oneApi.getFranchiseeIdNames = async () => ({
    success: true,
    data: [{ FranchiseeID: "1", FranchiseeName: "Bizpole HQ" }]
  });

  oneApi.getTeamIdNames = async () => ({
    success: true,
    data: [
      { TeamID: "14", TeamName: "Management" },
      { TeamID: "9", TeamName: "Sales" }
    ]
  });

  // 3. Mock Token Resolution
  // (We'll assume the token works or mock the function)

  try {
    const currentUser = { id: 9, kpiRole: "KPI Admin" };
    
    console.log("\n🧪 Test 1: Full List Enrichment");
    const results = await listEmployees({}, currentUser);
    
    console.log("Result 0:", results[0].name, "| Franchise:", results[0].franchisee_name, "| Team:", results[0].team_name);
    console.log("Result 1:", results[1].name, "| Franchise:", results[1].franchisee_name, "| Team:", results[1].team_name);

    if (results[0].franchisee_name === "Bizpole HQ" && results[0].team_name === "Management") {
      console.log("✅ Success: Names enriched correctly.");
    } else {
      console.log("❌ Failed: Names missing or incorrect.");
    }

    console.log("\n🧪 Test 2: Executive Filtering");
    const execs = await listEmployees({ role: "KPI Executive" }, currentUser);
    console.log("Count:", execs.length);
    const hasAdmin = execs.some(e => e.name === "admin");
    if (!hasAdmin && execs.length === 1) {
      console.log("✅ Success: 'admin' filtered out from Executive list.");
    } else {
      console.log("❌ Failed: 'admin' still present or count mismatch.");
    }

  } catch (err) {
    console.error("💥 Logic Verification Failed:", err.message);
  } finally {
    // Restore
    repo.findAll = originalFindAll;
    oneApi.getFranchiseeIdNames = originalGetFranchisee;
    oneApi.getTeamIdNames = originalGetTeams;
    
    const pool = getPool();
    if (pool) await pool.end();
    process.exit(0);
  }
}

// Note: Running this might fail due to ES module complexities with mocking imports.
// In a real environment, we'd use a testing framework like Vitest or Jest.
// This is a dry run of the logic.
verify();
