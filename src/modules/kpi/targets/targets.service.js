import * as repository from "../shared/kpi.repository.js";
import { validateTargetEntry } from "./targets.validator.js";
import { AUDIT_ENTITY_TYPES } from "../shared/kpi.constants.js";

/**
 * Service: KPI Target Management
 * Handles individual and team target logic with transaction safety and atomic sync.
 */

export const createTarget = async (executiveId, periodId, kpiCode, values, currentUser) => {
    const { id: userId, kpiRole, teamId: userTeamId } = currentUser;

    return await repository.withTransaction(async (connection) => {
        // 1. Validation & Locking (Basic checks)
        await validateTargetEntry(periodId, kpiCode, values);

        // 2. Row-Level Period Lock & Final Status Check
        const period = await repository.lockPeriodForUpdate(connection, periodId);
        if (!period) throw new Error("Period not found.");
        if (period.status === 'closed' || period.status === 'rejected' || period.is_frozen) {
            throw new Error(`Cannot modify targets. Period is ${period.status}${period.is_frozen ? ' (frozen)' : ''}.`);
        }

        // 3. Team Isolation Check
        const [execRows] = await connection.query("SELECT team_id FROM one_employee_cache WHERE one_employee_id = ?", [executiveId]);
        const execTeamId = execRows[0]?.team_id;

        if (kpiRole !== 'KPI Admin' && execTeamId !== userTeamId) {
            throw new Error("Forbidden: You can only set targets for your own team members.");
        }

        // 4. Fetch Existing to Append History
        const existingTargets = await repository.getTargetsByExecutive(executiveId, periodId);
        const prevTarget = existingTargets.find(t => t.kpi_code === kpiCode);

        // Requirement: Duplicate target not allowed if trying to "add" new. 
        // We'll treat this as an "upsert" but log it correctly.
        
        const revision = {
            timestamp: new Date().toISOString(),
            old_value: prevTarget ? { 
                val: prevTarget.target_value, 
                bench: prevTarget.benchmark_value, 
                ceil: prevTarget.ceiling_value 
            } : null,
            new_value: values,
            updated_by: userId,
            reason: values.reason || (prevTarget ? "Update" : "Initial Set")
        };

        const target = {
            executive_id: executiveId,
            period_id: periodId,
            kpi_code: kpiCode,
            target_value: values.target_value || 0,
            benchmark_value: values.benchmark_value || null,
            ceiling_value: values.ceiling_value || null,
            set_by: userId,
            revision_history: prevTarget ? [...prevTarget.revision_history, revision] : [revision]
        };

        const result = await repository.upsertTarget(target, connection);

        // 5. Audit Log (Standardized)
        await repository.logKpiAudit({
            entity_type: AUDIT_ENTITY_TYPES.TARGET,
            record_id: prevTarget ? prevTarget.id : (result.insertId || 0),
            action: prevTarget ? 'update' : 'create',
            old_value: revision.old_value,
            new_value: values,
            reason: revision.reason,
            performed_by: userId
        }, connection);

        // 6. Trigger Team Sync (Atomic)
        if (execTeamId) {
            await syncTeamTarget(execTeamId, periodId, kpiCode, connection);
        }

        return result;
    });
};

export const getTargets = async (executiveId, periodId) => {
    return await repository.getTargetsByExecutive(executiveId, periodId);
};

/**
 * Team Aggregations & Overrides
 */
export const syncTeamTarget = async (teamId, periodId, kpiCode, connection = null) => {
    const db = connection || repository.getPool();

    // 1. Single Aggregation Query
    const autoSum = await repository.getTeamMembersTargetsSum(teamId, periodId, kpiCode, db);

    // 2. Fetch existing to check for override preservation
    const [existing] = await db.query(
        "SELECT * FROM kpi_team_targets WHERE team_id = ? AND period_id = ? AND kpi_code = ?",
        [teamId, periodId, kpiCode]
    );
    const prevTeamTarget = existing[0];

    const teamTarget = {
        team_id: teamId,
        period_id: periodId,
        kpi_code: kpiCode,
        auto_sum: autoSum,
        override_value: prevTeamTarget ? prevTeamTarget.override_value : null,
        override_by: prevTeamTarget ? prevTeamTarget.override_by : null,
        reason: prevTeamTarget ? prevTeamTarget.reason : null,
        revision_history: prevTeamTarget ? prevTeamTarget.revision_history : []
    };

    // 3. Atomic Upsert (CASE logic is inside repository.upsertTeamTarget)
    return await repository.upsertTeamTarget(teamTarget, db);
};

