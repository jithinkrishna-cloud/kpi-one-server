import * as repository from "../shared/kpi.repository.js";
import { calculatePeriodIncentive } from "./incentiveEngine.service.js";

/**
 * Attainment Service — thin bridge kept for backward compatibility.
 *
 * F12-C: All calculation logic now lives in incentiveEngine.service.js.
 * This module delegates to the engine to avoid duplication.
 */

/**
 * Calculate and save incentive results for a full period (delegates to engine).
 * Kept as a named export so existing callers don't break.
 *
 * @param {string|number} executiveId
 * @param {number}         periodId
 * @param {string|number}  triggeredBy - user id
 */
export const calculateAndSaveKpiResult = async (executiveId, periodId, triggeredBy) => {
    return await calculatePeriodIncentive(executiveId, periodId, triggeredBy);
};

export const getExecutivePeriodResults = async (executiveId, periodId) => {
    return await repository.getIncentiveResultsByPeriod(executiveId, periodId);
};
