import * as repository from "../shared/kpi.repository.js";
import { calculateAttainment } from "../actuals/attainment.calculator.js";
import {
    calculateKpiIncentive,
    calculateCompositeBonus,
} from "./incentiveCalculator.service.js";
import { AUDIT_ENTITY_TYPES, KPI_CODES } from "../shared/kpi.constants.js";

/**
 * F12-C: Incentive Engine — Full Period Orchestration
 *
 * Workflow:
 *  1. Pre-flight checks   → configs active, all actuals present (incl. Collection)
 *  2. Per-KPI calculation → Layer 1 (commission) + Layer 2 (slab)
 *  3. Composite check     → Layer 3 (all-or-nothing)
 *  4. Lock results        → no edits after this point
 *  5. Save payout summary → single row, approved by Admin
 *
 * Called by: incentives.service.js → calculatePeriodIncentive()
 */

// ─── Pre-flight Checks ────────────────────────────────────────────────────────

/**
 * Ensure all active incentive configs exist for this executive in the period.
 * Returns the configs keyed by kpi_code.
 */
const loadActiveConfigs = async (executiveId, periodId) => {
    const configs = await repository.getAllIncentiveConfigs(executiveId, periodId);
    const active  = configs.filter((c) => c.status === "active");

    if (!active.length) {
        throw new Error(
            "No active incentive configs found. All KPI configs must be approved by Admin before calculation."
        );
    }

    return Object.fromEntries(active.map((c) => [c.kpi_code, c]));
};

/**
 * Ensure every target in the period has an actual value.
 * Special rule: collection_revenue must have a manual entry.
 */
const assertActualsComplete = async (executiveId, period) => {
    const targets = await repository.getTargetsByExecutive(executiveId, period.id);
    if (!targets.length) throw new Error("No targets set for this executive in this period.");

    const actuals = await repository.getActualsByPeriod(
        executiveId, period.start_date, period.end_date
    );
    const actualsMap = Object.fromEntries(actuals.map((a) => [a.kpi_code, a]));

    const missing = [];

    for (const t of targets) {
        const actual = actualsMap[t.kpi_code];

        if (!actual || parseFloat(actual.total_value) === 0) {
            // Collection Revenue missing → hard block (manual, must be entered)
            if (t.kpi_code === KPI_CODES.COLLECTION_REVENUE) {
                throw new Error(
                    "Collection Revenue actuals are missing. Please enter Collection Revenue before calculating incentives."
                );
            }
            // Other KPIs with 0 actual are allowed (attainment = 0%, no bonus)
            missing.push(t.kpi_code);
        }
    }

    return { targets, actualsMap, missingAutoKpis: missing };
};

// ─── Core Calculation ─────────────────────────────────────────────────────────

/**
 * Run the full 3-layer incentive calculation for ONE executive for ONE period.
 *
 * @param {string|number} executiveId
 * @param {number}         periodId
 * @param {string|number}  calculatedBy  - req.user.id (Manager who triggered)
 * @returns {PayoutResult}
 */
