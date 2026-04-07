import dbServer from "../../config/db.js";

/**
 * Parses JSON string columns in a DB row into native arrays/objects.
 * MySQL returns JSON columns as strings in some driver versions.
 */
const parseJsonColumns = (row) => {
  if (!row) return null;
  if (typeof row.roles === "string")    row.roles    = JSON.parse(row.roles);
  if (typeof row.team_ids === "string") row.team_ids = JSON.parse(row.team_ids);
  if (typeof row.metadata === "string") row.metadata = JSON.parse(row.metadata);
  return row;
};

/**
 * Finds a cached employee by their ONE CRM ID.
 * @param {string|number} oneEmployeeId
 * @returns {Promise<Object|null>}
 */
export const findByOneId = async (oneEmployeeId) => {
  const sql = "SELECT * FROM one_employee_cache WHERE one_employee_id = ?";
  const [rows] = await dbServer.query(sql, [String(oneEmployeeId)]);
  return parseJsonColumns(rows[0] || null);
};

/**
 * Upserts an employee using the multi-team schema.
 * Writes roles (RoleTypeIds), team_ids (all TeamIDs), kpi_role, and franchisee_id.
 * Legacy `role` and `team_id` columns are kept in sync for any code still reading them.
 *
 * @param {Object}        param
 * @param {string|number} param.one_employee_id
 * @param {number[]}      param.roles        - Unique RoleTypeIds, e.g. [1, 2]
 * @param {number[]}      param.teamIds      - All TeamIDs, e.g. [9, 29]
 * @param {string}        param.kpiRole      - Derived KPI role string
 * @param {string}        [param.name]       - Display name
 * @param {string|null}   [param.franchiseeId]
 */
export const upsertMultiTeam = async ({
  one_employee_id,
  roles,
  teamIds,
  kpiRole,
  name,
  franchiseeId = null,
  crmToken     = null,   // ONE CRM bearer token — stored for outgoing API calls
}) => {
  const displayName   = name || String(one_employee_id);
  const primaryTeamId = teamIds.length > 0 ? teamIds[0] : null;

  const sql = `
    INSERT INTO one_employee_cache
      (one_employee_id, name, role, team_id, franchisee_id, roles, team_ids, kpi_role, crm_token, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      name          = COALESCE(VALUES(name), name),
      role          = VALUES(role),
      team_id       = VALUES(team_id),
      franchisee_id = COALESCE(VALUES(franchisee_id), franchisee_id),
      roles         = VALUES(roles),
      team_ids      = VALUES(team_ids),
      kpi_role      = VALUES(kpi_role),
      crm_token     = COALESCE(VALUES(crm_token), crm_token),
      cached_at     = CURRENT_TIMESTAMP
  `;

  const params = [
    String(one_employee_id),
    displayName,
    kpiRole,
    primaryTeamId,
    franchiseeId,
    JSON.stringify(roles),
    JSON.stringify(teamIds),
    kpiRole,
    crmToken,
  ];

  console.log(`💾 DB: Multi-team upsert for ${one_employee_id} | ${kpiRole} | teams=[${teamIds}]`);

  try {
    await dbServer.query(sql, params);
  } catch (err) {
    console.error("❌ SQL Error in upsertMultiTeam:", err.message);
    console.error("Params:", JSON.stringify(params));
    throw err;
  }
};

/**
 * Legacy upsert — used by syncFromLoginResponse (single-team login path).
 * Kept for backward compatibility with the login flow.
 */
export const upsert = async (employeeObject) => {
  const { id, name, role, teamId, franchiseeId, metadata } = employeeObject;

  const sql = `
    INSERT INTO one_employee_cache
      (one_employee_id, name, role, team_id, franchisee_id, metadata, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      name          = COALESCE(VALUES(name), name),
      role          = COALESCE(VALUES(role), role),
      team_id       = COALESCE(VALUES(team_id), team_id),
      franchisee_id = COALESCE(VALUES(franchisee_id), franchisee_id),
      metadata      = IFNULL(VALUES(metadata), metadata),
      cached_at     = CURRENT_TIMESTAMP
  `;

  const params = [
    id,
    name,
    role,
    teamId || null,
    franchiseeId || null,
    metadata ? JSON.stringify(metadata) : null,
  ];

  console.log("💾 DB: Syncing employee:", params[0], `(${params[1]})`);

  try {
    await dbServer.query(sql, params);
  } catch (err) {
    console.error("❌ SQL Error in upsert:", err.message);
    console.error("Params:", JSON.stringify(params));
    throw err;
  }
};

/**
 * Returns all employees whose team_ids JSON array overlaps with any of the given team IDs,
 * excluding the manager themselves.
 *
 * @param {number[]} teamIds   - Team IDs the manager belongs to
 * @param {string}   excludeId - ONE CRM EmployeeID of the manager to exclude from results
 * @returns {Promise<Object[]>}
 */
export const findEmployeesByTeamIds = async (teamIds = [], excludeId = null) => {
  if (!teamIds.length) return [];

  const placeholders = teamIds.map(() => "?").join(", ");
  const params = [...teamIds];

  let sql = `
    SELECT * FROM one_employee_cache
    WHERE JSON_OVERLAPS(team_ids, JSON_ARRAY(${placeholders}))
  `;

  if (excludeId !== null) {
    sql += " AND one_employee_id != ?";
    params.push(String(excludeId));
  }

  sql += " ORDER BY name ASC";

  const [rows] = await dbServer.query(sql, params);
  return rows.map(parseJsonColumns);
};

/**
 * Returns all distinct teams a given manager belongs to.
 * Reads team_ids from the manager's own cache row.
 *
 * @param {string|number} managerId - ONE CRM EmployeeID of the manager
 * @returns {Promise<number[]>} Array of TeamIDs
 */
export const findTeamIdsByManagerId = async (managerId) => {
  const sql = `
    SELECT team_ids FROM one_employee_cache
    WHERE one_employee_id = ?
  `;
  const [rows] = await dbServer.query(sql, [String(managerId)]);
  if (!rows[0] || !rows[0].team_ids) return [];

  const raw = rows[0].team_ids;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};

/**
 * Lists employees from cache with optional filters.
 *
 * Supports `teamIds` (array) for Manager scope — any match across their teams.
 *
 * @param {Object} filters - { role, teamId, teamIds, franchiseeId }
 */
export const findAll = async (filters = {}) => {
  const { role, teamId, teamIds, franchiseeId } = filters;
  let sql = "SELECT * FROM one_employee_cache WHERE 1=1";
  const params = [];

  if (role) {
    sql += " AND role = ?";
    params.push(role);
  }

  // Multi-team filter (Manager scope — PRD: see all executives from their teams)
  if (teamIds && teamIds.length > 0) {
    const placeholders = teamIds.map(() => "?").join(", ");
    sql += ` AND JSON_OVERLAPS(team_ids, JSON_ARRAY(${placeholders}))`;
    params.push(...teamIds);
  } else if (teamId) {
    // Single-team fallback for direct queries
    sql += " AND team_id = ?";
    params.push(teamId);
  }

  if (franchiseeId) {
    sql += " AND franchisee_id = ?";
    params.push(franchiseeId);
  }

  sql += " ORDER BY name ASC";
  const [rows] = await dbServer.query(sql, params);
  return rows.map(parseJsonColumns);
};
