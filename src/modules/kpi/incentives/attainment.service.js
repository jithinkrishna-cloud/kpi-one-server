import * as repository from "../shared/kpi.repository.js";
import { calculateKpiIncentive } from "./incentiveCalculator.service.js";
import { calculateAttainment } from "../actuals/attainment.calculator.js";

/**
 * Service: KPI Attainment and Incentive Bridge
 *
 * Uses the canonical attainment.calculator.js formulas (F12-B):
 *  - standard KPIs: (actual / target) × 100
 *  - completion_tat: (benchmark / actual) × 100
 *
 * The attainment_raw (uncapped) value is used for incentive slab matching
 * so a 160% achiever doesn't get capped out of the top slab.
 */

/**
 * Calculates and stores the incentive result for a specific KPI, executive, and period.
 */
export const calculateAndSaveKpiResult = async (executiveId, periodId, kpiCode) => {
    // 1. Fetch Period Metadata
    const periods = await repository.getPeriods();
    const period  = periods.find((p) => p.id === parseInt(periodId));
    if (!period) throw new Error("Period not found.");

    // 2. Fetch Target
    const targets     = await repository.getTargetsByExecutive(executiveId, periodId);
    const target      = targets.find((t) => t.kpi_code === kpiCode);
    const targetValue = target ? parseFloat(target.target_value)    : 0;
    const benchmark   = target ? parseFloat(target.benchmark_value) : 0;
    const ceiling     = target ? parseFloat(target.ceiling_value)   : null;

    // 3. Fetch Actual Total for the Period
    const actuals     = await repository.getActualsByPeriod(executiveId, period.start_date, period.end_date);
    const actual      = actuals.find((a) => a.kpi_code === kpiCode);
    const actualValue = actual ? parseFloat(actual.total_value) : 0;

    // 4. Compute Attainment using canonical formula (correct TAT handling)
    const attainment = calculateAttainment({
        kpiCode,
        actual:    actualValue,
        target:    targetValue,
        benchmark,
        ceiling,
    });

    // 5. Fetch Incentive Slab Config
    const config          = await repository.getIncentiveConfig(executiveId, kpiCode);
    const slabs           = config?.slabs        || [];
    const bonusThreshold  = config?.bonus_threshold || 0;
    const bonusAmount     = config?.bonus_amount    || 0;

    // 6. Calculate Incentive using uncapped attainment (raw) for fair slab matching
    const incentive = calculateKpiIncentive(
        actualValue,
        targetValue,
        slabs,
        bonusThreshold,
        bonusAmount,
        attainment.attainment_raw   // pass raw so high achievers reach correct slab
    );

    // 7. Store Result
    return await repository.saveIncentiveResult({
        executive_id:     executiveId,
        period_id:        periodId,
        kpi_code:         kpiCode,
        actual_value:     actualValue,
        target_value:     targetValue,
        attainment_pct:   attainment.attainment_pct,   // capped value stored for display
        commission_earned: incentive.commission,
        bonus_earned:     incentive.bonus,
        total_incentive:  incentive.total,
        status:           "calculated",
    });
};

export const getExecutivePeriodResults = async (executiveId, periodId) => {
    return await repository.getIncentiveResultsByPeriod(executiveId, periodId);
};
