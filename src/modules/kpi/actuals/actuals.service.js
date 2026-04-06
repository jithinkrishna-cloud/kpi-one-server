import * as repository from "../shared/kpi.repository.js";
import { validateManualEntry, assertManualNotExists } from "./actuals.validator.js";
import { syncExecutiveActuals } from "./actuals.sync.service.js";
import { computeAttainmentForRows, summariseAttainment } from "./attainment.calculator.js";
import { KPI_DATA_SOURCE } from "../shared/kpi.constants.js";

/**
 * F12-B: KPI Actuals Service
 *
 * Responsibilities:
 *  1. Manual entry (Collection Revenue only) — immutable once saved
 *  2. Auto-sync from ONE CRM APIs (all other KPIs)
 *  3. Attainment computation per KPI (formulas from attainment.calculator.js)
 *  4. Period-level actuals retrieval with attainment and warnings
 */

// ─── Manual Entry ────────────────────────────────────────────────────────────

/**
 * Save a manual actual entry (Collection Revenue only).
 *
 * Rules enforced:
 *  - KPI must be "manual" type (currently only collection_revenue)
 *  - Period must not be closed
 *  - Note is MANDATORY (audit trail)
 *  - Immutable: if an entry already exists in this period, reject
 *
 * @param {object} actualData
 * @param {string|number} actualData.executive_id
 * @param {string}         actualData.actual_date    - ISO date string (YYYY-MM-DD)
 * @param {string}         actualData.kpi_code       - Must be 'collection_revenue'
 * @param {number}         actualData.value
 * @param {string}         actualData.note           - Mandatory audit note
 */
export const createManualActual = async (actualData) => {
    const { executive_id, actual_date, kpi_code, value, note } = actualData;

    // Guard: only manual KPIs allowed through this path
    if (KPI_DATA_SOURCE[kpi_code] !== "manual") {
        throw new Error(
            `KPI '${kpi_code}' is auto-sourced. Manual entry is not permitted for this KPI.`
        );
    }

    // Validate: date, value, period status
    await validateManualEntry(actual_date, value);

    // Enforce immutability: find the period that covers this date
    const periods = await repository.getPeriods();
    const targetDate = new Date(actual_date);
    const period = periods.find(
        (p) =>
            new Date(p.start_date) <= targetDate &&
            new Date(p.end_date) >= targetDate
    );

    if (period) {
        // Reject if a manual entry already exists anywhere in this period
        await assertManualNotExists(executive_id, kpi_code, period.start_date, period.end_date);
    }

    return await repository.upsertActual({
        executive_id,
        actual_date,
        kpi_code,
        value,
        source: "manual",
        note,
    });
};

// ─── Auto Sync ───────────────────────────────────────────────────────────────

/**
 * Trigger a real-time sync of all auto KPIs for an executive in a period.
 *
 * @param {string|number} executiveId
 * @param {number}         periodId
 * @param {string}         token      - Bearer token forwarded to ONE API
 * @param {string[]}       [kpiFilter] - Optional: restrict to specific KPI codes
 * @returns {Array<{ kpi_code, value, status }>}
 */
export const syncAutoActuals = async (executiveId, periodId, token, kpiFilter = null) => {
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");
    if (period.status === "closed") throw new Error("Cannot sync actuals for a closed period.");

    return await syncExecutiveActuals(executiveId, period, token, kpiFilter);
};

// ─── Read with Attainment ────────────────────────────────────────────────────

/**
 * Get all KPI actuals for an executive in a period, with attainment computed per KPI.
 *
 * Flow:
 *  1. Fetch raw rows (targets + actuals) from dashboard query
 *  2. Apply attainment formula per KPI type
 *  3. Attach summary card values
 *
 * @param {string|number} executiveId
 * @param {number}         periodId
 * @returns {{ kpis: AttainmentResult[], summary: object, period: object }}
 */
export const getActualsWithAttainment = async (executiveId, periodId) => {
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");

    // Fetch joined target + actual rows
    const rows = await repository.getExecutiveDashboardSummary(executiveId, periodId);

    if (!rows.length) {
        return {
            kpis:    [],
            summary: { average_attainment: 0, total_kpis: 0, breaches: 0, missing_collection: false },
            period:  { id: period.id, name: period.name, type: period.type, status: period.status },
        };
    }

    const kpis    = computeAttainmentForRows(rows);
    const summary = summariseAttainment(kpis);

    return {
        kpis,
        summary,
        period: {
            id:         period.id,
            name:       period.name,
            type:       period.type,
            status:     period.status,
            start_date: period.start_date,
            end_date:   period.end_date,
        },
    };
};

// ─── Raw Actuals (legacy / incentive engine use) ──────────────────────────────

/**
 * Get raw aggregated actuals for a date range (no attainment computed).
 * Used by the incentive engine and external callers.
 *
 * @param {string|number} executiveId
 * @param {string}         startDate
 * @param {string}         endDate
 */
export const getActuals = async (executiveId, startDate, endDate) => {
    return await repository.getActualsByPeriod(executiveId, startDate, endDate);
};
