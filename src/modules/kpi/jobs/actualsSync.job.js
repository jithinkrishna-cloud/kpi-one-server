import * as oneApi from "../../../shared/integrations/oneApi.service.js";
import * as repository from "../shared/kpi.repository.js";
import { KPI_CODES } from "../shared/kpi.constants.js";

/**
 * Job: KPI Actuals Synchronization
 * High-frequency polling (Stat Snapshot) from ONE Platform.
 * Decoupled from core business services to allow independent scheduling.
 */

/**
 * Synchronizes performance data for a specific executive for a given date range.
 * @param {string} executiveId
 * @param {string} token
 * @param {Object} range { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 */
export const syncExecutiveActuals = async (executiveId, token, range) => {
  const params = { ...range };

  try {
    // 🔋 PARALLEL FETCH CORE PERFORMANCE (Using Module-level Integrations)
    const [leads, deals, quotes, orders, callLogs, messageLogs] =
      await Promise.all([
        oneApi.fetchLeads({ assignedTo: executiveId, ...params }, token),
        oneApi.fetchDeals({ createdBy: executiveId, ...params }, token),
        oneApi.fetchQuotes({ createdBy: executiveId, ...params }, token),
        oneApi.fetchOrders({ executiveId, ...params }, token),
        oneApi.fetchCallLogs({ agentId: executiveId, ...params }, token),
        oneApi.fetchMessageLogs({ agentId: executiveId, ...params }, token),
      ]);

    // 🏷️ MAP TO DAILY ACTUALS (UPSERT)
    const metrics = [
      {
        code: KPI_CODES.LEADS_GENERATED,
        value: leads?.total || leads?.length || 0,
      },
      {
        code: KPI_CODES.DEALS_CREATED,
        value: deals?.total || deals?.length || 0,
      },
      {
        code: KPI_CODES.QUOTES_SUBMITTED,
        value: quotes?.total || quotes?.length || 0,
      },
      {
        code: KPI_CODES.TOUCHPOINT_CALLS,
        value: callLogs?.total || callLogs?.length || 0,
      },
      {
        code: KPI_CODES.TOUCHPOINT_WHATSAPP,
        value: messageLogs?.total || messageLogs?.length || 0,
      },
    ];

    // Revenue tracking (Summing order values)
    const totalRevenue = (orders || []).reduce(
      (sum, order) => sum + (parseFloat(order.Amount) || 0),
      0,
    );
    metrics.push({ code: KPI_CODES.SALES_REVENUE, value: totalRevenue });

    // UPSERT ALL METRICS
    for (const metric of metrics) {
      await repository.upsertActual({
        executive_id: executiveId,
        actual_date: range.from,
        kpi_code: metric.code,
        value: metric.value,
        source: "auto",
      });
    }

    return metrics;
  } catch (err) {
    console.error(`[SYNC JOB ERROR] Executive ${executiveId}:`, err.message);
    throw err;
  }
};
