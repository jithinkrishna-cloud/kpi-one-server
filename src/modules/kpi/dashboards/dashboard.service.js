import * as repository from "../shared/kpi.repository.js";

/**
 * Service: KPI Dashboards & Reporting
 * Handles data aggregation for individual and team performance visibility.
 */

export const getExecutiveSummary = async (executiveId, periodId) => {
    return await repository.getExecutiveDashboardSummary(executiveId, periodId);
};

export const getTeamSummary = async (teamId, periodId) => {
    return await repository.getTeamPerformanceAggregation(teamId, periodId);
};
