import { getPool } from "../../../config/db.js";
export { getPool };

/**
 * KPI Repository - Production Grade Data Access
 */

// --- Transaction & Locking Helpers ---

export const withTransaction = async (callback) => {
    const connection = await getPool().getConnection();
    await connection.beginTransaction();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

export const lockPeriodForUpdate = async (connection, id) => {
    const [rows] = await connection.query(
        "SELECT * FROM kpi_periods WHERE id = ? FOR UPDATE",
        [id]
    );
    return rows[0];
};

// --- Periods ---

export const createPeriod = async (period, connection = null) => {
    const db = connection || getPool();
    const { name, start_date, end_date, type, status } = period;
    const [result] = await db.query(
        "INSERT INTO kpi_periods (name, start_date, end_date, type, status) VALUES (?, ?, ?, ?, ?)",
        [name, start_date, end_date, type, status || "draft"]
    );
    return result.insertId;
};

export const updatePeriodStatus = async (id, status, approvedBy = null, rejectionReason = null, connection = null) => {
    const db = connection || getPool();
    await db.query(
        "UPDATE kpi_periods SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?",
        [status, approvedBy, rejectionReason, id]
    );
};

export const getPeriods = async (connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query("SELECT * FROM kpi_periods ORDER BY start_date DESC");
    return rows;
};

export const countTargetsByPeriod = async (periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT COUNT(*) as count FROM kpi_targets WHERE period_id = ?",
        [periodId]
    );
    return rows[0].count;
};

/**
 * Count executives with targets in this period whose incentives are NOT yet calculated/approved.
 * Used as a pre-check before closing a period.
 */
export const countPendingIncentives = async (periodId, connection = null) => {
    const db = connection || getPool();
    // Executives who have targets but no incentive result (or result is still in 'draft')
    const [rows] = await db.query(`
        SELECT COUNT(DISTINCT t.executive_id) as count
        FROM kpi_targets t
        LEFT JOIN kpi_incentive_results ir
            ON ir.executive_id = t.executive_id
            AND ir.period_id = t.period_id
            AND ir.status NOT IN ('calculated', 'approved', 'paid')
        WHERE t.period_id = ?
          AND (ir.id IS NULL OR ir.status IN ('draft'))
    `, [periodId]);
    return rows[0].count;
};

/**
 * Count executives with targets in this period who are missing Collection (manual) actuals.
 * Collection is a manually-entered KPI — must be present before period close.
 */
export const countMissingCollectionActuals = async (periodId, connection = null) => {
    const db = connection || getPool();
    // Find executives who have a collection_revenue target but no actual for the period date range
    const [rows] = await db.query(`
        SELECT COUNT(DISTINCT t.executive_id) as count
        FROM kpi_targets t
        JOIN kpi_periods p ON p.id = t.period_id
        WHERE t.period_id = ?
          AND t.kpi_code = 'collection_revenue'
          AND NOT EXISTS (
              SELECT 1 FROM kpi_actuals_daily a
              WHERE a.executive_id = t.executive_id
                AND a.kpi_code = 'collection_revenue'
                AND a.actual_date BETWEEN p.start_date AND p.end_date
          )
    `, [periodId]);
    return rows[0].count;
};

// --- Targets ---

export const upsertTarget = async (target, connection = null) => {
    const db = connection || getPool();
    const { 
        executive_id, period_id, kpi_code, target_value, 
        benchmark_value, ceiling_value, set_by, revision_history 
    } = target;
    
    const [result] = await db.query(`
        INSERT INTO kpi_targets 
        (executive_id, period_id, kpi_code, target_value, benchmark_value, ceiling_value, set_by, revision_history)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            target_value = VALUES(target_value),
            benchmark_value = VALUES(benchmark_value),
            ceiling_value = VALUES(ceiling_value),
            revision_history = IFNULL(VALUES(revision_history), revision_history)
    `, [
        executive_id, period_id, kpi_code, target_value, 
        benchmark_value || null, ceiling_value || null, set_by, JSON.stringify(revision_history)
    ]);
    return result;
};

