import dbServer from "../../config/db.js";

/**
 * Finds a cached employee by their ONE CRM ID
 * @param {string} oneEmployeeId
 * @returns {Promise<Object|null>}
 */
export const findByOneId = async (oneEmployeeId) => {
  const sql = "SELECT * FROM one_employee_cache WHERE one_employee_id = ?";
  const [rows] = await dbServer.query(sql, [oneEmployeeId]);
  return rows[0] || null;
};

export const upsert = async (employeeObject) => {
  const { id, name, role, teamId, franchiseeId, metadata } = employeeObject;

  const sql = `
    INSERT INTO one_employee_cache (one_employee_id, name, role, team_id, franchisee_id, metadata, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE 
      name = COALESCE(VALUES(name), name),
      role = COALESCE(VALUES(role), role),
      team_id = COALESCE(VALUES(team_id), team_id),
      franchisee_id = COALESCE(VALUES(franchisee_id), franchisee_id),
      metadata = IFNULL(VALUES(metadata), metadata),
      cached_at = CURRENT_TIMESTAMP
  `;

  const params = [
    id, // ONE CRM ID
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
 * Lists employees from cache with optional filters
 * @param {Object} filters - { role, teamId, franchiseeId }
 */
export const findAll = async (filters = {}) => {
  const { role, teamId, franchiseeId } = filters;
  let sql = "SELECT * FROM one_employee_cache WHERE 1=1";
  const params = [];

  if (role) {
    sql += " AND role = ?";
    params.push(role);
  }
  if (teamId) {
    sql += " AND team_id = ?";
    params.push(teamId);
  }
  if (franchiseeId) {
    sql += " AND franchisee_id = ?";
    params.push(franchiseeId);
  }

  sql += " ORDER BY name ASC";
  const [rows] = await dbServer.query(sql, params);
  return rows;
};
