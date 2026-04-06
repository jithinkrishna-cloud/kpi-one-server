/**
 * Global Constants for KPI Module
 * Single Source of Truth for KPI Identifiers
 */

export const KPI_CODES = {
  SALES_REVENUE: "sales_revenue",
  COLLECTION_REVENUE: "collection_revenue",
  LEAD_QUALITY_RELEVANCY: "lead_quality_relevancy",
  LEAD_CONVERSION: "lead_conversion",
  CALL_CONNECT_RATE: "call_connect_rate",
  DEAL_CREATION: "deal_creation",
  QUOTE_CREATION: "quote_creation",
  CUSTOMER_TOUCH: "customer_touch",
  DIALED_CALLS: "dialed_calls",
  TALK_TIME: "talk_time",
  CLIENTS_ONBOARDED: "clients_onboarded",
  SERVICES_COMPLETED: "services_completed",
  COMPLETION_TAT: "completion_tat",
};

export const KPI_NAMES = {
  [KPI_CODES.SALES_REVENUE]: "Sales Revenue",
  [KPI_CODES.COLLECTION_REVENUE]: "Collection Revenue",
  [KPI_CODES.LEAD_QUALITY_RELEVANCY]: "Lead Quality/Relevancy",
  [KPI_CODES.LEAD_CONVERSION]: "Lead Conversion",
  [KPI_CODES.CALL_CONNECT_RATE]: "Call Connect Rate",
  [KPI_CODES.DEAL_CREATION]: "Deal Creation",
  [KPI_CODES.QUOTE_CREATION]: "Quote Creation",
  [KPI_CODES.CUSTOMER_TOUCH]: "Customer Touchpoints",
  [KPI_CODES.DIALED_CALLS]: "Number of Calls Dialed",
  [KPI_CODES.TALK_TIME]: "Talk Time (Minutes)",
  [KPI_CODES.CLIENTS_ONBOARDED]: "Clients Onboarded",
  [KPI_CODES.SERVICES_COMPLETED]: "Services Completed",
  [KPI_CODES.COMPLETION_TAT]: "Completion TAT (SLA)",
};

export const KPI_TYPES = {
  REVENUE: "revenue",
  QUALITY: "quality",
  ACTIVITY: "activity",
  OUTPUT: "output",
};

/**
 * F12-B: Data source per KPI.
 * "auto"   → fetched in real-time from ONE CRM APIs
 * "manual" → entered by Manager; immutable once saved
 */
export const KPI_DATA_SOURCE = {
  [KPI_CODES.SALES_REVENUE]:          "auto",
  [KPI_CODES.COLLECTION_REVENUE]:     "manual",   // Only manual KPI
  [KPI_CODES.LEAD_QUALITY_RELEVANCY]: "auto",
  [KPI_CODES.LEAD_CONVERSION]:        "auto",
  [KPI_CODES.CALL_CONNECT_RATE]:      "auto",
  [KPI_CODES.DEAL_CREATION]:          "auto",
  [KPI_CODES.QUOTE_CREATION]:         "auto",
  [KPI_CODES.CUSTOMER_TOUCH]:         "auto",
  [KPI_CODES.DIALED_CALLS]:           "auto",
  [KPI_CODES.TALK_TIME]:              "auto",
  [KPI_CODES.CLIENTS_ONBOARDED]:      "auto",
  [KPI_CODES.SERVICES_COMPLETED]:     "auto",
  [KPI_CODES.COMPLETION_TAT]:         "auto",
};

/**
 * F12-B: Attainment formula type per KPI.
 *
 * "standard" → (Actual ÷ Target) × 100  [Revenue, %, Activity, Counts, Talk Time]
 * "tat"      → (Benchmark ÷ Actual TAT) × 100  [lower is better; breach if Actual > Ceiling]
 */
export const KPI_ATTAINMENT_TYPE = {
  [KPI_CODES.SALES_REVENUE]:          "standard",
  [KPI_CODES.COLLECTION_REVENUE]:     "standard",
  [KPI_CODES.LEAD_QUALITY_RELEVANCY]: "standard",
  [KPI_CODES.LEAD_CONVERSION]:        "standard",
  [KPI_CODES.CALL_CONNECT_RATE]:      "standard",
  [KPI_CODES.DEAL_CREATION]:          "standard",
  [KPI_CODES.QUOTE_CREATION]:         "standard",
  [KPI_CODES.CUSTOMER_TOUCH]:         "standard",
  [KPI_CODES.DIALED_CALLS]:           "standard",
  [KPI_CODES.TALK_TIME]:              "standard",
  [KPI_CODES.CLIENTS_ONBOARDED]:      "standard",
  [KPI_CODES.SERVICES_COMPLETED]:     "standard",
  [KPI_CODES.COMPLETION_TAT]:         "tat",
};

/** Attainment display cap — never shown above this % */
export const ATTAINMENT_CAP = 150;

export const PERIOD_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  ACTIVE: "active",
  REJECTED: "rejected",
  CLOSED: "closed",
};

export const AUDIT_ENTITY_TYPES = {
  PERIOD: "period",
  TARGET: "target",
  TEAM_TARGET: "team_target",
  ACTUAL: "actual",
};

export const INCENTIVE_STATUS = {
  CALCULATED: "calculated",
  APPROVED: "approved",
  PAID: "paid",
};
