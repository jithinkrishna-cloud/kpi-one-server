import * as service from "./dashboard.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Dashboards & Reporting
 */

export const getExecutiveDashboard = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId } = req.query;

    if (!executiveId || !periodId) {
        return error(res, "Executive ID and Period ID are required", null, 400);
    }

    try {
        const summary = await service.getExecutiveSummary(executiveId, periodId);
        return success(res, "Executive dashboard summary retrieved", summary);
    } catch (err) {
        return error(res, "Failed to retrieve dashboard summary", err.message, 500);
    }
};

export const getTeamDashboard = async (req, res) => {
    const { teamId } = req.params;
    const { periodId } = req.query;

    if (!teamId || !periodId) {
        return error(res, "Team ID and Period ID are required", null, 400);
    }

    try {
        const summary = await service.getTeamSummary(teamId, periodId);
        return success(res, "Team dashboard summary retrieved", summary);
    } catch (err) {
        return error(res, "Failed to retrieve team summary", err.message, 500);
    }
};
