import * as repository from "../shared/kpi.repository.js";
import { validateTargetEntry } from "./targets.validator.js";

/**
 * Service: KPI Target Management
 * Handles individual and team target logic, including audit-ready revisions and sync.
 */

export const createTarget = async (executiveId, periodId, kpiCode, targetValue, userId) => {
    // 1. Validation & Locking
    await validateTargetEntry(periodId, targetValue);

    // 2. Audit Trail
    const revision = {
        timestamp: new Date().toISOString(),
        value: targetValue,
        updated_by: userId
    };

    const target = {
        executive_id: executiveId,
        period_id: periodId,
        kpi_code: kpiCode,
        target_value: targetValue,
        revision_history: [revision]
    };

    return await repository.upsertTarget(target);
};

export const getTargets = async (executiveId, periodId) => {
    return await repository.getTargetsByExecutive(executiveId, periodId);
};

export const approveTargets = async (executiveId, periodId, approvedBy) => {
    return await repository.approveTargets(executiveId, periodId, approvedBy);
};

/**
 * Team Aggregations & Overrides
 */
export const syncTeamTarget = async (teamId, periodId, kpiCode, userId) => {
    const autoSum = await repository.getTeamMembersTargetsSum(teamId, periodId, kpiCode);

    const revision = {
        timestamp: new Date().toISOString(),
        action: "sync",
        auto_sum: autoSum,
        updated_by: userId
    };

    const teamTarget = {
        team_id: teamId,
        period_id: periodId,
        kpi_code: kpiCode,
        auto_sum: autoSum,
        override_value: null,
        revision_history: [revision]
    };

    return await repository.upsertTeamTarget(teamTarget);
};

export const overrideTeamTarget = async (teamId, periodId, kpiCode, overrideValue, userId) => {
    // 1. Validation
    await validateTargetEntry(periodId, overrideValue);

    const autoSum = await repository.getTeamMembersTargetsSum(teamId, periodId, kpiCode);

    const revision = {
        timestamp: new Date().toISOString(),
        action: "override",
        override_value: overrideValue,
        updated_by: userId
    };

    const teamTarget = {
        team_id: teamId,
        period_id: periodId,
        kpi_code: kpiCode,
        auto_sum: autoSum,
        override_value: overrideValue,
        revision_history: [revision]
    };

    return await repository.upsertTeamTarget(teamTarget);
};

export const getTeamTargets = async (teamId, periodId) => {
    return await repository.getTeamTargetsByPeriod(teamId, periodId);
};
