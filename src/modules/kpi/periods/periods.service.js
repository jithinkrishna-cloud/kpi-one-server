import * as repository from "../shared/kpi.repository.js";

/**
 * Service: KPI Period Management
 * Handles the definition and status of monthly KPI cycles.
 */

export const getAllPeriods = async () => {
    return await repository.getPeriods();
};

export const getPeriodById = async (id) => {
    const periods = await repository.getPeriods();
    return periods.find(p => p.id === id);
};
