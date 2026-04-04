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
};

export const INCENTIVE_STATUS = {
  CALCULATED: "calculated",
  APPROVED: "approved",
  PAID: "paid",
};
