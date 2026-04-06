import * as repository from "../shared/kpi.repository.js";

/**
 * Validator: KPI Actuals
 * Enforces financial and data integrity rules for manual entries.
 */

/**
 * Validate a manual actual entry.
 *  - Value must be a finite positive number
 *  - Date must fall within an active (non-closed) period
 */
export const validateManualEntry = async (actualDate, value) => {
    // 1. Numeric check
    const numValue = parseFloat(value);
    if (isNaN(numValue) || !isFinite(numValue)) {
        throw new Error("Invalid value. Must be a finite number.");
    }
    if (numValue < 0) {
        throw new Error("Value cannot be negative.");
    }

    // 2. Period status check — cannot add to a closed period
    const periods    = await repository.getPeriods();
    const targetDate = new Date(actualDate);

    const period = periods.find(
        (p) =>
            new Date(p.start_date) <= targetDate &&
            new Date(p.end_date) >= targetDate
    );

    if (period && period.status === "closed") {
        throw new Error("Cannot add performance data for a closed period.");
    }
    if (period && period.is_frozen) {
        throw new Error("Cannot add performance data for a frozen period.");
    }

    return true;
};

/**
 * Immutability guard for manual entries.
 *
 * Rule: Once a manager saves Collection Revenue for a period, it cannot be edited.
 * Any update attempt must be rejected with a clear error.
 *
 * @throws {Error} if a manual entry already exists for this executive + KPI in the period
 */
export const assertManualNotExists = async (executiveId, kpiCode, startDate, endDate) => {
    const existing = await repository.getManualActualExists(executiveId, kpiCode, startDate, endDate);
    if (existing) {
        throw new Error(
            `Manual entry for '${kpiCode}' already exists for this period and cannot be edited. ` +
            "Manual actuals are immutable once saved."
        );
    }
};
