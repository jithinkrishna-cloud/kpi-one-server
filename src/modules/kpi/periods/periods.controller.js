import * as service from "./periods.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Period Management
 */

export const getPeriods = async (req, res) => {
    try {
        const periods = await service.getAllPeriods();
        return success(res, "Periods retrieved successfully", periods);
    } catch (err) {
        return error(res, "Failed to retrieve periods", err.message, 500);
    }
};
