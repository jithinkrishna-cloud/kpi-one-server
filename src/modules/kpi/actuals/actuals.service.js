import * as repository from "../shared/kpi.repository.js";
import { validateManualEntry } from "./actuals.validator.js";

/**
 * Service: KPI Actuals Performance
 * Handles manual entry and total aggregation for a single executive.
 */

export const createManualActual = async (actualData) => {
    // 1. Validation & Locking (Manual entries only)
    await validateManualEntry(actualData.actual_date, actualData.value);

    // 2. Audit-grade Manual Actual entry
    return await repository.upsertActual({
        ...actualData,
        source: 'manual'
    });
};

export const getActuals = async (executiveId, startDate, endDate) => {
    return await repository.getActualsByPeriod(executiveId, startDate, endDate);
};
