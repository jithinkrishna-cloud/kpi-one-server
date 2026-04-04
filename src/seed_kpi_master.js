import db from "./config/db.js";
import { KPI_CODES, KPI_TYPES } from "./modules/kpi/shared/kpi.constants.js";

const kpiMetadata = [
  { code: KPI_CODES.SALES_REVENUE, name: "Sales Revenue", type: KPI_TYPES.REVENUE, unit: "INR" },
  { code: KPI_CODES.COLLECTION_REVENUE, name: "Collection Revenue", type: KPI_TYPES.REVENUE, unit: "INR" },
  { code: KPI_CODES.LEAD_QUALITY_RELEVANCY, name: "Lead Quality/Relevancy", type: KPI_TYPES.QUALITY, unit: "PCT" },
  { code: KPI_CODES.LEAD_CONVERSION, name: "Lead Conversion", type: KPI_TYPES.QUALITY, unit: "PCT" },
  { code: KPI_CODES.CALL_CONNECT_RATE, name: "Call Connect Rate", type: KPI_TYPES.QUALITY, unit: "PCT" },
  { code: KPI_CODES.DEAL_CREATION, name: "Deal Creation", type: KPI_TYPES.ACTIVITY, unit: "COUNT" },
  { code: KPI_CODES.QUOTE_CREATION, name: "Quote Creation", type: KPI_TYPES.ACTIVITY, unit: "COUNT" },
  { code: KPI_CODES.CUSTOMER_TOUCH, name: "Customer Touchpoints", type: KPI_TYPES.ACTIVITY, unit: "COUNT" },
  { code: KPI_CODES.DIALED_CALLS, name: "Number of Calls Dialed", type: KPI_TYPES.ACTIVITY, unit: "COUNT" },
  { code: KPI_CODES.TALK_TIME, name: "Talk Time (Minutes)", type: KPI_TYPES.ACTIVITY, unit: "MINS" },
  { code: KPI_CODES.CLIENTS_ONBOARDED, name: "Clients Onboarded", type: KPI_TYPES.OUTPUT, unit: "COUNT" },
  { code: KPI_CODES.SERVICES_COMPLETED, name: "Services Completed", type: KPI_TYPES.OUTPUT, unit: "COUNT" },
  { code: KPI_CODES.COMPLETION_TAT, name: "Completion TAT (SLA)", type: KPI_TYPES.QUALITY, unit: "MINS", dual: true },
];

const seedKpiMaster = async () => {
  try {
    for (const kpi of kpiMetadata) {
      await db.query(`
        INSERT INTO kpi_master (code, name, type, unit, requires_dual_target)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name),
          type = VALUES(type),
          unit = VALUES(unit),
          requires_dual_target = VALUES(requires_dual_target)
      `, [kpi.code, kpi.name, kpi.type, kpi.unit, kpi.dual || false]);
    }
    console.log("✅ KPI Master seeded successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding Failed:", err.message);
    process.exit(1);
  }
};

seedKpiMaster();
