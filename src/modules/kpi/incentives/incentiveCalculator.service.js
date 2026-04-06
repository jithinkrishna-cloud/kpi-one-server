import { KPI_COMMISSION_CODES, KPI_CUMULATIVE_CODES } from "../shared/kpi.constants.js";

/**
 * F12-C: Incentive Calculation Engine — Pure Functions
 *
 * Three independent layers, each testable in isolation:
 *
 *  Layer 1 — Commission     : revenue KPIs only  → actual × rate
 *  Layer 2 — Slab Bonus     : all KPIs           → non-cumulative OR cumulative
 *  Layer 3 — Composite Bonus: all-or-nothing      → only if every KPI earned ≥ 1 slab
 */

// ─── Slab Validation ─────────────────────────────────────────────────────────

/**
 * Validate a slab array before saving/using it.
 * Rules (PRD): min 2 slabs, max 8, continuous (no gaps), no overlaps.
 *
 * @param {Array<{min:number, max:number|null, bonus:number}>} slabs
 * @throws {Error} if validation fails
 */
export const validateSlabs = (slabs) => {
    if (!Array.isArray(slabs) || slabs.length < 2) {
        throw new Error("Slabs must have at least 2 entries.");
    }
    if (slabs.length > 8) {
        throw new Error("Slabs cannot exceed 8 entries.");
    }

    // Sort by min ascending for validation
    const sorted = [...slabs].sort((a, b) => a.min - b.min);

    for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];

        if (s.min < 0 || s.bonus < 0) {
            throw new Error(`Slab ${i + 1}: min and bonus must be non-negative.`);
        }

        // All slabs except the last must have a max
        if (i < sorted.length - 1) {
            if (s.max == null) {
                throw new Error(`Slab ${i + 1}: only the last slab can have no max (open-ended).`);
            }
            if (s.max < s.min) {
                throw new Error(`Slab ${i + 1}: max (${s.max}) must be ≥ min (${s.min}).`);
            }
            // Continuity: next slab's min must immediately follow this slab's max
            const next = sorted[i + 1];
            if (next.min !== s.max + 1) {
                throw new Error(
                    `Gap or overlap between slab ${i + 1} (max ${s.max}) and slab ${i + 2} (min ${next.min}). Slabs must be continuous.`
                );
            }
        }
    }
    return true;
};

// ─── Layer 1: Commission ──────────────────────────────────────────────────────

/**
 * Calculate revenue commission for sales_revenue and collection_revenue.
 * Formula: actual_value × commission_rate
 *
 * @param {number} actual         - Actual revenue value
 * @param {number} commissionRate - Decimal rate e.g. 0.05 = 5%
 * @param {string} kpiCode
 * @returns {number} commission amount (0 if KPI is not a revenue KPI)
 */
export const calculateCommission = (actual, commissionRate, kpiCode) => {
    if (!KPI_COMMISSION_CODES.has(kpiCode)) return 0;
    if (!actual || !commissionRate) return 0;
    return parseFloat((actual * commissionRate).toFixed(2));
};

// ─── Layer 2: Slab Bonus ──────────────────────────────────────────────────────

/**
 * Find which slab an attainment % falls into.
 * Returns null if attainment is below the first slab's min.
 *
 * @param {number} attainmentPct - Uncapped attainment %
 * @param {Array}  slabs
 * @returns {{ slabIndex, slab } | null}
 */
const findMatchingSlab = (attainmentPct, slabs) => {
    const sorted = [...slabs].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        const withinMax = s.max == null ? true : attainmentPct <= s.max;
        if (attainmentPct >= s.min && withinMax) {
            return { slabIndex: i, slab: s, sorted };
        }
    }
    return null;
};

/**
 * NON-CUMULATIVE: Earn only the bonus for the matched slab.
 *
 * Used for: lead_quality_relevancy, lead_conversion, deal_creation,
 *           quote_creation, call_connect_rate, completion_tat
 *
 * @param {number} attainmentPct
 * @param {Array}  slabs
 * @returns {{ slabBonus: number, matchedSlab: object|null, slabsEarned: number }}
 */
const calculateNonCumulativeBonus = (attainmentPct, slabs) => {
    const match = findMatchingSlab(attainmentPct, slabs);
    if (!match) return { slabBonus: 0, matchedSlab: null, slabsEarned: 0 };

    return {
        slabBonus:   parseFloat((match.slab.bonus || 0).toFixed(2)),
        matchedSlab: match.slab,
        slabsEarned: 1,
    };
};

/**
 * CUMULATIVE: Earn the sum of ALL slabs up to and including the matched one.
 *
 * Used for: dialed_calls, customer_touch, talk_time, clients_onboarded, services_completed
 *
 * Example: slabs = [slab1:₹500, slab2:₹1000, slab3:₹1500]
 *          attainment hits slab3 → bonus = 500 + 1000 + 1500 = ₹3000
 *
 * @param {number} attainmentPct
 * @param {Array}  slabs
 * @returns {{ slabBonus: number, matchedSlab: object|null, slabsEarned: number }}
 */
