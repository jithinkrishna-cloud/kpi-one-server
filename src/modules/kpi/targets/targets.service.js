import * as repository from "../shared/kpi.repository.js";
import { validateTargetEntry } from "./targets.validator.js";
import { AUDIT_ENTITY_TYPES } from "../shared/kpi.constants.js";

/**
 * Service: KPI Target Management
 * Handles individual and team target logic with transaction safety and atomic sync.
 */

export const createTarget = async (
  executiveId,
  periodId,
  kpiCode,
  values,
  currentUser,
) => {
  const { id: userId, kpiRole, teamIds = [] } = currentUser;

  return await repository.withTransaction(async (connection) => {
    // 1. Validation & Locking (Basic checks)
    await validateTargetEntry(periodId, kpiCode, values);

    // 2. Row-Level Period Lock & Final Status Check
    const period = await repository.lockPeriodForUpdate(connection, periodId);
    if (!period) throw new Error("Period not found.");
    if (
      period.status === "closed" ||
      period.status === "rejected" ||
      period.is_frozen
    ) {
      throw new Error(
        `Cannot modify targets. Period is ${period.status}${period.is_frozen ? " (frozen)" : ""}.`,
      );
    }

    // 3. Team Isolation Check
    const [execRows] = await connection.query(
      "SELECT team_id FROM one_employee_cache WHERE one_employee_id = ?",
      [executiveId],
    );
    const execTeamId = execRows[0]?.team_id;

    if (kpiRole !== "KPI Admin" && !teamIds.map(String).includes(String(execTeamId))) {
      throw new Error(
        "Forbidden: You can only set targets for your own team members.",
      );
    }

    // 4. Fetch Existing to Append History
    const existingTargets = await repository.getTargetsByExecutive(
      executiveId,
      periodId,
      connection,
    );
    const prevTarget = existingTargets.find((t) => t.kpi_code === kpiCode);

    // AC09: Reason is mandatory for edits (not initial set)
    if (prevTarget && !values.reason?.trim()) {
      throw new Error("Reason is mandatory when editing an existing target.");
    }

    // AC10: Normalize both old and new to the same shape for clean history
    const normalizeValues = (v) => ({
      val:   v?.target_value   ?? null,
      bench: v?.benchmark_value ?? null,
      ceil:  v?.ceiling_value   ?? null,
    });

    const revision = {
      timestamp:  new Date().toISOString(),
      old_value:  prevTarget ? normalizeValues(prevTarget) : null,
      new_value:  normalizeValues(values),
      updated_by: userId,
      reason:     values.reason?.trim() || "Initial Set",
    };

    const target = {
      executive_id:    executiveId,
      period_id:       periodId,
      kpi_code:        kpiCode,
      target_value:    values.target_value    ?? null,
      benchmark_value: values.benchmark_value ?? null,
      ceiling_value:   values.ceiling_value   ?? null,
      set_by:          userId,
      revision_history: prevTarget
        ? [...prevTarget.revision_history, revision]
        : [revision],
    };

    const result = await repository.upsertTarget(target, connection);

    // 5. Audit Log (Standardized)
    await repository.logKpiAudit(
      {
        entity_type: AUDIT_ENTITY_TYPES.TARGET,
        record_id:   prevTarget ? prevTarget.id : result.insertId || 0,
        action:      prevTarget ? "update" : "create",
        old_value:   revision.old_value,
        new_value:   revision.new_value,
        reason:      revision.reason,
        performed_by: userId,
      },
      connection,
    );

    // 6. Trigger Team Sync (Atomic)
    if (execTeamId) {
      await syncTeamTarget(execTeamId, periodId, kpiCode, connection);
    }

    // 7. Return the freshly updated record
    const updated = await repository.getTargetsByExecutive(
      executiveId,
      periodId,
      connection,
    );
    return updated.find((t) => t.kpi_code === kpiCode);
  });
};

export const getTargets = async (executiveId, periodId) => {
  return await repository.getTargetsByExecutive(executiveId, periodId);
};

export const getTeamTargets = async (teamId, periodId) => {
  return await repository.getTeamTargetsByPeriod(teamId, periodId);
};

/**
 * Team Aggregations & Overrides
 */
