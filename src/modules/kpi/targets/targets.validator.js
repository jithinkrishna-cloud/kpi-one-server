import * as repository from "../shared/kpi.repository.js";

/**
 * Validator: KPI Target Settings
 * Ensures financial integrity before persistence.
 */

export const validateTargetEntry = async (periodId, targetValue) => {
    // 1. Basic Type Validation
    if (isNaN(targetValue) || targetValue < 0) {
        throw new Error("Invalid target value. Must be a positive number.");
    }

    // 2. Period Status Validation (Locking)
    const periods = await repository.getPeriods();
    const period = periods.find(p => p.id === periodId);
    
    if (!period) {
        throw new Error("Period not found.");
    }

    if (period.status === 'closed') {
        throw new Error("Cannot modify targets for a closed financial period.");
    }

    return true;
};