export const overrideTeamTarget = async (teamId, periodId, kpiCode, overrideValue, currentUser, reason) => {
    const { id: userId, kpiRole, teamId: userTeamId } = currentUser;

    if (!reason) throw new Error("A reason for override is mandatory.");

    return await repository.withTransaction(async (connection) => {
        // 1. Lock Check
        const period = await repository.lockPeriodForUpdate(connection, periodId);
        if (!period) throw new Error("Period not found.");
        if (period.status === 'closed' || period.status === 'rejected' || period.is_frozen) {
            throw new Error("Cannot override targets for a closed/rejected/frozen period.");
        }

        // 2. Team Isolation Check
        if (kpiRole !== 'KPI Admin' && teamId !== userTeamId) {
            throw new Error("Forbidden: You can only override targets for your own team.");
        }

        // 3. Fetch current state
        const autoSum = await repository.getTeamMembersTargetsSum(teamId, periodId, kpiCode, connection);
        const [existing] = await connection.query(
            "SELECT * FROM kpi_team_targets WHERE team_id = ? AND period_id = ? AND kpi_code = ?",
            [teamId, periodId, kpiCode]
        );
        const prevTeamTarget = existing[0];

        const revision = {
            timestamp: new Date().toISOString(),
            action: "override",
            old_override: prevTeamTarget ? prevTeamTarget.override_value : null,
            new_override: overrideValue,
            reason: reason,
            updated_by: userId
        };

        const teamTarget = {
            team_id: teamId,
            period_id: periodId,
            kpi_code: kpiCode,
            auto_sum: autoSum,
            override_value: overrideValue,
            override_by: userId,
            reason: reason,
            revision_history: prevTeamTarget ? [...prevTeamTarget.revision_history, revision] : [revision]
        };

        const result = await repository.upsertTeamTarget(teamTarget, connection);

        // 4. Audit Log
        await repository.logKpiAudit({
            entity_type: AUDIT_ENTITY_TYPES.TEAM_TARGET,
            record_id: prevTeamTarget ? prevTeamTarget.id : (result.insertId || 0),
            action: 'override',
            old_value: { override: revision.old_override },
            new_value: { override: overrideValue },
            reason: reason,
            performed_by: userId
        }, connection);

        return result;
    });
};

export const setBulkTargets = async (targets, currentUser) => {
    const { id: userId } = currentUser;

    return await repository.withTransaction(async (connection) => {
        const periodId = targets[0]?.periodId;
        if (!periodId) throw new Error("Period ID is required.");

        // Lock check
        const period = await repository.lockPeriodForUpdate(connection, periodId);
        if (!period || period.status === 'closed' || period.status === 'rejected' || period.is_frozen) {
            throw new Error("Cannot modify targets for this period.");
        }

        const preparedTargets = targets.map(t => ({
            executive_id: t.executiveId,
            period_id: t.periodId,
            kpi_code: t.kpiCode,
            target_value: t.values.target_value || 0,
            benchmark_value: t.values.benchmark_value || null,
            ceiling_value: t.values.ceiling_value || null,
            set_by: userId,
            revision_history: [{
                timestamp: new Date().toISOString(),
                action: "bulk_set",
                new_value: t.values,
                updated_by: userId,
                reason: t.values.reason || "Bulk Upload"
            }]
        }));

        const result = await repository.batchInsertTargets(preparedTargets, connection);

        // Audit Log
        await repository.logKpiAudit({
            entity_type: AUDIT_ENTITY_TYPES.PERIOD, // Bulk action logged against period
            record_id: periodId,
            action: 'update',
            new_value: { bulk_insert_count: targets.length },
            reason: "Bulk Target Set",
            performed_by: userId
        }, connection);

        // Reconcile all affected teams/KPIs (Simplified for bulk)
        const teamKpiPairs = [...new Set(targets.map(t => `${t.teamId}:${t.kpiCode}`))];
        for (const pair of teamKpiPairs) {
            const [teamId, kpiCode] = pair.split(':');
            await syncTeamTarget(teamId, periodId, kpiCode, connection);
        }

        return result;
    });
};
