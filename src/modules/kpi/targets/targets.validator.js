import * as repository from "../shared/kpi.repository.js";

/**
 * Validator: KPI Target Settings
 * Ensures financial integrity before persistence.
 */

export const validateTargetEntry = async (periodId, kpiCode, values) => {
    const { target_value, benchmark_value, ceiling_value } = values;

    // 1. Period Status Validation (Locking)
    const periods = await repository.getPeriods();
    const period = periods.find(p => p.id === parseInt(periodId));
    
    if (!period) throw new Error("Period not found.");
    if (period.status === 'closed') throw new Error("Cannot modify targets for a closed financial period.");
    if (period.status === 'rejected') throw new Error("Cannot modify targets for a rejected period. It must be recreated.");
    if (period.is_frozen) throw new Error("This period is frozen for incentive calculation and cannot be modified.");

    // 2. KPI Configuration Validation
    const kpis = await repository.getKpiMaster();
    const kpi = kpis.find(k => k.code === kpiCode);

    if (!kpi) throw new Error(`Invalid KPI code: ${kpiCode}`);

    if (kpi.requires_dual_target) {
        // AC04: TAT requires benchmark + ceiling — block null, undefined, NaN, and zero
        if (benchmark_value == null || ceiling_value == null ||
            isNaN(parseFloat(benchmark_value)) || isNaN(parseFloat(ceiling_value))) {
            throw new Error(`KPI ${kpiCode} requires valid benchmark and ceiling values.`);
        }
        if (parseFloat(benchmark_value) <= 0 || parseFloat(ceiling_value) <= 0) {
            throw new Error("Benchmark and ceiling values must be greater than zero.");
        }
        if (parseFloat(benchmark_value) >= parseFloat(ceiling_value)) {
            throw new Error("Benchmark value must be less than ceiling value for TAT KPIs.");
        }
    } else {
        if (target_value == null || isNaN(parseFloat(target_value)) || parseFloat(target_value) < 0) {
            throw new Error(`Invalid target value for ${kpiCode}. Must be a non-negative number.`);
        }
    }

    return true;
};
