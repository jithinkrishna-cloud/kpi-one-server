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
    role: user.role, // Legacy fallback
    kpiRole: user.kpiRole || user.role, // Standardized for RoleGuard
    teamId: user.teamId || user.team_id,
    franchiseeId: user.franchiseeId || user.franchisee_id,
    scope: user.scope,
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
