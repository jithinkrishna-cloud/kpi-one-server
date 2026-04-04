import * as service from "./incentives.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Incentive Management
 */

export const getIncentiveConfig = async (req, res) => {
    const { executiveId } = req.params;
    const { kpiCode } = req.query;

    try {
        const config = await service.getIncentiveConfig(executiveId, kpiCode);
        return success(res, "Incentive configuration retrieved", config);
    } catch (err) {
        return error(res, "Failed to retrieve config", err.message, 500);
    }
};

export const saveIncentiveConfig = async (req, res) => {
    const { executiveId, kpiCode, slabs, bonusThreshold, bonusAmount } = req.body;

    if (!executiveId || !kpiCode || !slabs) {
        return error(res, "Incomplete incentive config provided", null, 400);
    }

    try {
        await service.saveIncentiveConfig({
            executive_id: executiveId,
            kpi_code: kpiCode,
            slabs,
            bonus_threshold: bonusThreshold,
            bonus_amount: bonusAmount
        });
        return success(res, "Incentive configuration saved successfully");
    } catch (err) {
        return error(res, "Failed to save config", err.message, 500);
    }
};

export const calculateIncentive = async (req, res) => {
    const { executiveId, periodId, kpiCode } = req.body;

    if (!executiveId || !periodId || !kpiCode) {
        return error(res, "Executive ID, Period ID and KPI Code are required", null, 400);
    }

    try {
        const result = await service.calculateIncentiveData(executiveId, periodId, kpiCode, req.user.token);
        return success(res, "Incentive calculation completed", result);
    } catch (err) {
        return error(res, "Calculation failed", err.message, 500);
    }
};

export const getIncentiveResults = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId } = req.query;

    try {
        const results = await service.getIncentiveResults(executiveId, periodId);
        return success(res, "Incentive results retrieved successfully", results);
    } catch (err) {
        return error(res, "Failed to retrieve results", err.message, 500);
    }
};
