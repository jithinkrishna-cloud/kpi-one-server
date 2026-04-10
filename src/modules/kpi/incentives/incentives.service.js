import * as repository from "../shared/kpi.repository.js";
import { validateSlabs } from "./incentiveCalculator.service.js";
import { calculatePeriodIncentive } from "./incentiveEngine.service.js";
import { KPI_COMMISSION_CODES } from "../shared/kpi.constants.js";

/**
 * F12-C: Incentive Service — Full Workflow
 *
 * Config Workflow  : save → submit → Admin approve/reject
 * Calc Workflow    : Manager triggers → engine locks + calculates → Admin approve/reject payout
 */

// ─── Slab Normalizer ─────────────────────────────────────────────────────────

/**
 * Normalize slab objects to the canonical { min, max, bonus } shape.
 * Accepts any of these field-name variants from the frontend:
 *   { from, to, amount }   ← what the frontend currently sends
 *   { min, max, bonus }    ← canonical storage format
 *   { min, max, amount }   ← mixed variant
 */
const normalizeSlabs = (slabs) => {
    if (!Array.isArray(slabs)) return slabs;
    return slabs.map((s) => ({
        min:   s.min   ?? s.from  ?? 0,
        max:   s.max   ?? s.to    ?? null,   // null = open-ended (last slab)
        bonus: s.bonus ?? s.amount ?? 0,
    }));
};

// ─── Config Management ────────────────────────────────────────────────────────

/**
 * Get all KPI incentive configs for an executive in a period.
 * Also fetches the composite config in the same call.
 */
export const getFullConfig = async (executiveId, periodId) => {
    const [kpiConfigs, compositeConfig] = await Promise.all([
        repository.getAllIncentiveConfigs(executiveId, periodId),
        repository.getCompositeConfig(executiveId, periodId),
    ]);
    return { kpiConfigs, compositeConfig };
};

/**
 * Save / update a single KPI config (Manager only, status must be draft).
 * Validates slabs before saving.
 *
 * @param {object} config
 * @param {string|number} config.executiveId
 * @param {number}        config.periodId
 * @param {string}        config.kpiCode
 * @param {Array}         config.slabs          - [{min, max, bonus}]
 * @param {number}        [config.commissionRate] - Required for revenue KPIs
 * @param {string}        [config.slabType]      - "cumulative"|"non_cumulative"
 * @param {number}        [config.bonusThreshold]
 * @param {number}        [config.bonusAmount]
 */
export const saveKpiConfig = async (config) => {
    const { executiveId, periodId, kpiCode, commissionRate, slabType } = config;

    // Normalize slab field names (frontend may send from/to/amount)
    const slabs = normalizeSlabs(config.slabs || []);

    // Validate normalized slabs
    if (slabs.length) validateSlabs(slabs);

    // Revenue KPIs must have a commission rate
    if (KPI_COMMISSION_CODES.has(kpiCode) && (!commissionRate || commissionRate <= 0)) {
        throw new Error(`KPI '${kpiCode}' is a revenue KPI and requires a commission_rate > 0.`);
    }

    return await repository.upsertIncentiveConfig({
        executive_id:    executiveId,
        period_id:       periodId,
        kpi_code:        kpiCode,
        slabs,
        commission_rate: commissionRate || 0,
        slab_type:       slabType || "non_cumulative",
        bonus_threshold: config.bonusThreshold || 0,
        bonus_amount:    config.bonusAmount    || 0,
    });
};

/**
 * Save / update composite bonus config (Manager only, status must be draft).
 */
export const saveCompositeConfig = async (executiveId, periodId, compositeBonus) => {
    if (compositeBonus < 0) throw new Error("Composite bonus cannot be negative.");
    return await repository.upsertCompositeConfig({
        executive_id:    executiveId,
        period_id:       periodId,
        composite_bonus: compositeBonus,
    });
};

/**
 * Submit ALL configs (KPI + composite) for Admin approval.
 * Validates at least one KPI config exists before submitting.
 */
export const submitForApproval = async (executiveId, periodId, submittedBy) => {
    const { kpiConfigs } = await getFullConfig(executiveId, periodId);
    if (!kpiConfigs.length) {
        throw new Error("No KPI configs found. Configure at least one KPI before submitting.");
    }

    await Promise.all([
        repository.submitIncentiveConfigs(executiveId, periodId, submittedBy),
        repository.submitCompositeConfig(executiveId, periodId, submittedBy),
    ]);

    return { message: "Configs submitted for Admin approval." };
};

/**
 * Admin approves all configs for an executive/period.
 */
export const approveConfig = async (executiveId, periodId, approvedBy) => {
    await Promise.all([
        repository.approveIncentiveConfigs(executiveId, periodId, approvedBy),
        repository.approveCompositeConfig(executiveId, periodId, approvedBy),
    ]);

    await repository.logKpiAudit({
        entity_type:  "period",
        record_id:    periodId,
        action:       "approve",
        old_value:    { status: "pending_approval" },
        new_value:    { status: "active", executive_id: executiveId },
        reason:       "Incentive config approved by Admin",
        performed_by: approvedBy,
    });

    return { message: "Incentive configs approved and are now active." };
};

