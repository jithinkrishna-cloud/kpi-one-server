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

// --- Metadata & Helpers ---

export const getKpiMaster = async (connection = null) => {
    const db = connection || getPool();
    const [rows] = await db.query("SELECT * FROM kpi_master");
    return rows;
};

// Backward compatibility (optional)
export const logAudit = logKpiAudit;