export const batchInsertTargets = async (targets, connection) => {
    if (!targets.length) return;
    
    const query = `
        INSERT INTO kpi_targets 
        (executive_id, period_id, kpi_code, target_value, benchmark_value, ceiling_value, set_by, revision_history)
        VALUES ?
        ON DUPLICATE KEY UPDATE 
            target_value = VALUES(target_value),
            benchmark_value = VALUES(benchmark_value),
            ceiling_value = VALUES(ceiling_value),
            revision_history = IFNULL(VALUES(revision_history), revision_history)
    `;

    const values = targets.map(t => [
        t.executive_id, t.period_id, t.kpi_code, t.target_value, 
        t.benchmark_value || null, t.ceiling_value || null, t.set_by, JSON.stringify(t.revision_history)
    ]);

    const [result] = await connection.query(query, [values]);
    return result;
};

export const getTargetsByExecutive = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_targets WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows.map(r => ({
        ...r,
        revision_history: r.revision_history
            ? (typeof r.revision_history === 'string' ? JSON.parse(r.revision_history) : r.revision_history)
            : [],
    }));
};

// --- Team Targets ---

export const upsertTeamTarget = async (teamTarget, connection = null) => {
    const db = connection || getPool();
    const { team_id, period_id, kpi_code, auto_sum, override_value, override_by, reason, revision_history } = teamTarget;

    const [result] = await db.query(`
        INSERT INTO kpi_team_targets 
        (team_id, period_id, kpi_code, auto_sum, override_value, override_by, reason, final_value, revision_history)
        VALUES (?, ?, ?, ?, ?, ?, ?, 
            CASE WHEN ? IS NOT NULL THEN ? ELSE ? END, 
        ?)
        ON DUPLICATE KEY UPDATE
            auto_sum = VALUES(auto_sum),
            override_value = VALUES(override_value),
            override_by = VALUES(override_by),
            reason = VALUES(reason),
            final_value = CASE 
                WHEN VALUES(override_value) IS NOT NULL THEN VALUES(override_value)
                ELSE VALUES(auto_sum)
            END,
            revision_history = IFNULL(VALUES(revision_history), revision_history)
    `, [
        team_id, period_id, kpi_code, auto_sum, override_value, override_by, reason, 
        override_value, override_value, auto_sum, JSON.stringify(revision_history)
    ]);
    return result;
};

export const getTeamTargetsByPeriod = async (teamId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_team_targets WHERE team_id = ? AND period_id = ?",
        [teamId, periodId]
    );
    return rows;
};

export const getTeamMembersTargetsSum = async (teamId, periodId, kpiCode, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT SUM(target_value) as total_sum
        FROM kpi_targets kt
        JOIN one_employee_cache oec ON kt.executive_id = oec.one_employee_id
        WHERE oec.team_id = ? AND kt.period_id = ? AND kt.kpi_code = ?
    `, [teamId, periodId, kpiCode]);

    return rows[0]?.total_sum || 0;
};

// --- Franchisee Targets ---

/**
 * SUM of all team final_values under a franchisee for a given period + KPI.
 * Joins kpi_team_targets → one_employee_cache to resolve team membership.
 */
export const getFranchiseeTeamTargetsSum = async (franchiseeId, periodId, kpiCode, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT COALESCE(SUM(ktt.final_value), 0) AS total_sum
        FROM kpi_team_targets ktt
        JOIN (
            SELECT DISTINCT team_id
            FROM one_employee_cache
            WHERE franchisee_id = ?
              AND team_id IS NOT NULL
        ) ft ON ktt.team_id = ft.team_id
        WHERE ktt.period_id = ?
          AND ktt.kpi_code  = ?
    `, [franchiseeId, periodId, kpiCode]);
    return rows[0]?.total_sum || 0;
};

