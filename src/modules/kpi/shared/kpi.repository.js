import { getPool } from "../../../config/db.js";

/**
 * KPI Repository - Target Management
 */

// Periods
export const createPeriod = async (period) => {
  const [result] = await getPool().query(
    "INSERT INTO kpi_periods (name, start_date, end_date) VALUES (?, ?, ?)",
    [period.name, period.start_date, period.end_date]
  );
  return result.insertId;
};

export const getPeriods = async () => {
    const [rows] = await getPool().query("SELECT * FROM kpi_periods ORDER BY start_date DESC");
    return rows;
};

// Targets
export const upsertTarget = async (target) => {
  const { executive_id, period_id, kpi_code, target_value, approved_by, revision_history } = target;
  
  // Custom MySQL upsert (ON DUPLICATE KEY UPDATE)
  // For MySQL 8.x: UPSERT pattern assumes unique constraint (executive_id, period_id, kpi_code)
  const [result] = await getPool().query(`
    INSERT INTO kpi_targets (executive_id, period_id, kpi_code, target_value, approved_by, revision_history)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      target_value = VALUES(target_value),
      approved_by = VALUES(approved_by),
      revision_history = IFNULL(VALUES(revision_history), revision_history)
  `, [executive_id, period_id, kpi_code, target_value, approved_by, JSON.stringify(revision_history)]);
  
  return result;
};

export const getTargetsByExecutive = async (executiveId, periodId) => {
  const [rows] = await getPool().query(
    "SELECT * FROM kpi_targets WHERE executive_id = ? AND period_id = ?",
    [executiveId, periodId]
  );
  return rows;
};

export const approveTargets = async (executiveId, periodId, approvedBy) => {
  const [result] = await getPool().query(
    "UPDATE kpi_targets SET status = 'approved', approved_by = ? WHERE executive_id = ? AND period_id = ?",
    [approvedBy, executiveId, periodId]
  );
  return result;
};

// Team Targets
export const upsertTeamTarget = async (teamTarget) => {
  const { team_id, period_id, kpi_code, auto_sum, override_value, revision_history } = teamTarget;

  const [result] = await getPool().query(`
    INSERT INTO kpi_team_targets (team_id, period_id, kpi_code, auto_sum, override_value, revision_history)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      auto_sum = VALUES(auto_sum),
      override_value = VALUES(override_value),
      revision_history = IFNULL(VALUES(revision_history), revision_history)
  `, [team_id, period_id, kpi_code, auto_sum, override_value, JSON.stringify(revision_history)]);

  return result;
};

export const getTeamTargetsByPeriod = async (teamId, periodId) => {
  const [rows] = await getPool().query(
    "SELECT * FROM kpi_team_targets WHERE team_id = ? AND period_id = ?",
    [teamId, periodId]
  );
  return rows;
};

export const getTeamMembersTargetsSum = async (teamId, periodId, kpiCode) => {
  const [rows] = await getPool().query(`
    SELECT SUM(target_value) as total_sum
    FROM kpi_targets kt
    JOIN one_employee_cache oec ON kt.executive_id = oec.one_employee_id
    WHERE oec.team_id = ? AND kt.period_id = ? AND kt.kpi_code = ?
  `, [teamId, periodId, kpiCode]);

  return rows[0]?.total_sum || 0;
};

// Actuals Logic
export const upsertActual = async (actual) => {
  const { executive_id, actual_date, kpi_code, value, source } = actual;

  const [result] = await getPool().query(`
    INSERT INTO kpi_actuals_daily (executive_id, actual_date, kpi_code, value, source)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      value = VALUES(value),
      source = VALUES(source)
  `, [executive_id, actual_date, kpi_code, value, source]);

  return result;
};

export const getActualsByPeriod = async (executiveId, startDate, endDate) => {
  const [rows] = await getPool().query(`
    SELECT kpi_code, SUM(value) as total_value
    FROM kpi_actuals_daily
    WHERE executive_id = ? AND actual_date BETWEEN ? AND ?
    GROUP BY kpi_code
  `, [executiveId, startDate, endDate]);

  return rows;
};