/**
 * Admin rejects configs with mandatory reason.
 */
export const rejectConfig = async (executiveId, periodId, rejectedBy, reason) => {
    if (!reason) throw new Error("Rejection reason is mandatory.");

    await Promise.all([
        repository.rejectIncentiveConfigs(executiveId, periodId, rejectedBy, reason),
        repository.rejectCompositeConfig(executiveId, periodId, rejectedBy, reason),
    ]);

    await repository.logKpiAudit({
        entity_type:  "period",
        record_id:    periodId,
        action:       "reject",
        old_value:    { status: "pending_approval" },
        new_value:    { status: "rejected", reason },
        reason,
        performed_by: rejectedBy,
    });

    return { message: "Incentive configs rejected.", reason };
};

// ─── Calculation ──────────────────────────────────────────────────────────────

/**
 * Manager triggers full incentive calculation for an executive in a period.
 * Delegates to the engine which handles all 3 layers + locking.
 */
export const calculatePeriod = async (executiveId, periodId, triggeredBy) => {
    return await calculatePeriodIncentive(executiveId, periodId, triggeredBy);
};

// ─── Results & Payout ─────────────────────────────────────────────────────────

/**
 * Get per-KPI incentive results + payout summary for an executive/period.
 */
export const getResults = async (executiveId, periodId) => {
    const [kpiResults, payoutSummary] = await Promise.all([
        repository.getIncentiveResultsByPeriod(executiveId, periodId),
        repository.getPayoutSummary(executiveId, periodId),
    ]);
    return { kpiResults, payoutSummary };
};

/**
 * Admin approves payout for an executive/period.
 */
export const approvePayout = async (executiveId, periodId, approvedBy) => {
    const summary = await repository.getPayoutSummary(executiveId, periodId);
    if (!summary) throw new Error("No payout summary found. Run calculation first.");
    if (summary.status !== "calculated") {
        throw new Error(`Payout is already '${summary.status}'. Only 'calculated' payouts can be approved.`);
    }

    await repository.approvePayoutSummary(executiveId, periodId, approvedBy);
    // PRD: lock results AFTER approval, not after calculation
    await repository.lockIncentiveResults(executiveId, periodId);

    await repository.logKpiAudit({
        entity_type:  "period",
        record_id:    periodId,
        action:       "payout_approve",
        old_value:    { status: "calculated" },
        new_value:    { status: "approved", executive_id: executiveId },
        reason:       "Payout approved by Admin",
        performed_by: approvedBy,
    });

    return { message: "Payout approved successfully.", grand_total: summary.grand_total };
};

/**
 * Admin rejects payout with reason.
 */
export const rejectPayout = async (executiveId, periodId, rejectedBy, reason) => {
    if (!reason) throw new Error("Rejection reason is mandatory.");

    const summary = await repository.getPayoutSummary(executiveId, periodId);
    if (!summary) throw new Error("No payout summary found.");
    if (summary.status !== "calculated") {
        throw new Error(`Payout is '${summary.status}'. Only 'calculated' payouts can be rejected.`);
    }

    await repository.rejectPayoutSummary(executiveId, periodId, rejectedBy, reason);

    await repository.logKpiAudit({
        entity_type:  "period",
        record_id:    periodId,
        action:       "payout_reject",
        old_value:    { status: "calculated" },
        new_value:    { status: "rejected", reason },
        reason,
        performed_by: rejectedBy,
    });

    return { message: "Payout rejected.", reason };
};

/**
 * Admin view — all payout summaries for a period across all executives.
 */
export const getAllPayouts = async (periodId) => {
    return await repository.getAllPayoutsByPeriod(periodId);
};

/**
 * Admin resets a calculated (not yet approved) incentive so Manager can recalculate.
 * PRD: "Any recalculation should require explicit reset / admin override."
 * Blocked if payout is already approved (permanently locked).
 */
export const resetCalculation = async (executiveId, periodId, resetBy, reason) => {
    if (!reason) throw new Error("Reset reason is mandatory.");

    const summary = await repository.getPayoutSummary(executiveId, periodId);
    if (summary?.status === "approved") {
        throw new Error("Payout is already approved and permanently locked. Cannot reset.");
    }

    await Promise.all([
        repository.deleteIncentiveResults(executiveId, periodId),
        repository.deletePayoutSummary(executiveId, periodId),
    ]);

    await repository.logKpiAudit({
        entity_type:  "period",
        record_id:    periodId,
        action:       "reset",
        old_value:    { status: summary?.status || "none" },
        new_value:    { status: "reset", executive_id: executiveId },
        reason,
        performed_by: resetBy,
    });

    return { message: "Incentive calculation reset. Manager can now recalculate." };
};