export const upsertFranchiseeTarget = async (ft, connection = null) => {
    const db = connection || getPool();
    const { franchisee_id, period_id, kpi_code, auto_sum, override_value, override_by, override_reason, revision_history } = ft;

    const [result] = await db.query(`
        INSERT INTO kpi_franchisee_targets
            (franchisee_id, period_id, kpi_code, auto_sum, override_value, override_by, override_reason, final_value, revision_history)
        VALUES (?, ?, ?, ?, ?, ?, ?,
            CASE WHEN ? IS NOT NULL THEN ? ELSE ? END,
        ?)
        ON DUPLICATE KEY UPDATE
            auto_sum        = VALUES(auto_sum),
            override_value  = VALUES(override_value),
            override_by     = VALUES(override_by),
            override_reason = VALUES(override_reason),
            final_value     = CASE
                                WHEN VALUES(override_value) IS NOT NULL THEN VALUES(override_value)
                                ELSE VALUES(auto_sum)
                              END,
            revision_history = IFNULL(VALUES(revision_history), revision_history)
    `, [
        franchisee_id, period_id, kpi_code,
        auto_sum, override_value, override_by, override_reason,
        override_value, override_value, auto_sum,
        JSON.stringify(revision_history)
    ]);
    return result;
};

export const getFranchiseeTargetsByPeriod = async (franchiseeId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        'SELECT * FROM kpi_franchisee_targets WHERE franchisee_id = ? AND period_id = ?',
        [franchiseeId, periodId]
    );
    return rows.map(r => ({
        ...r,
        revision_history: r.revision_history
            ? (typeof r.revision_history === 'string' ? JSON.parse(r.revision_history) : r.revision_history)
            : [],
    }));
};

// --- Audit Logging ---

