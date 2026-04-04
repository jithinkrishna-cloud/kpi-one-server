import * as service from "./targets.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Target Management
 */

export const getTargets = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId } = req.query;

    if (!executiveId || !periodId) {
        return error(res, "Executive ID and Period ID are required", null, 400);
    }

    try {
        const targets = await service.getTargets(executiveId, periodId);
        return success(res, "Targets retrieved successfully", targets);
    } catch (err) {
        return error(res, "Failed to retrieve targets", err.message, 500);
    }
};

export const createTarget = async (req, res) => {
    const { executiveId, periodId, kpiCode, targetValue } = req.body;

    if (!executiveId || !periodId || !kpiCode || targetValue === undefined) {
        return error(res, "Incomplete target data provided", null, 400);
    }

    try {
        await service.createTarget(executiveId, periodId, kpiCode, targetValue, req.user.id);
        return success(res, "Target created/updated successfully");
    } catch (err) {
        return error(res, "Failed to create/update target", err.message, 500);
    }
};

export const approveTargets = async (req, res) => {
    const { executiveId, periodId } = req.body;

    if (!executiveId || !periodId) {
        return error(res, "Executive ID and Period ID are required for approval", null, 400);
    }

    try {
        await service.approveTargets(executiveId, periodId, req.user.id);
        return success(res, "Targets approved successfully");
    } catch (err) {
        return error(res, "Failed to approve targets", err.message, 500);
    }
};

/**
 * Team Overrides
 */
export const getTeamTargets = async (req, res) => {
    const { teamId } = req.params;
    const { periodId } = req.query;

    if (!teamId || !periodId) {
        return error(res, "Team ID and Period ID are required", null, 400);
    }

    try {
        const targets = await service.getTeamTargets(teamId, periodId);
        return success(res, "Team targets retrieved successfully", targets);
    } catch (err) {
        return error(res, "Failed to retrieve team targets", err.message, 500);
    }
};

export const overrideTeamTarget = async (req, res) => {
    const { teamId, periodId, kpiCode, overrideValue } = req.body;

    if (!teamId || !periodId || !kpiCode || overrideValue === undefined) {
        return error(res, "Incomplete data provided for team override", null, 400);
    }

    try {
        await service.overrideTeamTarget(teamId, periodId, kpiCode, overrideValue, req.user.id);
        return success(res, "Team target override successful");
    } catch (err) {
        return error(res, "Failed to override team target", err.message, 500);
    }
};
