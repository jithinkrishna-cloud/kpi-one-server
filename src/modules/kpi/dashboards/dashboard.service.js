import * as repository from "../shared/kpi.repository.js";
import { computeAttainmentForRows, summariseAttainment } from "../actuals/attainment.calculator.js";

/**
 * Service: KPI Dashboards & Reporting (F12-B)
 *
 * Provides two views:
 *  1. Executive Dashboard — per-KPI targets, actuals, attainment for one executive
 *  2. Team Dashboard      — per-executive breakdown for all KPIs in the period
 */

// ─── Executive Dashboard ──────────────────────────────────────────────────────

/**
 * Full performance summary for a single executive in a period.
 *
 * Returns:
 *  - kpis[]      → each assigned KPI with target, actual, attainment, breach/warning flags
 *  - summary     → average attainment, total KPIs, breach count, missing collection flag
 *  - period      → period metadata
 *  - incentives  → calculated incentive results (if any)
 */
export const getExecutiveSummary = async (executiveId, periodId) => {
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");

    // Targets + actuals from a single join query
    const rows = await repository.getExecutiveDashboardSummary(executiveId, periodId);

    if (!rows.length) {
        return {
            kpis:       [],
            summary:    { average_attainment: 0, total_kpis: 0, breaches: 0, missing_collection: false },
            period:     _periodMeta(period),
            incentives: [],
        };
    }

    const kpis    = computeAttainmentForRows(rows);
    const summary = summariseAttainment(kpis);

    // Attach any existing incentive calculation results
    const incentives = await repository.getIncentiveResultsByPeriod(executiveId, periodId);

    return {
        kpis,
        summary,
        period:     _periodMeta(period),
        incentives,
    };
};

// ─── Team Dashboard ───────────────────────────────────────────────────────────

/**
 * Team-level performance view: per-executive KPI breakdown.
 *
 * Returns:
 *  - executives[] → each team member with their KPI attainment list
 *  - team_summary → aggregated attainment across team
 *  - period       → period metadata
 *  - team_targets → manager-set / override team targets per KPI
 */
export const getTeamSummary = async (teamId, periodId) => {
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");

    // Raw rows: one row per executive × KPI combination
    const rows = await repository.getTeamPerformanceAggregation(teamId, periodId);

    if (!rows.length) {
        return {
            executives:   [],
            team_summary: { average_attainment: 0, total_executives: 0, breaches: 0 },
            period:       _periodMeta(period),
            team_targets: [],
        };
    }

    // Group by executive
    const execMap = new Map();
    for (const row of rows) {
        if (!execMap.has(row.executive_id)) {
            execMap.set(row.executive_id, { executive_id: row.executive_id, name: row.executive_name, kpis: [] });
        }
        execMap.get(row.executive_id).kpis.push(row);
    }

    // Compute attainment per executive
    const executives = Array.from(execMap.values()).map((exec) => {
        const kpis    = computeAttainmentForRows(exec.kpis);
        const summary = summariseAttainment(kpis);
        return { executive_id: exec.executive_id, name: exec.name, kpis, summary };
    });

    // Team-level aggregate
    const allKpiResults  = executives.flatMap((e) => e.kpis);
    const teamAttainment = summariseAttainment(allKpiResults);

    // Team targets (manager-set targets per KPI, with override if any)
    const teamTargets = await repository.getTeamTargetsByPeriod(teamId, periodId);

    return {
        executives,
        team_summary: {
            average_attainment: teamAttainment.average_attainment,
            total_executives:   executives.length,
            breaches:           teamAttainment.breaches,
            missing_collection: teamAttainment.missing_collection,
        },
        period:       _periodMeta(period),
        team_targets: teamTargets,
    };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _periodMeta = (period) => ({
    id:         period.id,
    name:       period.name,
    type:       period.type,
    status:     period.status,
    start_date: period.start_date,
    end_date:   period.end_date,
});