export const logKpiAudit = async (audit, connection = null) => {
    const db = connection || getPool();
    const { entity_type, record_id, action, old_value, new_value, reason, performed_by } = audit;
    
    // Minimal diffing logic: Only store changed fields if both are present
    let diff = new_value;
    if (old_value && new_value && typeof old_value === 'object' && typeof new_value === 'object') {
        diff = {};
        for (const key in new_value) {
            if (JSON.stringify(new_value[key]) !== JSON.stringify(old_value[key])) {
                diff[key] = { old: old_value[key], new: new_value[key] };
            }
        }
    }

    await db.query(`
        INSERT INTO kpi_audit_log (entity_type, table_name, record_id, action, old_value, new_value, reason, performed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        entity_type, 
        ({ target: 'kpi_targets', period: 'kpi_periods', team_target: 'kpi_team_targets', franchisee_target: 'kpi_franchisee_targets' })[entity_type] || 'kpi_audit_log',
        record_id, action, 
        old_value ? JSON.stringify(old_value) : null, 
        JSON.stringify(diff), 
        reason, performed_by
    ]);
};

// --- Actuals ---

/**
 * Upsert a daily actual value.
 * Manual entries are protected by immutability checks at the service layer.
 * Auto entries always overwrite (latest sync wins).
 */
export const upsertActual = async (actualData, connection = null) => {
    const db = connection || getPool();
    const { executive_id, actual_date, kpi_code, value, source, note } = actualData;

    const [result] = await db.query(`
        INSERT INTO kpi_actuals_daily (executive_id, actual_date, kpi_code, value, source, note, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
            value      = IF(source = 'manual', value, VALUES(value)),
            source     = IF(source = 'manual', source, VALUES(source)),
            note       = IF(source = 'manual', note, VALUES(note)),
            synced_at  = NOW()
    `, [executive_id, actual_date, kpi_code, value, source, note || null]);

    return result;
};

/**
 * Returns aggregated (SUM) actuals per KPI code for an executive over a date range.
 * Used by attainment calculator and dashboard.
 */
export const getActualsByPeriod = async (executiveId, startDate, endDate, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT
            kpi_code,
            SUM(value)   AS total_value,
            source,
            MAX(synced_at) AS last_synced_at,
            COUNT(*)     AS entry_count
        FROM kpi_actuals_daily
        WHERE executive_id = ?
          AND actual_date BETWEEN ? AND ?
        GROUP BY kpi_code, source
    `, [executiveId, startDate, endDate]);
    return rows;
};

/**
 * Check if a manual actual already exists for an executive + KPI within a period.
 * Used to enforce immutability of manual (Collection Revenue) entries.
 */
export const getManualActualExists = async (executiveId, kpiCode, startDate, endDate, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT id FROM kpi_actuals_daily
        WHERE executive_id = ?
          AND kpi_code     = ?
          AND source       = 'manual'
          AND actual_date BETWEEN ? AND ?
        LIMIT 1
    `, [executiveId, kpiCode, startDate, endDate]);
    return rows.length > 0 ? rows[0] : null;
};

// --- Incentive Config & Results ---

export const getIncentiveConfig = async (executiveId, kpiCode, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_incentive_configs WHERE executive_id = ? AND kpi_code = ?",
        [executiveId, kpiCode]
    );
    if (!rows[0]) return null;
    // Parse JSON slabs if stored as string
    const row = rows[0];
    row.slabs = typeof row.slabs === "string" ? JSON.parse(row.slabs) : row.slabs;
    return row;
};

export const saveIncentiveConfig = async (configData, connection = null) => {
    const db = connection || getPool();
    const { executive_id, kpi_code, slabs, bonus_threshold, bonus_amount } = configData;
    const [result] = await db.query(`
        INSERT INTO kpi_incentive_configs (executive_id, kpi_code, slabs, bonus_threshold, bonus_amount)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            slabs           = VALUES(slabs),
            bonus_threshold = VALUES(bonus_threshold),
            bonus_amount    = VALUES(bonus_amount)
    `, [executive_id, kpi_code, JSON.stringify(slabs), bonus_threshold, bonus_amount]);
    return result;
};

export const saveIncentiveResult = async (result, connection = null) => {
    const db = connection || getPool();
    const {
        executive_id, period_id, kpi_code,
        actual_value, target_value, attainment_pct,
        commission_earned, bonus_earned, total_incentive, status
    } = result;

    const [res] = await db.query(`
        INSERT INTO kpi_incentive_results
        (executive_id, period_id, kpi_code, actual_value, target_value,
         attainment_pct, commission_earned, bonus_earned, total_incentive, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            actual_value      = VALUES(actual_value),
            target_value      = VALUES(target_value),
            attainment_pct    = VALUES(attainment_pct),
            commission_earned = VALUES(commission_earned),
            bonus_earned      = VALUES(bonus_earned),
            total_incentive   = VALUES(total_incentive),
            status            = VALUES(status),
            calculated_at     = NOW()
    `, [
        executive_id, period_id, kpi_code,
        actual_value, target_value, attainment_pct,
        commission_earned, bonus_earned, total_incentive,
        status || "calculated"
    ]);
    return res;
};

export const getIncentiveResultsByPeriod = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_incentive_results WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows;
};

// --- Dashboard Aggregations ---

/**
 * Executive dashboard: targets + actuals + attainment per KPI for a period.
 * Attainment formulas are applied in the service/calculator layer — this returns raw numbers.
 */
export const getExecutiveDashboardSummary = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT
            t.kpi_code,
            t.target_value,
            t.benchmark_value,
            t.ceiling_value,
            COALESCE(SUM(a.value), 0)  AS actual_value,
            MAX(a.source)              AS data_source,
            MAX(a.synced_at)           AS last_synced_at,
            p.start_date,
            p.end_date
        FROM kpi_targets t
        JOIN kpi_periods p ON p.id = t.period_id
        LEFT JOIN kpi_actuals_daily a
            ON  a.executive_id = t.executive_id
            AND a.kpi_code     = t.kpi_code
            AND a.actual_date BETWEEN p.start_date AND p.end_date
        WHERE t.executive_id = ?
          AND t.period_id    = ?
        GROUP BY t.kpi_code, t.target_value, t.benchmark_value, t.ceiling_value,
                 p.start_date, p.end_date
    `, [executiveId, periodId]);
    return rows;
};

/**
 * Team dashboard: per-executive breakdown with actuals for all KPIs in the period.
 */
export const getTeamPerformanceAggregation = async (teamId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT
            e.one_employee_id  AS executive_id,
            e.name             AS executive_name,
            t.kpi_code,
            t.target_value,
            t.benchmark_value,
            t.ceiling_value,
            COALESCE(SUM(a.value), 0) AS actual_value,
            MAX(a.synced_at)          AS last_synced_at,
            p.start_date,
            p.end_date
        FROM one_employee_cache e
        JOIN kpi_targets t
            ON  t.executive_id = e.one_employee_id
            AND t.period_id    = ?
        JOIN kpi_periods p ON p.id = t.period_id
        LEFT JOIN kpi_actuals_daily a
            ON  a.executive_id = e.one_employee_id
            AND a.kpi_code     = t.kpi_code
            AND a.actual_date BETWEEN p.start_date AND p.end_date
        WHERE e.team_id = ?
        GROUP BY e.one_employee_id, e.name, t.kpi_code,
                 t.target_value, t.benchmark_value, t.ceiling_value,
                 p.start_date, p.end_date
        ORDER BY e.name, t.kpi_code
    `, [periodId, teamId]);
    return rows;
};

// --- F12-C: Incentive Config (full CRUD + approval) ---

/**
 * Get all KPI incentive configs for an executive in a specific period.
 */
export const getAllIncentiveConfigs = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_incentive_configs WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows.map((r) => ({
        ...r,
        slabs: typeof r.slabs === "string" ? JSON.parse(r.slabs) : r.slabs,
    }));
};

/**
 * Upsert a single KPI incentive config row.
 * Only allowed when status is 'draft'.
 */
export const upsertIncentiveConfig = async (config, connection = null) => {
    const db = connection || getPool();
    const {
        executive_id, period_id, kpi_code,
        slabs, commission_rate, slab_type,
        bonus_threshold, bonus_amount,
    } = config;

    const [result] = await db.query(`
        INSERT INTO kpi_incentive_configs
        (executive_id, period_id, kpi_code, slabs, commission_rate, slab_type,
         bonus_threshold, bonus_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        ON DUPLICATE KEY UPDATE
            slabs           = IF(status = 'draft', VALUES(slabs),           slabs),
            commission_rate = IF(status = 'draft', VALUES(commission_rate), commission_rate),
            slab_type       = IF(status = 'draft', VALUES(slab_type),       slab_type),
            bonus_threshold = IF(status = 'draft', VALUES(bonus_threshold), bonus_threshold),
            bonus_amount    = IF(status = 'draft', VALUES(bonus_amount),    bonus_amount)
    `, [
        executive_id, period_id, kpi_code,
        JSON.stringify(slabs || []),
        commission_rate || 0,
        slab_type || "non_cumulative",
        bonus_threshold || 0,
        bonus_amount || 0,
    ]);
    return result;
};

/**
 * Submit all configs for an executive/period for Admin approval.
 */
export const submitIncentiveConfigs = async (executiveId, periodId, submittedBy, connection = null) => {
    const db = connection || getPool();
    const [result] = await db.query(`
        UPDATE kpi_incentive_configs
        SET status = 'pending_approval', submitted_by = ?
        WHERE executive_id = ? AND period_id = ? AND status = 'draft'
    `, [submittedBy, executiveId, periodId]);
    return result;
};

/**
 * Admin approves all pending configs for an executive/period.
 */
export const approveIncentiveConfigs = async (executiveId, periodId, approvedBy, connection = null) => {
    const db = connection || getPool();
    const [result] = await db.query(`
        UPDATE kpi_incentive_configs
        SET status = 'active', approved_by = ?, approved_at = NOW()
        WHERE executive_id = ? AND period_id = ? AND status = 'pending_approval'
    `, [approvedBy, executiveId, periodId]);
    return result;
};

/**
 * Admin rejects configs for an executive/period with reason.
 */
export const rejectIncentiveConfigs = async (executiveId, periodId, rejectedBy, reason, connection = null) => {
    const db = connection || getPool();
    const [result] = await db.query(`
        UPDATE kpi_incentive_configs
        SET status = 'rejected', approved_by = ?, rejection_reason = ?
        WHERE executive_id = ? AND period_id = ? AND status = 'pending_approval'
    `, [rejectedBy, reason, executiveId, periodId]);
    return result;
};

// --- F12-C: Composite Config ---

export const getCompositeConfig = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_composite_configs WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows[0] || null;
};

export const upsertCompositeConfig = async (config, connection = null) => {
    const db = connection || getPool();
    const { executive_id, period_id, composite_bonus } = config;
    const [result] = await db.query(`
        INSERT INTO kpi_composite_configs (executive_id, period_id, composite_bonus)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            composite_bonus = IF(status = 'draft', VALUES(composite_bonus), composite_bonus)
    `, [executive_id, period_id, composite_bonus || 0]);
    return result;
};

export const submitCompositeConfig = async (executiveId, periodId, submittedBy, connection = null) => {
    const db = connection || getPool();
    await db.query(`
        UPDATE kpi_composite_configs
        SET status = 'pending_approval', submitted_by = ?
        WHERE executive_id = ? AND period_id = ? AND status = 'draft'
    `, [submittedBy, executiveId, periodId]);
};

export const approveCompositeConfig = async (executiveId, periodId, approvedBy, connection = null) => {
    const db = connection || getPool();
    await db.query(`
        UPDATE kpi_composite_configs
        SET status = 'active', approved_by = ?, approved_at = NOW()
        WHERE executive_id = ? AND period_id = ? AND status = 'pending_approval'
    `, [approvedBy, executiveId, periodId]);
};

export const rejectCompositeConfig = async (executiveId, periodId, rejectedBy, reason, connection = null) => {
    const db = connection || getPool();
    await db.query(`
        UPDATE kpi_composite_configs
        SET status = 'rejected', approved_by = ?, rejection_reason = ?
        WHERE executive_id = ? AND period_id = ? AND status = 'pending_approval'
    `, [rejectedBy, reason, executiveId, periodId]);
};

// --- F12-C: Lock & Save Incentive Results ---

/**
 * Save a per-KPI incentive result with 3-layer breakdown.
 * Once is_locked = 1, the row cannot be recalculated.
 */
export const saveIncentiveResultF12C = async (result, connection = null) => {
    const db = connection || getPool();
    const {
        executive_id, period_id, kpi_code,
        actual_value, target_value, attainment_pct,
        commission_earned, slab_bonus_earned, composite_bonus_earned,
        total_incentive, status,
    } = result;

    const [res] = await db.query(`
        INSERT INTO kpi_incentive_results
        (executive_id, period_id, kpi_code, actual_value, target_value,
         attainment_pct, commission_earned, slab_bonus_earned, composite_bonus_earned,
         total_incentive, status, is_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE
            actual_value           = IF(is_locked = 1, actual_value,           VALUES(actual_value)),
            target_value           = IF(is_locked = 1, target_value,           VALUES(target_value)),
            attainment_pct         = IF(is_locked = 1, attainment_pct,         VALUES(attainment_pct)),
            commission_earned      = IF(is_locked = 1, commission_earned,      VALUES(commission_earned)),
            slab_bonus_earned      = IF(is_locked = 1, slab_bonus_earned,      VALUES(slab_bonus_earned)),
            composite_bonus_earned = IF(is_locked = 1, composite_bonus_earned, VALUES(composite_bonus_earned)),
            total_incentive        = IF(is_locked = 1, total_incentive,        VALUES(total_incentive)),
            status                 = IF(is_locked = 1, status,                 VALUES(status)),
            calculated_at          = IF(is_locked = 1, calculated_at,          NOW())
    `, [
        executive_id, period_id, kpi_code,
        actual_value, target_value, attainment_pct,
        commission_earned, slab_bonus_earned, composite_bonus_earned,
        total_incentive, status || "calculated",
    ]);
    return res;
};

/**
 * Lock all incentive results for an executive/period.
 * After locking, no edits allowed — PRD rule.
 */
export const lockIncentiveResults = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    await db.query(`
        UPDATE kpi_incentive_results
        SET is_locked = 1
        WHERE executive_id = ? AND period_id = ?
    `, [executiveId, periodId]);
};

/**
 * Check if any result row is already locked for this executive/period.
 */
export const isIncentiveLocked = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT COUNT(*) AS cnt FROM kpi_incentive_results
        WHERE executive_id = ? AND period_id = ? AND is_locked = 1
    `, [executiveId, periodId]);
    return rows[0].cnt > 0;
};

// --- F12-C: Payout Summary ---

export const getPayoutSummary = async (executiveId, periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(
        "SELECT * FROM kpi_payout_summary WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows[0] || null;
};

export const upsertPayoutSummary = async (summary, connection = null) => {
    const db = connection || getPool();
    const {
        executive_id, period_id,
        total_commission, total_slab_bonus, composite_bonus,
        grand_total, calculated_by,
    } = summary;

    const [result] = await db.query(`
        INSERT INTO kpi_payout_summary
        (executive_id, period_id, total_commission, total_slab_bonus,
         composite_bonus, grand_total, status, calculated_by)
        VALUES (?, ?, ?, ?, ?, ?, 'calculated', ?)
        ON DUPLICATE KEY UPDATE
            total_commission  = VALUES(total_commission),
            total_slab_bonus  = VALUES(total_slab_bonus),
            composite_bonus   = VALUES(composite_bonus),
            grand_total       = VALUES(grand_total),
            status            = 'calculated',
            calculated_by     = VALUES(calculated_by),
            calculated_at     = NOW()
    `, [
        executive_id, period_id,
        total_commission, total_slab_bonus,
        composite_bonus, grand_total, calculated_by,
    ]);
    return result;
};

export const approvePayoutSummary = async (executiveId, periodId, approvedBy, connection = null) => {
    const db = connection || getPool();
    const [result] = await db.query(`
        UPDATE kpi_payout_summary
        SET status = 'approved', approved_by = ?, approved_at = NOW()
        WHERE executive_id = ? AND period_id = ? AND status = 'calculated'
    `, [approvedBy, executiveId, periodId]);
    return result;
};

export const rejectPayoutSummary = async (executiveId, periodId, rejectedBy, reason, connection = null) => {
    const db = connection || getPool();
    const [result] = await db.query(`
        UPDATE kpi_payout_summary
        SET status = 'rejected', approved_by = ?, rejection_reason = ?
        WHERE executive_id = ? AND period_id = ? AND status = 'calculated'
    `, [rejectedBy, reason, executiveId, periodId]);
    return result;
};

/**
 * Get all payout summaries for a period (Admin view — all executives).
 */
export const getAllPayoutsByPeriod = async (periodId, connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query(`
        SELECT ps.*, e.name AS executive_name
        FROM kpi_payout_summary ps
        JOIN one_employee_cache e ON e.one_employee_id = ps.executive_id
        WHERE ps.period_id = ?
        ORDER BY ps.grand_total DESC
    `, [periodId]);
    return rows;
};

// --- Metadata & Helpers ---

export const getKpiMaster = async (connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query("SELECT * FROM kpi_master");
    return rows;
};

// Backward compatibility (optional)
export const logAudit = logKpiAudit;
