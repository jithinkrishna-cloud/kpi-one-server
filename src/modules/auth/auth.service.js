import jwt from "jsonwebtoken";

/**
 * Signs a KPI-specific JWT token
 * Includes role mapping and data access scope.
 * @param {Object} user - Authenticated user object
 * @returns {string} Signed JWT
 */
export const signKpiToken = (user) => {
  const payload = {
    id: user.id || user.one_employee_id,
    name: user.name,
    role: user.kpiRole || user.role,
    teamId: user.teamId || user.team_id,
    franchiseeId: user.franchiseeId || user.franchisee_id,
    scope: user.scope
  };

  return jwt.sign(payload, process.env.KPI_JWT_SECRET || "kpi-local-secret-3321", {
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
    return jwt.verify(token, process.env.KPI_JWT_SECRET || "kpi-local-secret-3321");
  } catch (err) {
    return null;
  }
};
