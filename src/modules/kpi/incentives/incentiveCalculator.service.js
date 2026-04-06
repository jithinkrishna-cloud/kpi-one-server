/**
 * Service: KPI Incentive Calculation Engine
 * Implements the financial logic for commission slabs and attainment bonuses.
 */

/**
 * Calculates incentives for a single KPI using a pre-computed attainment %.
 *
 * @param {number} actual           - Actual performance value
 * @param {number} target           - Target performance value
 * @param {Array}  slabs            - [{"min": 80, "max": 90, "rate": 0.02}, ...]
 * @param {number} bonusThreshold   - Min attainment % for bonus
 * @param {number} bonusAmount      - Fixed bonus amount
 * @param {number} [attainmentOverride] - Pre-computed (uncapped) attainment %;
 *                                        if provided, skips internal calculation.
 *                                        Use for TAT KPI where formula differs.
 * @returns {Object} { attainmentPct, commission, bonus, total }
 */
export const calculateKpiIncentive = (actual, target, slabs = [], bonusThreshold = 0, bonusAmount = 0, attainmentOverride = null) => {
  // 1. Attainment Percentage — use override if caller already computed it (e.g. TAT)
  const attainmentPct = attainmentOverride !== null
    ? attainmentOverride
    : (target > 0 ? (actual / target) * 100 : 0);

  // 2. Find applicable Slab
  // Note: Slabs define the rate based on attainment brackets
  const slab = slabs.find(s => attainmentPct >= s.min && attainmentPct <= (s.max || 999999));
  
  // Rate could be a percentage of actual or a multiplier. 
  // Assuming 'rate' is a decimal (e.g. 0.05 for 5% of revenue/unit value).
  const rate = slab ? parseFloat(slab.rate) : 0;
  
  // 3. Commission Calculation
  // Standard formula: actual value * incentive rate
  const commission = actual * rate;

  // 4. Bonus Calculation
  const bonus = (bonusThreshold > 0 && attainmentPct >= bonusThreshold) ? parseFloat(bonusAmount) : 0;

  return {
    attainmentPct: parseFloat(attainmentPct.toFixed(2)),
    commission: parseFloat(commission.toFixed(2)),
    bonus: parseFloat(bonus.toFixed(2)),
    total: parseFloat((commission + bonus).toFixed(2))
  };
};

/**
 * Composite Calculation: Sum of all KPIs for an executive.
 * Used for the final payout result.
 */
export const aggregateIncentives = (results = []) => {
  return results.reduce((acc, res) => ({
    totalCommission: acc.totalCommission + (res.commission_earned || 0),
    totalBonus: acc.totalBonus + (res.bonus_earned || 0),
    totalIncentive: acc.totalIncentive + (res.total_incentive || 0)
  }), { totalCommission: 0, totalBonus: 0, totalIncentive: 0 });
};
