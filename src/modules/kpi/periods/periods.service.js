import * as repository from "../shared/kpi.repository.js";
import { PERIOD_STATUS, AUDIT_ENTITY_TYPES } from "../shared/kpi.constants.js";

/**
 * Service: KPI Period Management
 * Handles the definition and status of Monthly/Quarterly/Yearly cycles.
 */

export const createPeriod = async (periodData) => {
  const { type } = periodData;

  // Requirement: Monthly is active immediately, others require approval
  let status = PERIOD_STATUS.PENDING;
  if (type.toLowerCase() === "monthly") {
    status = PERIOD_STATUS.ACTIVE;
  }

  const period = {
    ...periodData,
    status,
  };

  const id = await repository.createPeriod(period);
  return await getPeriodById(id);
};

export const getAllPeriods = async () => {
  return await repository.getPeriods();
};

export const getPeriodById = async (id) => {
  const periods = await repository.getPeriods();
  return periods.find((p) => p.id === parseInt(id));
};

export const approvePeriod = async (id, approvedBy) => {
  return await repository.withTransaction(async (connection) => {
    // 1. Pessimistic Lock
    const period = await repository.lockPeriodForUpdate(connection, id);
    if (!period) throw new Error("Period not found.");

    // 2. Idempotency & Validation
    if (period.status === PERIOD_STATUS.ACTIVE)
      return { message: "Period already active." };
    if (period.status === PERIOD_STATUS.CLOSED)
      throw new Error("Cannot approve a closed period.");
    if (period.status === PERIOD_STATUS.REJECTED)
      throw new Error("Rejected periods must be recreated.");

    // 3. Empty Period Check
    const targetCount = await repository.countTargetsByPeriod(id, connection);
    if (targetCount === 0) {
      throw new Error(
        "Cannot approve an empty period. Please set targets first.",
      );
    }

    // 4. Update Status
    await repository.updatePeriodStatus(
      id,
      PERIOD_STATUS.ACTIVE,
      approvedBy,
      null,
      connection,
    );

    // 5. Audit Log
    await repository.logKpiAudit(
      {
        entity_type: AUDIT_ENTITY_TYPES.PERIOD,
        record_id: id,
        action: "approve",
        old_value: { status: period.status },
        new_value: { status: PERIOD_STATUS.ACTIVE },
        performed_by: approvedBy,
        reason: "Admin Approval",
      },
      connection,
    );

    return { id, status: PERIOD_STATUS.ACTIVE };
  });
};

export const rejectPeriod = async (id, rejectedBy, reason) => {
  if (!reason) throw new Error("A reason for rejection is mandatory.");

  return await repository.withTransaction(async (connection) => {
    const period = await repository.lockPeriodForUpdate(connection, id);
    if (!period) throw new Error("Period not found.");

    if (period.status === PERIOD_STATUS.REJECTED)
      return { message: "Period already rejected." };
    if (period.status === PERIOD_STATUS.ACTIVE)
      throw new Error("Cannot reject an active period.");
    if (period.status === PERIOD_STATUS.CLOSED)
      throw new Error("Cannot reject a closed period.");

    await repository.updatePeriodStatus(
      id,
      PERIOD_STATUS.REJECTED,
      null,
      reason,
      connection,
    );

    await repository.logKpiAudit(
      {
        entity_type: AUDIT_ENTITY_TYPES.PERIOD,
        record_id: id,
        action: "reject",
        old_value: { status: period.status },
        new_value: { status: PERIOD_STATUS.REJECTED, reason },
        performed_by: rejectedBy,
        reason,
      },
      connection,
    );

    return { id, status: PERIOD_STATUS.REJECTED };
  });
};
