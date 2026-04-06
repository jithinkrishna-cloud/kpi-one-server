import {
    getOrders,
    getLeads,
    getDeals,
    getCallLogs,
    getMessageLogs,
} from "../../../shared/integrations/oneApi.service.js";
import { upsertActual } from "../shared/kpi.repository.js";
import { KPI_CODES, KPI_DATA_SOURCE } from "../shared/kpi.constants.js";

/**
 * F12-B: Auto-Sync Service
 *
 * Fetches real-time actuals from ONE CRM APIs for each auto KPI,
 * then upserts them into kpi_actuals_daily.
 *
 * Collection Revenue is skipped here — it is MANUAL only.
 *
 * Design: Each KPI has a dedicated fetcher function that:
 *   1. Calls the appropriate ONE API with date + executive filters
 *   2. Extracts and aggregates the numeric value
 *   3. Returns { kpiCode, value, actualDate }
 *
 * NOTE: Field names below (e.g. order_value, duration_minutes) should be
 * verified against the actual ONE CRM API response shapes.
 * The structure is intentionally explicit for easy adjustment.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a date string for kpi_actuals_daily (today or period end date, whichever is earlier)
 */
const syncDate = (endDate) => {
    const today = new Date().toISOString().split("T")[0];
    return today < endDate ? today : endDate;
};

/**
 * Safely sum a numeric field from an array of objects.
 */
const sumField = (arr, field) =>
    (arr || []).reduce((acc, row) => acc + (parseFloat(row[field]) || 0), 0);

/**
 * Count non-null items in an array.
 */
const countItems = (arr) => (arr || []).length;

// ─── KPI Fetchers ────────────────────────────────────────────────────────────

/**
 * sales_revenue: SUM of completed order values for the executive in the date range.
 * ONE API: POST /orderlist  { employeeId, from, to }
 * Response shape: { orders: [{ order_value, status, employee_id, order_date }] }
 */
const fetchSalesRevenue = async (executiveId, startDate, endDate, token) => {
    const data = await getOrders(
        { employeeId: executiveId, from: startDate, to: endDate, status: "completed" },
        token
    );
    const orders = data?.orders || data?.data || [];
    return sumField(orders, "order_value");
};

/**
 * lead_quality_relevancy: % of leads marked "qualified" or relevant.
 * ONE API: POST /lead-generation/getleads  { employeeId, from, to }
 * Response shape: { leads: [{ is_qualified, assigned_to, created_at }] }
 */