export const syncTeamTarget = async (
  teamId,
  periodId,
  kpiCode,
  connection = null,
) => {
  const db = connection || repository.getPool();

  // 1. Single Aggregation Query
  const autoSum = await repository.getTeamMembersTargetsSum(
    teamId,
    periodId,
    kpiCode,
    db,
  );

  // 2. Fetch existing to check for override preservation
  const existing = await repository.getTeamTargetsByPeriod(
    teamId,
    periodId,
    db,
  );
  const prevTeamTarget = existing.find((t) => t.kpi_code === kpiCode);

  const teamTarget = {
    team_id: teamId,
    period_id: periodId,
    kpi_code: kpiCode,
    auto_sum: autoSum,
    override_value: prevTeamTarget ? prevTeamTarget.override_value : null,
    override_by: prevTeamTarget ? prevTeamTarget.override_by : null,
    reason: prevTeamTarget ? prevTeamTarget.reason : null,
    revision_history: prevTeamTarget ? prevTeamTarget.revision_history : [],
  };

  // 3. Atomic Upsert (CASE logic is inside repository.upsertTeamTarget)
  await repository.upsertTeamTarget(teamTarget, db);

  // 4. Bubble up — sync franchisee target from updated team totals
  const [teamRow] = await db.query(
    "SELECT franchisee_id FROM one_employee_cache WHERE team_id = ? AND franchisee_id IS NOT NULL LIMIT 1",
    [teamId],
  );
  const franchiseeId = teamRow[0]?.franchisee_id;
  if (franchiseeId) {
    await syncFranchiseeTarget(franchiseeId, periodId, kpiCode, db);
  }
};

export const overrideTeamTarget = async (
  teamId,
  periodId,
  kpiCode,
  overrideValue,
  currentUser,
  reason,
) => {
  const { id: userId, kpiRole, teamIds = [] } = currentUser;

  if (!reason) throw new Error("A reason for override is mandatory.");

  return await repository.withTransaction(async (connection) => {
    // 1. Lock Check
    const period = await repository.lockPeriodForUpdate(connection, periodId);
    if (!period) throw new Error("Period not found.");
    if (
      period.status === "closed" ||
      period.status === "rejected" ||
      period.is_frozen
    ) {
      throw new Error(
        "Cannot override targets for a closed/rejected/frozen period.",
      );
    }

    // 2. Team Isolation Check
    if (kpiRole !== "KPI Admin" && !teamIds.map(String).includes(String(teamId))) {
      throw new Error(
        "Forbidden: You can only override targets for your own team.",
      );
    }

    // 3. Fetch current state
    const autoSum = await repository.getTeamMembersTargetsSum(
      teamId,
      periodId,
      kpiCode,
      connection,
    );
    const existing = await repository.getTeamTargetsByPeriod(
      teamId,
      periodId,
      connection,
    );
    const prevTeamTarget = existing.find((t) => t.kpi_code === kpiCode);

    const revision = {
      timestamp: new Date().toISOString(),
      action: "override",
      old_override: prevTeamTarget ? prevTeamTarget.override_value : null,
      new_override: overrideValue,
      reason: reason,
      updated_by: userId,
    };

    const teamTarget = {
      team_id: teamId,
      period_id: periodId,
      kpi_code: kpiCode,
      auto_sum: autoSum,
      override_value: overrideValue,
      override_by: userId,
      reason: reason,
      revision_history: prevTeamTarget
        ? [...prevTeamTarget.revision_history, revision]
        : [revision],
    };

    const result = await repository.upsertTeamTarget(teamTarget, connection);

    // 4. Audit Log
    await repository.logKpiAudit(
      {
        entity_type: AUDIT_ENTITY_TYPES.TEAM_TARGET,
        record_id: prevTeamTarget ? prevTeamTarget.id : result.insertId || 0,
        action: "override",
        old_value: { override: revision.old_override },
        new_value: { override: overrideValue },
        reason: reason,
        performed_by: userId,
      },
      connection,
    );

    // 5. Return updated team target
    const updated = await repository.getTeamTargetsByPeriod(
      teamId,
      periodId,
      connection,
    );
    return updated.find((t) => t.kpi_code === kpiCode);
  });
};

