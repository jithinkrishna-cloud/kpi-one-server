import * as service from "./periods.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Period Management
 */

export const createPeriod = async (req, res) => {
    try {
        const result = await service.createPeriod(req.body);
        return success(res, "Period created successfully", { id: result });
    } catch (err) {
        return error(res, err.message);
    }
};

export const getAllPeriods = async (req, res) => {
    try {
        const result = await service.getAllPeriods();
        return success(res, "Periods retrieved successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const getPeriodById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.getPeriodById(id);
        return success(res, "Period retrieved successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const approvePeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await service.approvePeriod(id, req.user.id);
        return success(res, "Period approved successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};

export const rejectPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const result = await service.rejectPeriod(id, req.user.id, reason);
        return success(res, "Period rejected successfully", result);
    } catch (err) {
        return error(res, err.message);
    }
};
