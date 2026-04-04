import * as repository from "../shared/kpi.repository.js";
import { calculateAndSaveKpiResult } from "./attainment.service.js";

/**
 * Service: KPI Incentive Management
 * Handles financial configuration and attainment calculations.
 */

export const getIncentiveConfig = async (executiveId, kpiCode) => {
    return await repository.getIncentiveConfig(executiveId, kpiCode);
};

export const saveIncentiveConfig = async (config) => {
    return await repository.upsertIncentiveConfig(config);
};

export const calculateIncentiveData = async (executiveId, periodId, kpiCode, token) => {
    return await calculateAndSaveKpiResult(executiveId, periodId, kpiCode, token);
};

export const getIncentiveResults = async (executiveId, periodId) => {
    return await repository.getIncentiveResultsByPeriod(executiveId, periodId);
};