export const calculatePeriodIncentive = async (executiveId, periodId, calculatedBy) => {
    // ── Guard: already locked ─────────────────────────────────────────────────
    const locked = await repository.isIncentiveLocked(executiveId, periodId);
    if (locked) {
        throw new Error(
            "Incentive results are already locked for this period. No recalculation allowed."
        );
    }

    // ── Fetch Period ──────────────────────────────────────────────────────────
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");
    if (period.status === "closed") throw new Error("Cannot calculate for a closed period.");

    // ── Pre-flight Checks ─────────────────────────────────────────────────────
    const configMap = await loadActiveConfigs(executiveId, periodId);
    const { targets, actualsMap } = await assertActualsComplete(executiveId, period);

    // ── Composite Config ──────────────────────────────────────────────────────
    const compositeConfig = await repository.getCompositeConfig(executiveId, periodId);
    const compositeAmount = compositeConfig?.status === "active"
        ? parseFloat(compositeConfig.composite_bonus || 0)
        : 0;

    // ── Per-KPI Calculation (Layer 1 + Layer 2) ───────────────────────────────
    const kpiResults = [];

    for (const target of targets) {
        const { kpi_code } = target;
        const config = configMap[kpi_code];

        // If no active config for this KPI, treat as 0 incentive
        if (!config) {
            kpiResults.push({
                kpi_code,
                actual_value:      0,
                target_value:      parseFloat(target.target_value),
                attainment_pct:    0,
                commission:        0,
                slab_bonus:        0,
                composite_bonus:   0,
                total:             0,
            });
            continue;
        }

        // Actual value
        const actualEntry = actualsMap[kpi_code];
        const actualValue = actualEntry ? parseFloat(actualEntry.total_value) : 0;

        // Attainment (correct formula per KPI type)
        const attainment = calculateAttainment({
            kpiCode:   kpi_code,
            actual:    actualValue,
            target:    parseFloat(target.target_value)    || 0,
            benchmark: parseFloat(target.benchmark_value) || 0,
            ceiling:   target.ceiling_value != null ? parseFloat(target.ceiling_value) : null,
        });

        // Layers 1 + 2
        const breakdown = calculateKpiIncentive({
            kpiCode:        kpi_code,
            actual:         actualValue,
            attainmentRaw:  attainment.attainment_raw,
            commissionRate: parseFloat(config.commission_rate || 0),
            slabs:          config.slabs || [],
            slabType:       config.slab_type || "non_cumulative",
        });

        kpiResults.push({
            kpi_code,
            actual_value:   actualValue,
            target_value:   parseFloat(target.target_value),
            attainment_pct: attainment.attainment_pct,
            ...breakdown,
        });
    }

    // ── Layer 3: Composite Bonus ──────────────────────────────────────────────
    const compositeInput = kpiResults.map((r) => ({
        kpi_code:  r.kpi_code,
        slabBonus: r.slab_bonus,
    }));
    const compositeResult = calculateCompositeBonus(compositeInput, compositeAmount);

    // Distribute composite bonus proportionally to each KPI row
    // (stored per-KPI so the total column is self-consistent in the results table)
    const compositeSplit = kpiResults.length > 0
        ? parseFloat((compositeResult.compositeBonus / kpiResults.length).toFixed(2))
        : 0;

    // ── Persist Each KPI Result ───────────────────────────────────────────────
    for (const r of kpiResults) {
        await repository.saveIncentiveResultF12C({
            executive_id:          executiveId,
            period_id:             periodId,
            kpi_code:              r.kpi_code,
            actual_value:          r.actual_value,
            target_value:          r.target_value,
            attainment_pct:        r.attainment_pct,
            commission_earned:     r.commission,
            slab_bonus_earned:     r.slab_bonus,
            composite_bonus_earned: compositeSplit,
            total_incentive:       parseFloat(
                (r.commission + r.slab_bonus + compositeSplit).toFixed(2)
            ),
            status: "calculated",
        });
    }

    // ── Lock all results ──────────────────────────────────────────────────────
    await repository.lockIncentiveResults(executiveId, periodId);

    // ── Payout Summary ────────────────────────────────────────────────────────
    const totalCommission = kpiResults.reduce((s, r) => s + r.commission,  0);
    const totalSlabBonus  = kpiResults.reduce((s, r) => s + r.slab_bonus,  0);
    const grandTotal = parseFloat(
        (totalCommission + totalSlabBonus + compositeResult.compositeBonus).toFixed(2)
    );

    await repository.upsertPayoutSummary({
        executive_id:     executiveId,
        period_id:        periodId,
        total_commission: parseFloat(totalCommission.toFixed(2)),
        total_slab_bonus: parseFloat(totalSlabBonus.toFixed(2)),
        composite_bonus:  compositeResult.compositeBonus,
        grand_total:      grandTotal,
        calculated_by:    calculatedBy,
    });

    // ── Audit Log ─────────────────────────────────────────────────────────────
    await repository.logKpiAudit({
        entity_type:  AUDIT_ENTITY_TYPES.PERIOD,
        record_id:    periodId,
        action:       "calculate",
        old_value:    null,
        new_value:    { executive_id: executiveId, grand_total: grandTotal },
        reason:       "Period incentive calculation triggered",
        performed_by: calculatedBy,
    });

    return {
        executive_id:        executiveId,
        period_id:           periodId,
        kpi_breakdown:       kpiResults.map((r) => ({
            kpi_code:              r.kpi_code,
            actual_value:          r.actual_value,
            target_value:          r.target_value,
            attainment_pct:        r.attainment_pct,
            commission_earned:     r.commission,
            slab_bonus_earned:     r.slab_bonus,
            composite_bonus_earned: compositeSplit,
            total:                 parseFloat((r.commission + r.slab_bonus + compositeSplit).toFixed(2)),
        })),
        summary: {
            total_commission:  parseFloat(totalCommission.toFixed(2)),
            total_slab_bonus:  parseFloat(totalSlabBonus.toFixed(2)),
            composite_bonus:   compositeResult.compositeBonus,
            composite_eligible: compositeResult.eligible,
            composite_failed_kpis: compositeResult.failedKpis,
            grand_total:       grandTotal,
        },
        status: "calculated",
        locked: true,
    };
};

/**
 * @typedef {object} PayoutResult
 * @property {number}   executive_id
 * @property {number}   period_id
 * @property {Array}    kpi_breakdown
 * @property {object}   summary
 * @property {string}   status
 * @property {boolean}  locked
 */
