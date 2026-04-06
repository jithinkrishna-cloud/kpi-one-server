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
    return rows;
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
        entity_type === 'target' ? 'kpi_targets' : (entity_type === 'period' ? 'kpi_periods' : 'kpi_team_targets'),
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

// --- Metadata & Helpers ---

export const getKpiMaster = async (connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query("SELECT * FROM kpi_master");
    return rows;
};

// Backward compatibility (optional)
export const logAudit = logKpiAudit;
