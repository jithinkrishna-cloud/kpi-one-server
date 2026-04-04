import * as service from "./actuals.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Actuals Performance
 */

export const createManualActual = async (req, res) => {
    const { executiveId, actualDate, kpiCode, value, note } = req.body;

    if (!executiveId || !actualDate || !kpiCode || value === undefined || !note) {
        return error(res, "Incomplete data. Note is mandatory for manual entries.", null, 400);
    }

    try {
        await service.createManualActual({ 
            executive_id: executiveId, 
            actual_date: actualDate, 
            kpi_code: kpiCode, 
            value, 
            note, 
            source: 'manual' 
        });
        return success(res, "Manual actual entry saved successfully");
    } catch (err) {
        return error(res, "Failed to save manual actual", err.message, 500);
    }
};

export const getActuals = async (req, res) => {
    const { executiveId } = req.params;
    const { from, to } = req.query;

    if (!executiveId || !from || !to) {
        return error(res, "Executive ID and Date Range (from, to) are required", null, 400);
    }

    try {
        const actuals = await service.getActuals(executiveId, from, to);
        return success(res, "Actuals retrieved successfully", actuals);
    } catch (err) {
        return error(res, "Failed to retrieve actuals", err.message, 500);
    }
};
