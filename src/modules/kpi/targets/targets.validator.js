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
        // Requirement 4 & 12: TAT validation
        if (benchmark_value === undefined || ceiling_value === undefined) {
             throw new Error(`KPI ${kpiCode} requires both benchmark and ceiling values.`);
        }
        if (parseFloat(benchmark_value) >= parseFloat(ceiling_value)) {
            throw new Error("Benchmark value must be less than Ceiling value for TAT KPIs.");
        }
    } else {
        if (target_value === undefined || isNaN(target_value) || target_value < 0) {
            throw new Error(`Invalid target value for ${kpiCode}. Must be a positive number.`);
        }
    }

    return true;
};
