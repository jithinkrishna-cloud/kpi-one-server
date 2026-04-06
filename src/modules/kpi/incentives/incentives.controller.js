import * as service from "./incentives.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: F12-C Incentive Engine
 */

// ─── Config Management ────────────────────────────────────────────────────────

/**
 * GET /kpi/incentives/config/:executiveId?periodId=
 * Returns all KPI configs + composite config for an executive/period.
 */
export const getConfig = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId }    = req.query;
    if (!periodId) return error(res, "periodId is required.", null, 400);

    try {
        const data = await service.getFullConfig(executiveId, periodId);
        return success(res, "Incentive config retrieved.", data);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * POST /kpi/incentives/config
 * Manager saves/updates a single KPI config (must be in draft status).
 * Body: { executiveId, periodId, kpiCode, slabs, commissionRate?, slabType?, bonusThreshold?, bonusAmount? }
 */
export const saveKpiConfig = async (req, res) => {
    const { executiveId, periodId, kpiCode, slabs, commissionRate, slabType, bonusThreshold, bonusAmount } = req.body;
    if (!executiveId || !periodId || !kpiCode) {
        return error(res, "executiveId, periodId, and kpiCode are required.", null, 400);
    }

    try {
        await service.saveKpiConfig({ executiveId, periodId, kpiCode, slabs, commissionRate, slabType, bonusThreshold, bonusAmount });
        return success(res, "KPI incentive config saved.");
    } catch (err) {
        const status = err.message.includes("slab") ? 422 : 500;
        return error(res, err.message, null, status);
    }
};

/**
 * POST /kpi/incentives/config/composite
 * Manager saves composite bonus amount for an executive/period.
 * Body: { executiveId, periodId, compositeBonus }
 */
export const saveCompositeConfig = async (req, res) => {
    const { executiveId, periodId, compositeBonus } = req.body;
    if (!executiveId || !periodId || compositeBonus == null) {
        return error(res, "executiveId, periodId, and compositeBonus are required.", null, 400);
    }

    try {
        await service.saveCompositeConfig(executiveId, periodId, compositeBonus);
        return success(res, "Composite bonus config saved.");
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * POST /kpi/incentives/config/:executiveId/:periodId/submit
 * Manager submits all configs for Admin approval.
 */
export const submitConfig = async (req, res) => {
    const { executiveId, periodId } = req.params;
    try {
        const result = await service.submitForApproval(executiveId, periodId, req.user.id);
        return success(res, result.message);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * POST /kpi/incentives/config/:executiveId/:periodId/approve
 * Admin approves all pending configs → status becomes 'active'.
 */
export const approveConfig = async (req, res) => {
    const { executiveId, periodId } = req.params;
    try {
        const result = await service.approveConfig(executiveId, periodId, req.user.id);
        return success(res, result.message);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * POST /kpi/incentives/config/:executiveId/:periodId/reject
 * Admin rejects configs with mandatory reason.
 * Body: { reason }
 */
export const rejectConfig = async (req, res) => {
    const { executiveId, periodId } = req.params;
    const { reason }                = req.body;
    if (!reason) return error(res, "Rejection reason is required.", null, 400);

    try {
        const result = await service.rejectConfig(executiveId, periodId, req.user.id, reason);
        return success(res, result.message, { reason: result.reason });
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

// ─── Calculation ──────────────────────────────────────────────────────────────

/**
 * POST /kpi/incentives/calculate
 * Manager triggers full 3-layer incentive calculation for an executive/period.
 * Body: { executiveId, periodId }
 *
 * PRD Rules enforced inside engine:
 *  - All actuals must be present (incl. Collection Revenue)
 *  - All configs must be active (Admin-approved)
 *  - Once calculated → locked (no recalculation)
 */
export const calculateIncentive = async (req, res) => {
    const { executiveId, periodId } = req.body;
    if (!executiveId || !periodId) {
        return error(res, "executiveId and periodId are required.", null, 400);
    }

    try {
        const result = await service.calculatePeriod(executiveId, periodId, req.user.id);
        return success(res, "Incentive calculation complete. Results are now locked.", result);
    } catch (err) {
        const status = err.message.includes("locked") ? 409
            : err.message.includes("Missing") || err.message.includes("active") ? 422
            : 500;
        return error(res, err.message, null, status);
    }
};

// ─── Results & Payout ─────────────────────────────────────────────────────────

/**
 * GET /kpi/incentives/results/:executiveId?periodId=
 * Returns per-KPI breakdown + payout summary for an executive/period.
 */
export const getResults = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId }    = req.query;
    if (!periodId) return error(res, "periodId is required.", null, 400);

    try {
        const data = await service.getResults(executiveId, periodId);
        return success(res, "Incentive results retrieved.", data);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * GET /kpi/incentives/payouts?periodId=
 * Admin: all payout summaries for a period across all executives.
 */
export const getAllPayouts = async (req, res) => {
    const { periodId } = req.query;
    if (!periodId) return error(res, "periodId is required.", null, 400);

    try {
        const data = await service.getAllPayouts(periodId);
        return success(res, "Payout summaries retrieved.", data);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

/**
 * POST /kpi/incentives/payout/:executiveId/:periodId/approve
 * Admin approves payout → status becomes 'approved'.
 */
export const approvePayout = async (req, res) => {
    const { executiveId, periodId } = req.params;
    try {
        const result = await service.approvePayout(executiveId, periodId, req.user.id);
        return success(res, result.message, { grand_total: result.grand_total });
    } catch (err) {
        return error(res, err.message, null, err.message.includes("already") ? 409 : 500);
    }
};

/**
 * POST /kpi/incentives/payout/:executiveId/:periodId/reject
 * Admin rejects payout with mandatory reason.
 * Body: { reason }
 */
export const rejectPayout = async (req, res) => {
    const { executiveId, periodId } = req.params;
    const { reason }                = req.body;
    if (!reason) return error(res, "Rejection reason is required.", null, 400);

    try {
        const result = await service.rejectPayout(executiveId, periodId, req.user.id, reason);
        return success(res, result.message);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};
