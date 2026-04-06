import { KPI_ATTAINMENT_TYPE, KPI_DATA_SOURCE, ATTAINMENT_CAP, KPI_CODES } from "../shared/kpi.constants.js";

/**
 * F12-B: Attainment Calculation Engine
 *
 * Formulas by type:
 *   standard → (Actual ÷ Target) × 100          [all KPIs except TAT]
 *   tat      → (Benchmark ÷ Actual TAT) × 100   [Completion TAT — lower is better]
 *              breach flag when Actual TAT > Ceiling
 *
 * Display cap: attainment_pct is capped at 150% for UI rendering.
 * The raw uncapped value is also returned for incentive calculation use.
 */

/**
 * Calculate attainment for a single KPI row.
 *
 * @param {object} params
 * @param {string}  params.kpiCode      - KPI identifier
 * @param {number}  params.actual       - Actual value for the period
 * @param {number}  params.target       - Target value set by manager
 * @param {number}  [params.benchmark]  - Benchmark TAT value (TAT KPI only)
 * @param {number}  [params.ceiling]    - Ceiling TAT value (TAT KPI only)
 * @returns {AttainmentResult}
 */
export const calculateAttainment = ({ kpiCode, actual, target, benchmark, ceiling }) => {
    const type = KPI_ATTAINMENT_TYPE[kpiCode] || "standard";
    const isManual = KPI_DATA_SOURCE[kpiCode] === "manual";

    // Collection Revenue: missing entry → 0% + warning flag
    if (kpiCode === KPI_CODES.COLLECTION_REVENUE && actual === 0) {
        return {
            kpi_code:          kpiCode,
            actual_value:      0,
            target_value:      target,
            attainment_pct:    0,
            attainment_raw:    0,
            is_capped:         false,
            tat_breach:        false,
            collection_missing: true,
            warning:           "Collection Revenue not entered. Attainment shown as 0%.",
        };
    }

    let raw = 0;

    if (type === "tat") {
        // Completion TAT: lower actual = better performance
        // Formula: (Benchmark ÷ Actual TAT) × 100
        raw = actual > 0 && benchmark > 0
            ? (benchmark / actual) * 100
            : 0;

        const breach = ceiling != null && actual > ceiling;

        const capped = Math.min(raw, ATTAINMENT_CAP);

        return {
            kpi_code:          kpiCode,
            actual_value:      actual,
            target_value:      target,    // stored for reference; benchmark is the real bar
            benchmark_value:   benchmark,
            ceiling_value:     ceiling,
            attainment_pct:    parseFloat(capped.toFixed(2)),
            attainment_raw:    parseFloat(raw.toFixed(2)),
            is_capped:         raw > ATTAINMENT_CAP,
            tat_breach:        breach,
            breach_message:    breach
                ? `TAT breached: actual ${actual} days exceeds ceiling of ${ceiling} days.`
                : null,
            collection_missing: false,
            warning:           null,
        };
    }

    // Standard formula: (Actual ÷ Target) × 100
    raw = target > 0 ? (actual / target) * 100 : 0;
    const capped = Math.min(raw, ATTAINMENT_CAP);

    return {
        kpi_code:          kpiCode,
        actual_value:      actual,
        target_value:      target,
        attainment_pct:    parseFloat(capped.toFixed(2)),
        attainment_raw:    parseFloat(raw.toFixed(2)),
        is_capped:         raw > ATTAINMENT_CAP,
        tat_breach:        false,
        collection_missing: false,
        warning:           null,
    };
};

/**
 * Compute attainment for a full set of KPI rows from the dashboard query.
 * Each row must have: kpi_code, actual_value, target_value, benchmark_value, ceiling_value
 *
 * @param {Array<object>} rows - Raw rows from getExecutiveDashboardSummary
 * @returns {Array<AttainmentResult>}
 */
export const computeAttainmentForRows = (rows) => {
    return rows.map((row) =>
        calculateAttainment({
            kpiCode:   row.kpi_code,
            actual:    parseFloat(row.actual_value) || 0,
            target:    parseFloat(row.target_value) || 0,
            benchmark: parseFloat(row.benchmark_value) || 0,
            ceiling:   row.ceiling_value != null ? parseFloat(row.ceiling_value) : null,
        })
    );
};

/**
 * Aggregate total attainment across all KPIs for a single executive.
 * Used for summary cards on the dashboard.
 *
 * @param {Array<AttainmentResult>} results
 * @returns {{ average_attainment: number, total_kpis: number, breaches: number, missing_collection: boolean }}
 */
export const summariseAttainment = (results) => {
    if (!results.length) return { average_attainment: 0, total_kpis: 0, breaches: 0, missing_collection: false };

    const sum        = results.reduce((acc, r) => acc + r.attainment_pct, 0);
    const breaches   = results.filter((r) => r.tat_breach).length;
    const missing    = results.some((r) => r.collection_missing);

    return {
        average_attainment: parseFloat((sum / results.length).toFixed(2)),
        total_kpis:         results.length,
        breaches,
        missing_collection: missing,
    };
};

/**
 * @typedef {object} AttainmentResult
 * @property {string}  kpi_code
 * @property {number}  actual_value
 * @property {number}  target_value
 * @property {number}  [benchmark_value]
 * @property {number}  [ceiling_value]
 * @property {number}  attainment_pct    - Capped at ATTAINMENT_CAP (150%)
 * @property {number}  attainment_raw    - Uncapped value (for incentive calc)
 * @property {boolean} is_capped         - True when raw > 150%
 * @property {boolean} tat_breach        - True when TAT actual > ceiling
 * @property {string}  [breach_message]
 * @property {boolean} collection_missing
 * @property {string}  [warning]
 */