export const setBulkTargets = async (targets, currentUser) => {
  const { id: userId, kpiRole, teamIds = [] } = currentUser;

  return await repository.withTransaction(async (connection) => {
    const periodId = targets[0]?.periodId;
    if (!periodId) throw new Error("Period ID is required.");

    // Lock check
    const period = await repository.lockPeriodForUpdate(connection, periodId);
    if (
      !period ||
      period.status === "closed" ||
      period.status === "rejected" ||
      period.is_frozen
    ) {
      throw new Error("Cannot modify targets for this period.");
    }

    // Resolve each executive's team from cache (don't trust request body for team IDs)
    const execIds = [...new Set(targets.map((t) => t.executiveId))];
    const placeholders = execIds.map(() => "?").join(",");
    const [execRows] = await connection.query(
      `SELECT one_employee_id, team_id FROM one_employee_cache WHERE one_employee_id IN (${placeholders})`,
      execIds,
    );
    const execTeamMap = Object.fromEntries(
      execRows.map((r) => [String(r.one_employee_id), r.team_id]),
    );

    // Team Isolation Check
    if (kpiRole !== "KPI Admin") {
      const userTeamStrings = teamIds.map(String);
      for (const t of targets) {
        const execTeam = String(execTeamMap[String(t.executiveId)] ?? "");
        if (!userTeamStrings.includes(execTeam)) {
          throw new Error(
            `Forbidden: Executive ${t.executiveId} is not in your team.`,
          );
        }
      }
    }

    // Fetch existing targets for all affected executives to check AC09 + preserve history
    const existingByKey = {};
    for (const execId of execIds) {
      const rows = await repository.getTargetsByExecutive(execId, periodId, connection);
      for (const row of rows) {
        existingByKey[`${execId}:${row.kpi_code}`] = row;
      }
    }

    // AC09: Reason mandatory for any target that already exists (bulk edit)
    for (const t of targets) {
      const key = `${t.executiveId}:${t.kpiCode}`;
      if (existingByKey[key] && !t.values.reason?.trim()) {
        throw new Error(
          `Reason is mandatory when editing an existing target (executive ${t.executiveId}, KPI ${t.kpiCode}).`,
        );
      }
    }

    const normalizeValues = (v) => ({
      val:   v?.target_value    ?? null,
      bench: v?.benchmark_value ?? null,
      ceil:  v?.ceiling_value   ?? null,
    });

    const preparedTargets = targets.map((t) => {
      const key  = `${t.executiveId}:${t.kpiCode}`;
      const prev = existingByKey[key];
      const revision = {
        timestamp:  new Date().toISOString(),
        action:     prev ? "bulk_edit" : "bulk_set",
        old_value:  prev ? normalizeValues(prev) : null,
        new_value:  normalizeValues(t.values),
        updated_by: userId,
        reason:     t.values.reason?.trim() || "Bulk Upload",
      };
      return {
        executive_id:    t.executiveId,
        period_id:       t.periodId,
        kpi_code:        t.kpiCode,
        target_value:    t.values.target_value    ?? null,
        benchmark_value: t.values.benchmark_value ?? null,
        ceiling_value:   t.values.ceiling_value   ?? null,
        set_by:          userId,
        revision_history: prev ? [...prev.revision_history, revision] : [revision],
      };
    });

    await repository.batchInsertTargets(preparedTargets, connection);

    // Audit Log
    await repository.logKpiAudit(
      {
        entity_type: AUDIT_ENTITY_TYPES.PERIOD,
        record_id: periodId,
        action: "update",
        new_value: { bulk_insert_count: targets.length },
        reason: "Bulk Target Set",
        performed_by: userId,
      },
      connection,
    );

    // Reconcile all affected team/KPI pairs — derive team from cache, not request body
    const teamKpiPairs = new Set(
      targets
        .filter((t) => execTeamMap[String(t.executiveId)])
        .map((t) => `${execTeamMap[String(t.executiveId)]}:${t.kpiCode}`),
    );
    for (const pair of teamKpiPairs) {
      const [teamId, kpiCode] = pair.split(":");
      await syncTeamTarget(teamId, periodId, kpiCode, connection);
    }

    return {
      message: `Successfully updated ${targets.length} targets`,
      count: targets.length,
      period_id: periodId,
    };
  });
};

// ---------------------------------------------------------------------------
// Franchisee Target — F12-A
// ---------------------------------------------------------------------------

/**
 * Recalculates the franchisee target auto_sum from all team final_values.
 * Preserves any existing override. Called automatically from syncTeamTarget.
 */
export const syncFranchiseeTarget = async (franchiseeId, periodId, kpiCode, connection = null) => {
  const db = connection || repository.getPool();

  const autoSum = await repository.getFranchiseeTeamTargetsSum(
    franchiseeId, periodId, kpiCode, db,
  );

  const existing = await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId, db);
  const prev = existing.find((r) => r.kpi_code === kpiCode);

  return await repository.upsertFranchiseeTarget({
    franchisee_id:   franchiseeId,
    period_id:       periodId,
    kpi_code:        kpiCode,
    auto_sum:        autoSum,
    override_value:  prev?.override_value  ?? null,
    override_by:     prev?.override_by     ?? null,
    override_reason: prev?.override_reason ?? null,
    revision_history: prev?.revision_history ?? [],
  }, db);
};

