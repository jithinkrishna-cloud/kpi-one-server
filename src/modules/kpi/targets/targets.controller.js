import * as service from "./targets.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Target Management
 */

export const setTarget = async (req, res) => {
    try {
        const { executiveId, periodId, kpiCode, values } = req.body;
        const result = await service.createTarget(executiveId, periodId, kpiCode, values, req.user);
        return success(res, "Target set successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const getTargets = async (req, res) => {
    try {
        const { executiveId, periodId } = req.params;
        const result = await service.getTargets(executiveId, periodId);
        return success(res, "Targets retrieved successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const overrideTeamTarget = async (req, res) => {
    try {
        const { teamId, periodId, kpiCode, overrideValue, reason } = req.body;
        const result = await service.overrideTeamTarget(teamId, periodId, kpiCode, overrideValue, req.user, reason);
        return success(res, "Team target override successful", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const getTeamTargets = async (req, res) => {
    try {
        const { teamId, periodId } = req.params;
        const result = await service.getTeamTargets(teamId, periodId);
        return success(res, "Team targets retrieved successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};
export const setBulkTargets = async (req, res) => {
    try {
        const { targets } = req.body;
        const result = await service.setBulkTargets(targets, req.user);
        return success(res, "Bulk targets set successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};