const calculateCumulativeBonus = (attainmentPct, slabs) => {
    const match = findMatchingSlab(attainmentPct, slabs);
    if (!match) return { slabBonus: 0, matchedSlab: null, slabsEarned: 0 };

    // Sum bonuses from slab index 0 up to and including matched index
    const earned = match.sorted
        .slice(0, match.slabIndex + 1)
        .reduce((sum, s) => sum + (s.bonus || 0), 0);

    return {
        slabBonus:   parseFloat(earned.toFixed(2)),
        matchedSlab: match.slab,
        slabsEarned: match.slabIndex + 1,
    };
};

/**
 * Compute slab bonus for a single KPI.
 * Automatically picks cumulative or non-cumulative based on kpiCode.
 *
 * @param {string} kpiCode
 * @param {number} attainmentPct  - Uncapped raw attainment %
 * @param {Array}  slabs
 * @param {string} [slabTypeOverride] - "cumulative"|"non_cumulative" (from config; takes precedence)
 * @returns {{ slabBonus, matchedSlab, slabsEarned, isCumulative }}
 */
export const calculateSlabBonus = (kpiCode, attainmentPct, slabs, slabTypeOverride = null) => {
    if (!slabs || slabs.length === 0) {
        return { slabBonus: 0, matchedSlab: null, slabsEarned: 0, isCumulative: false };
    }

    // Config-level override takes precedence; otherwise use KPI code default
    const isCumulative = slabTypeOverride
        ? slabTypeOverride === "cumulative"
        : KPI_CUMULATIVE_CODES.has(kpiCode);

    const result = isCumulative
        ? calculateCumulativeBonus(attainmentPct, slabs)
        : calculateNonCumulativeBonus(attainmentPct, slabs);

    return { ...result, isCumulative };
};

// ─── Layer 3: Composite Bonus ─────────────────────────────────────────────────

/**
 * All-or-nothing composite bonus.
 * Granted ONLY if every KPI in the period earned at least 1 slab bonus (slabBonus > 0).
 * Missing even one KPI → ₹0 composite.
 *
 * @param {Array<{ kpi_code: string, slabBonus: number }>} allKpiResults
 * @param {number} compositeAmount - Configured composite bonus amount
 * @returns {{ compositeBonus: number, eligible: boolean, failedKpis: string[] }}
 */
export const calculateCompositeBonus = (allKpiResults, compositeAmount) => {
    if (!compositeAmount || !allKpiResults.length) {
        return { compositeBonus: 0, eligible: false, failedKpis: [] };
    }

    const failedKpis = allKpiResults
        .filter((r) => r.slabBonus === 0)
        .map((r) => r.kpi_code);

    const eligible = failedKpis.length === 0;

    return {
        compositeBonus: eligible ? parseFloat(compositeAmount.toFixed(2)) : 0,
        eligible,
        failedKpis,
    };
};

// ─── Full KPI Incentive (all 3 layers) ───────────────────────────────────────

/**
 * Calculate all 3 incentive layers for a single KPI.
 *
 * @param {object} params
 * @param {string} params.kpiCode
 * @param {number} params.actual          - Actual value for period
 * @param {number} params.attainmentRaw   - Uncapped attainment % (from attainment.calculator)
 * @param {number} params.commissionRate  - From config (0 if KPI is not revenue)
 * @param {Array}  params.slabs           - From config
 * @param {string} params.slabType        - "cumulative"|"non_cumulative" from config
 * @returns {KpiIncentiveBreakdown}
 */
export const calculateKpiIncentive = (params) => {
    const { kpiCode, actual, attainmentRaw, commissionRate, slabs, slabType } = params;

    const commission   = calculateCommission(actual, commissionRate, kpiCode);
    const slabResult   = calculateSlabBonus(kpiCode, attainmentRaw, slabs, slabType);

    return {
        kpi_code:         kpiCode,
        commission:       commission,
        slab_bonus:       slabResult.slabBonus,
        matched_slab:     slabResult.matchedSlab,
        slabs_earned:     slabResult.slabsEarned,
        is_cumulative:    slabResult.isCumulative,
        // composite is calculated separately (needs all KPIs to resolve)
        composite_bonus:  0,
        total:            parseFloat((commission + slabResult.slabBonus).toFixed(2)),
    };
};

/**
 * @typedef {object} KpiIncentiveBreakdown
 * @property {string}      kpi_code
 * @property {number}      commission       - Layer 1
 * @property {number}      slab_bonus       - Layer 2
 * @property {object|null} matched_slab
 * @property {number}      slabs_earned
 * @property {boolean}     is_cumulative
 * @property {number}      composite_bonus  - Layer 3 (filled in by engine after all KPIs)
 * @property {number}      total
 */