/**
 * Admin overrides a franchisee target. Reason is mandatory.
 * auto_sum is preserved; final_value becomes override_value.
 */
export const overrideFranchiseeTarget = async (
  franchiseeId, periodId, kpiCode, overrideValue, currentUser, reason,
) => {
  const { id: userId } = currentUser;

  if (!reason || !String(reason).trim()) {
    throw new Error("A reason for override is mandatory.");
  }
  if (overrideValue === null || overrideValue === undefined || isNaN(overrideValue)) {
    throw new Error("overrideValue must be a valid number.");
  }

  return await repository.withTransaction(async (connection) => {
    const period = await repository.lockPeriodForUpdate(connection, periodId);
    if (!period) throw new Error("Period not found.");
    if (period.status === "closed" || period.status === "rejected" || period.is_frozen) {
      throw new Error("Cannot override targets for a closed/rejected/frozen period.");
    }

    const autoSum = await repository.getFranchiseeTeamTargetsSum(
      franchiseeId, periodId, kpiCode, connection,
    );
    const existing = await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId, connection);
    const prev = existing.find((r) => r.kpi_code === kpiCode);

    const revision = {
      timestamp:    new Date().toISOString(),
      action:       "override",
      old_override: prev?.override_value ?? null,
      new_override: overrideValue,
      reason,
      updated_by:   userId,
    };

    const result = await repository.upsertFranchiseeTarget({
      franchisee_id:   franchiseeId,
      period_id:       periodId,
      kpi_code:        kpiCode,
      auto_sum:        autoSum,
      override_value:  overrideValue,
      override_by:     userId,
      override_reason: reason,
      revision_history: prev ? [...prev.revision_history, revision] : [revision],
    }, connection);

    await repository.logKpiAudit({
      entity_type:  AUDIT_ENTITY_TYPES.FRANCHISEE_TARGET,
      record_id:    prev?.id ?? result.insertId ?? 0,
      action:       "override",
      old_value:    { override: prev?.override_value ?? null },
      new_value:    { override: overrideValue },
      reason,
      performed_by: userId,
    }, connection);

    const updated = await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId, connection);
    return updated.find((r) => r.kpi_code === kpiCode);
  });
};

/**
 * Admin resets a franchisee override — final_value reverts to auto_sum.
 * Reason is still mandatory (the reset is auditable).
 */
export const resetFranchiseeOverride = async (
  franchiseeId, periodId, kpiCode, currentUser, reason,
) => {
  const { id: userId } = currentUser;

  if (!reason || !String(reason).trim()) {
    throw new Error("A reason for resetting the override is mandatory.");
  }

  return await repository.withTransaction(async (connection) => {
    const period = await repository.lockPeriodForUpdate(connection, periodId);
    if (!period) throw new Error("Period not found.");
    if (period.status === "closed" || period.status === "rejected" || period.is_frozen) {
      throw new Error("Cannot reset override for a closed/rejected/frozen period.");
    }

    const existing = await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId, connection);
    const prev = existing.find((r) => r.kpi_code === kpiCode);
    if (!prev?.override_value) {
      throw new Error("No active override found for this franchisee target.");
    }

    const autoSum = await repository.getFranchiseeTeamTargetsSum(
      franchiseeId, periodId, kpiCode, connection,
    );

    const revision = {
      timestamp:    new Date().toISOString(),
      action:       "reset",
      old_override: prev.override_value,
      new_override: null,
      reason,
      updated_by:   userId,
    };

    const result = await repository.upsertFranchiseeTarget({
      franchisee_id:   franchiseeId,
      period_id:       periodId,
      kpi_code:        kpiCode,
      auto_sum:        autoSum,
      override_value:  null,
      override_by:     null,
      override_reason: null,
      revision_history: [...prev.revision_history, revision],
    }, connection);

    await repository.logKpiAudit({
      entity_type:  AUDIT_ENTITY_TYPES.FRANCHISEE_TARGET,
      record_id:    prev.id,
      action:       "reset",
      old_value:    { override: prev.override_value },
      new_value:    { override: null },
      reason,
      performed_by: userId,
    }, connection);

    const updated = await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId, connection);
    return updated.find((r) => r.kpi_code === kpiCode);
  });
};

export const getFranchiseeTargets = async (franchiseeId, periodId) => {
  return await repository.getFranchiseeTargetsByPeriod(franchiseeId, periodId);
};
