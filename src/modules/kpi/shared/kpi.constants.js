/**
 * Global Constants for KPI Module
 * Single Source of Truth for KPI Identifiers
 */

export const KPI_CODES = {
  // Automated KPIs (From ONE CRM)
  LEADS_GENERATED: "leads_generated",
  DEALS_CREATED: "deals_created",
  QUOTES_SUBMITTED: "quotes_submitted",
  SALES_REVENUE: "sales_revenue",
  SERVICES_DELIVERED: "services_delivered",
  TOUCHPOINT_CALLS: "touchpoint_calls",
  TOUCHPOINT_WHATSAPP: "touchpoint_whatsapp",
  
  // Manual KPIs (Entry by Managers)
  COLLECTION_REVENUE: "collection_revenue",
  
  // Ratios (Calculated)
  LEAD_TO_DEAL_RATIO: "lead_to_deal_ratio",
  DEAL_TO_QUOTE_RATIO: "deal_to_quote_ratio",
  QUOTE_TO_ORDER_RATIO: "quote_to_order_ratio",
};

export const KPI_NAMES = {
  [KPI_CODES.LEADS_GENERATED]: "Leads Generated",
  [KPI_CODES.DEALS_CREATED]: "Deals Created",
  [KPI_CODES.QUOTES_SUBMITTED]: "Quotes Submitted",
  [KPI_CODES.SALES_REVENUE]: "Sales Revenue",
  [KPI_CODES.SERVICES_DELIVERED]: "Services Delivered",
  [KPI_CODES.TOUCHPOINT_CALLS]: "Client Calls",
  [KPI_CODES.TOUCHPOINT_WHATSAPP]: "WhatsApp Engagement",
  [KPI_CODES.COLLECTION_REVENUE]: "Collection Revenue",
};

export const PERIOD_STATUS = {
  ACTIVE: "active",
  CLOSED: "closed",
};

export const INCENTIVE_STATUS = {
  CALCULATED: "calculated",
  APPROVED: "approved",
  PAID: "paid",
};