const fetchLeadQualityRelevancy = async (executiveId, startDate, endDate, token) => {
    const data = await getLeads(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const leads = data?.leads || data?.data || [];
    if (!leads.length) return 0;
    const qualified = leads.filter((l) => l.is_qualified || l.isQualified).length;
    return parseFloat(((qualified / leads.length) * 100).toFixed(2));
};

/**
 * lead_conversion: % of leads converted to deals.
 * ONE API: POST /lead-generation/getleads  { employeeId, from, to }
 * Response shape: { leads: [{ status, assigned_to }] }
 */
const fetchLeadConversion = async (executiveId, startDate, endDate, token) => {
    const data = await getLeads(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const leads = data?.leads || data?.data || [];
    if (!leads.length) return 0;
    const converted = leads.filter(
        (l) => l.status === "converted" || l.IsConverted || l.is_converted
    ).length;
    return parseFloat(((converted / leads.length) * 100).toFixed(2));
};

/**
 * call_connect_rate: % of dialed calls that were connected.
 * ONE API: GET /api/callyser/calls  { employeeId, from, to }
 * Response shape: { calls: [{ status, employee_id, call_date }] }
 */
const fetchCallConnectRate = async (executiveId, startDate, endDate, token) => {
    const data = await getCallLogs(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const calls = data?.calls || data?.data || [];
    if (!calls.length) return 0;
    const connected = calls.filter(
        (c) => c.status === "connected" || c.status === "answered"
    ).length;
    return parseFloat(((connected / calls.length) * 100).toFixed(2));
};

/**
 * deal_creation: COUNT of deals created by the executive.
 * ONE API: POST /getdeals  { employeeId, from, to }
 * Response shape: { deals: [{ created_by, created_at }] }
 */
const fetchDealCreation = async (executiveId, startDate, endDate, token) => {
    const data = await getDeals(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const deals = data?.deals || data?.data || [];
    return countItems(deals);
};

/**
 * quote_creation: COUNT of quotes/orders created by the executive.
 * ONE API: POST /orderlist  { employeeId, from, to }
 * Response shape: { orders: [{ created_by, order_date }] }
 */
const fetchQuoteCreation = async (executiveId, startDate, endDate, token) => {
    const data = await getOrders(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const orders = data?.orders || data?.data || [];
    return countItems(orders);
};

/**
 * customer_touch: COUNT of outbound messages/interactions with customers.
 * ONE API: GET /api/interakt/messages  { employeeId, from, to }
 * Response shape: { messages: [{ sent_by, sent_at }] }
 */
const fetchCustomerTouch = async (executiveId, startDate, endDate, token) => {
    const data = await getMessageLogs(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const messages = data?.messages || data?.data || [];
    return countItems(messages);
};

/**
 * dialed_calls: COUNT of all calls dialed by the executive.
 * ONE API: GET /api/callyser/calls  { employeeId, from, to }
 */
const fetchDialedCalls = async (executiveId, startDate, endDate, token) => {
    const data = await getCallLogs(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const calls = data?.calls || data?.data || [];
    return countItems(calls);
};

/**
 * talk_time: SUM of call duration in minutes.
 * ONE API: GET /api/callyser/calls  { employeeId, from, to }
 * Response shape: { calls: [{ duration_seconds, employee_id }] }
 */
const fetchTalkTime = async (executiveId, startDate, endDate, token) => {
    const data = await getCallLogs(
        { employeeId: executiveId, from: startDate, to: endDate },
        token
    );
    const calls = data?.calls || data?.data || [];
    // Convert seconds → minutes
    const totalSeconds = sumField(calls, "duration_seconds");
    return parseFloat((totalSeconds / 60).toFixed(2));
};

/**
 * clients_onboarded: COUNT of new clients/orders successfully onboarded.
 * ONE API: POST /orderlist  { employeeId, from, to, status: 'active' }
 * Response shape: { orders: [{ status, employee_id }] }
 */
const fetchClientsOnboarded = async (executiveId, startDate, endDate, token) => {
    const data = await getOrders(
        { employeeId: executiveId, from: startDate, to: endDate, status: "active" },
        token
    );
    const orders = data?.orders || data?.data || [];
    return countItems(orders);
};

/**
 * services_completed: COUNT of services marked as completed.
 * ONE API: POST /orderlist  { employeeId, from, to, type: 'service', status: 'completed' }
 */
const fetchServicesCompleted = async (executiveId, startDate, endDate, token) => {
    const data = await getOrders(
        { employeeId: executiveId, from: startDate, to: endDate, type: "service", status: "completed" },
        token
    );
    const items = data?.orders || data?.data || [];
    return countItems(items);
};

/**
 * completion_tat: AVERAGE TAT in days for completed services.
 * ONE API: POST /orderlist  { employeeId, from, to, status: 'completed' }
 * Response shape: { orders: [{ tat_days, completion_date }] }
 */
const fetchCompletionTat = async (executiveId, startDate, endDate, token) => {
    const data = await getOrders(
        { employeeId: executiveId, from: startDate, to: endDate, status: "completed" },
        token
    );
    const orders = data?.orders || data?.data || [];
    if (!orders.length) return 0;

    const totalTat = sumField(orders, "tat_days");
    return parseFloat((totalTat / orders.length).toFixed(2));
};

// ─── Fetcher Map ─────────────────────────────────────────────────────────────

const KPI_FETCHER = {
    [KPI_CODES.SALES_REVENUE]:          fetchSalesRevenue,
    [KPI_CODES.LEAD_QUALITY_RELEVANCY]: fetchLeadQualityRelevancy,
    [KPI_CODES.LEAD_CONVERSION]:        fetchLeadConversion,
    [KPI_CODES.CALL_CONNECT_RATE]:      fetchCallConnectRate,
    [KPI_CODES.DEAL_CREATION]:          fetchDealCreation,
    [KPI_CODES.QUOTE_CREATION]:         fetchQuoteCreation,
    [KPI_CODES.CUSTOMER_TOUCH]:         fetchCustomerTouch,
    [KPI_CODES.DIALED_CALLS]:           fetchDialedCalls,
    [KPI_CODES.TALK_TIME]:              fetchTalkTime,
    [KPI_CODES.CLIENTS_ONBOARDED]:      fetchClientsOnboarded,
    [KPI_CODES.SERVICES_COMPLETED]:     fetchServicesCompleted,
    [KPI_CODES.COMPLETION_TAT]:         fetchCompletionTat,
    // collection_revenue → intentionally absent (manual only)
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sync all auto KPIs for a single executive over their period date range.
 *
 * - Runs all fetchers in parallel for speed.
 * - Skips any KPI marked as "manual" in KPI_DATA_SOURCE.
 * - Failures per KPI are isolated (one API down won't block others).
 * - Stores results as a single daily entry dated to today (or period end, whichever is earlier).
 *
 * @param {string|number} executiveId
 * @param {{ start_date: string, end_date: string }} period
 * @param {string} token - Bearer token forwarded to ONE API
 * @param {string[]} [kpiFilter] - Optional: only sync these KPI codes
 * @returns {Array<{ kpi_code, value, status, error? }>}
 */
export const syncExecutiveActuals = async (executiveId, period, token, kpiFilter = null) => {
    const { start_date, end_date } = period;
    const date = syncDate(end_date);

    const autoCodes = Object.keys(KPI_FETCHER).filter(
        (code) =>
            KPI_DATA_SOURCE[code] === "auto" &&
            (!kpiFilter || kpiFilter.includes(code))
    );

    const results = await Promise.allSettled(
        autoCodes.map(async (kpiCode) => {
            const fetcher = KPI_FETCHER[kpiCode];
            const value = await fetcher(executiveId, start_date, end_date, token);

            await upsertActual({
                executive_id: executiveId,
                actual_date:  date,
                kpi_code:     kpiCode,
                value,
                source:       "auto",
                note:         null,
            });

            return { kpi_code: kpiCode, value, status: "synced" };
        })
    );

    // Map settled results to a clean report
    return results.map((settled, i) => {
        if (settled.status === "fulfilled") return settled.value;
        console.error(`[SYNC] ${autoCodes[i]} failed for exec ${executiveId}:`, settled.reason?.message);
        return { kpi_code: autoCodes[i], value: null, status: "failed", error: settled.reason?.message };
    });
};
