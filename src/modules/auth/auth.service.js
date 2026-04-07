import jwt from "jsonwebtoken";

/**
 * Signs a KPI-specific JWT token
 * Includes role mapping and data access scope.
 * @param {Object} user - Authenticated user object
 * @returns {string} Signed JWT
 */
export const signKpiToken = (user) => {
  // IDENTITY: Always use ONE CRM EmployeeID — never the internal DB auto-increment id.
  // DB row has `one_employee_id` (CRM id) and `id` (internal pk).
  // signKpiToken receives either a raw DB row or a shaped object from the controller.
  const payload = {
    id:           user.one_employee_id || user.id,          // ONE CRM EmployeeID (e.g. 200)
    name:         user.name,
    kpiRole:      user.kpiRole || user.kpi_role,            // derived role string
    roles:        user.roles         || [],                 // RoleTypeIds e.g. [2]
    teamIds:      user.teamIds       || user.team_ids || [], // all TeamIDs e.g. [9, 29]
    franchiseeId: user.franchiseeId  || user.franchisee_id || null,
  };

  const secret = process.env.KPI_JWT_SECRET;
  if (!secret)
    throw new Error("KPI_JWT_SECRET is not defined in the environment.");

  return jwt.sign(payload, secret, {
    expiresIn: "7d",
  });
};

/**
 * Verifies the local KPI token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
export const verifyKpiToken = (token) => {
  try {
    const secret = process.env.KPI_JWT_SECRET;
    if (!secret)
      throw new Error("KPI_JWT_SECRET is not defined in the environment.");
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
};
