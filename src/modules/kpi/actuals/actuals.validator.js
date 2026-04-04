import * as repository from "../shared/kpi.repository.js";

/**
 * Validator: KPI Actuals Performance
 * Ensures financial integrity for manual entries.
 */

export const validateManualEntry = async (actualDate, value) => {
    // 1. Basic Type Validation
    if (isNaN(value)) {
        throw new Error("Invalid performance value. Must be a number.");
    }

    // 2. Period Status Validation (Locking)
    const periods = await repository.getPeriods();
    const targetDate = new Date(actualDate);
    
    const period = periods.find(p => 
        new Date(p.start_date) <= targetDate && new Date(p.end_date) >= targetDate
    );

    if (period && period.status === 'closed') {
        throw new Error("Cannot add or modify performance data for a closed financial period.");
    }

    return true;
};
