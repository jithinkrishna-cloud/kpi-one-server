import * as repository from "../shared/kpi.repository.js";
import { calculateKpiIncentive } from "./incentiveCalculator.service.js";

/**
 * Service: KPI Attainment and Incentive Bridge
 * Reconciles performance data with financial targets and slabs.
 */

/**
 * Calculates and stores the incentive result for a specific KPI, executive, and period.
 */
export const calculateAndSaveKpiResult = async (executiveId, periodId, kpiCode, token) => {
  // 1. Fetch Period Metadata (Dates)
  const periods = await repository.getPeriods();
  const period = periods.find(p => p.id === periodId);
  if (!period) throw new Error("Period not found");

  // 2. Fetch Performance Data (Target vs Actual)
  // Fetch Target
  const targets = await repository.getTargetsByExecutive(executiveId, periodId);
  const target = targets.find(t => t.kpi_code === kpiCode);
  const targetValue = target ? parseFloat(target.target_value) : 0;

  // Fetch Actual Total for the period
  const startDate = period.start_date;
  const endDate = period.end_date;
  const actuals = await repository.getActualsByPeriod(executiveId, startDate, endDate);
  const actual = actuals.find(a => a.kpi_code === kpiCode);
  const actualValue = actual ? parseFloat(actual.total_value) : 0;

  // 3. Fetch Incentive Slab Configuration
  const config = await repository.getIncentiveConfig(executiveId, kpiCode);
  const slabs = config ? config.slabs : [];
  const bonusThreshold = config ? config.bonus_threshold : 0;
  const bonusAmount = config ? config.bonus_amount : 0;

  // 4. PERFORM CALCULATION
  const result = calculateKpiIncentive(actualValue, targetValue, slabs, bonusThreshold, bonusAmount);

  // 5. STORE RESULT
  const incentiveResult = {
    executive_id: executiveId,
    period_id: periodId,
    kpi_code: kpiCode,
    actual_value: actualValue,
    target_value: targetValue,
    attainment_pct: result.attainmentPct,
    commission_earned: result.commission,
    bonus_earned: result.bonus,
    total_incentive: result.total,
    status: 'calculated'
  };

  return await repository.saveIncentiveResult(incentiveResult);
};

export const getExecutivePeriodResults = async (executiveId, periodId) => {
  return await repository.getIncentiveResultsByPeriod(executiveId, periodId);
};