// Incentives Logic
export const getIncentiveConfig = async (executiveId, kpiCode) => {
  const [rows] = await getPool().query(
    "SELECT * FROM kpi_incentive_configs WHERE executive_id = ? AND kpi_code = ?",
    [executiveId, kpiCode]
  );
  return rows[0] || null;
};

export const upsertIncentiveConfig = async (config) => {
    const { executive_id, kpi_code, slabs, bonus_threshold, bonus_amount } = config;
    const [result] = await getPool().query(`
        INSERT INTO kpi_incentive_configs (executive_id, kpi_code, slabs, bonus_threshold, bonus_amount)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            slabs = VALUES(slabs),
            bonus_threshold = VALUES(bonus_threshold),
            bonus_amount = VALUES(bonus_amount)
    `, [executive_id, kpi_code, JSON.stringify(slabs), bonus_threshold, bonus_amount]);
    return result;
};

export const saveIncentiveResult = async (result) => {
    const { 
        executive_id, period_id, kpi_code, actual_value, target_value, 
        attainment_pct, commission_earned, bonus_earned, total_incentive, status 
    } = result;

    const [rows] = await getPool().query(`
        INSERT INTO kpi_incentive_results 
        (executive_id, period_id, kpi_code, actual_value, target_value, attainment_pct, commission_earned, bonus_earned, total_incentive, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
            actual_value = VALUES(actual_value),
            target_value = VALUES(target_value),
            attainment_pct = VALUES(attainment_pct),
            commission_earned = VALUES(commission_earned),
            bonus_earned = VALUES(bonus_earned),
            total_incentive = VALUES(total_incentive),
            status = VALUES(status)
    `, [executive_id, period_id, kpi_code, actual_value, target_value, attainment_pct, commission_earned, bonus_earned, total_incentive, status]);
    return rows;
};

export const getIncentiveResultsByPeriod = async (executiveId, periodId) => {
    const [rows] = await getPool().query(
        "SELECT * FROM kpi_incentive_results WHERE executive_id = ? AND period_id = ?",
        [executiveId, periodId]
    );
    return rows;
};

// Dashboard Aggregations
export const getExecutiveDashboardSummary = async (executiveId, periodId) => {
    const [rows] = await getPool().query(`
        SELECT 
            kt.kpi_code,
            kt.target_value,
            IFNULL(ka.total_actual, 0) as total_actual,
            IFNULL(ir.attainment_pct, 0) as attainment_pct,
            IFNULL(ir.total_incentive, 0) as total_incentive
        FROM kpi_targets kt
        LEFT JOIN (
            SELECT kpi_code, SUM(value) as total_actual 
            FROM kpi_actuals_daily 
            WHERE executive_id = ? 
            GROUP BY kpi_code
        ) ka ON kt.kpi_code = ka.kpi_code
        LEFT JOIN kpi_incentive_results ir ON kt.executive_id = ir.executive_id 
            AND kt.period_id = ir.period_id AND kt.kpi_code = ir.kpi_code
        WHERE kt.executive_id = ? AND kt.period_id = ?
    `, [executiveId, executiveId, periodId]);
    
    return rows;
};

export const getTeamPerformanceAggregation = async (teamId, periodId) => {
    const [rows] = await getPool().query(`
        SELECT 
            kt.kpi_code,
            SUM(kt.target_value) as team_target,
            IFNULL(SUM(ka.total_actual), 0) as team_actual,
            IFNULL(ktt.override_value, 0) as manager_override
        FROM kpi_targets kt
        JOIN one_employee_cache oec ON kt.executive_id = oec.one_employee_id
        LEFT JOIN (
            SELECT kpi_code, executive_id, SUM(value) as total_actual 
            FROM kpi_actuals_daily 
            GROUP BY kpi_code, executive_id
        ) ka ON kt.executive_id = ka.executive_id AND kt.kpi_code = ka.kpi_code
        LEFT JOIN kpi_team_targets ktt ON oec.team_id = ktt.team_id 
            AND kt.period_id = ktt.period_id AND kt.kpi_code = ktt.kpi_code
        WHERE oec.team_id = ? AND kt.period_id = ?
        GROUP BY kt.kpi_code, ktt.override_value
    `, [teamId, periodId]);

    return rows;
};
