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

/**
 * Upserts employee data into the cache
 * @param {Object} employeeData
 */
export const upsert = async (employeeObject) => {
  const { id, name, role, teamId, franchiseeId, metadata } = employeeObject;

  const sql = `
    INSERT INTO one_employee_cache (one_employee_id, name, role, team_id, franchisee_id, metadata, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE 
      name = VALUES(name),
      role = VALUES(role),
      team_id = VALUES(team_id),
      franchisee_id = VALUES(franchisee_id),
      metadata = VALUES(metadata),
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

  await dbServer.query(sql, params);
};
