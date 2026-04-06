-- ============================================================
-- F12-C: Incentive Engine Schema Migration
-- 3-Layer: Commission + Slab Bonus (cumulative/non-cumulative) + Composite Bonus
-- Workflow: draft → pending_approval → active → calculated → approved → paid
-- ============================================================

-- 1. Enhance kpi_incentive_configs
--    Add: period_id (config is per-period), commission_rate (Layer 1),
--         slab_type (cumulative vs non-cumulative), status + approval fields
ALTER TABLE kpi_incentive_configs
    ADD COLUMN period_id       INT            DEFAULT NULL  AFTER executive_id,
    ADD COLUMN commission_rate DECIMAL(6,4)   DEFAULT 0.0000 AFTER slabs,
    ADD COLUMN slab_type       ENUM('non_cumulative','cumulative') DEFAULT 'non_cumulative' AFTER commission_rate,
    ADD COLUMN status          ENUM('draft','pending_approval','active','rejected') DEFAULT 'draft' AFTER bonus_amount,
    ADD COLUMN submitted_by    INT            DEFAULT NULL  AFTER status,
    ADD COLUMN approved_by     INT            DEFAULT NULL  AFTER submitted_by,
    ADD COLUMN approved_at     TIMESTAMP      DEFAULT NULL  AFTER approved_by,
    ADD COLUMN rejection_reason TEXT          DEFAULT NULL  AFTER approved_at;

-- Drop old unique constraint (was per executive+kpi only), add period-scoped one
ALTER TABLE kpi_incentive_configs DROP INDEX IF EXISTS `executive_id`;
ALTER TABLE kpi_incentive_configs
    ADD UNIQUE INDEX uq_incentive_config (executive_id, period_id, kpi_code);

-- 2. Composite bonus configuration (Layer 3)
--    One row per executive per period; earned only if ALL KPI slabs are achieved.
CREATE TABLE IF NOT EXISTS kpi_composite_configs (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    executive_id     INT            NOT NULL,
    period_id        INT            NOT NULL,
    composite_bonus  DECIMAL(12,2)  DEFAULT 0.00,
    status           ENUM('draft','pending_approval','active','rejected') DEFAULT 'draft',
    submitted_by     INT            DEFAULT NULL,
    approved_by      INT            DEFAULT NULL,
    approved_at      TIMESTAMP      DEFAULT NULL,
    rejection_reason TEXT           DEFAULT NULL,
    created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE (executive_id, period_id),
    FOREIGN KEY (period_id) REFERENCES kpi_periods(id)
);

-- 3. Expand kpi_incentive_results to store all 3 layers separately
--    Rename existing bonus_earned → slab_bonus_earned for clarity.
--    Add composite_bonus_earned, is_locked, approved_at.
ALTER TABLE kpi_incentive_results
    CHANGE COLUMN bonus_earned      slab_bonus_earned     DECIMAL(12,2) DEFAULT 0.00,
    ADD    COLUMN composite_bonus_earned DECIMAL(12,2)    DEFAULT 0.00 AFTER slab_bonus_earned,
    ADD    COLUMN is_locked         TINYINT(1)            DEFAULT 0    AFTER total_incentive,
    ADD    COLUMN approved_at       TIMESTAMP             DEFAULT NULL AFTER approved_by;

-- 4. Period-level payout summary (one row per executive per period)
--    Aggregates all KPI results into the final payout figure.
--    Admin approves/rejects this — not individual KPI rows.
CREATE TABLE IF NOT EXISTS kpi_payout_summary (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    executive_id         INT            NOT NULL,
    period_id            INT            NOT NULL,
    total_commission     DECIMAL(12,2)  DEFAULT 0.00,
    total_slab_bonus     DECIMAL(12,2)  DEFAULT 0.00,
    composite_bonus      DECIMAL(12,2)  DEFAULT 0.00,
    grand_total          DECIMAL(12,2)  DEFAULT 0.00,
    status               ENUM('calculated','approved','rejected','paid') DEFAULT 'calculated',
    calculated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    calculated_by        INT            DEFAULT NULL,
    approved_by          INT            DEFAULT NULL,
    approved_at          TIMESTAMP      DEFAULT NULL,
    rejection_reason     TEXT           DEFAULT NULL,
    payment_ref          VARCHAR(255)   DEFAULT NULL,
    UNIQUE (executive_id, period_id),
    FOREIGN KEY (period_id) REFERENCES kpi_periods(id)
);

-- 5. Index for fast config lookup by period
CREATE INDEX idx_incentive_config_period ON kpi_incentive_configs (executive_id, period_id);
CREATE INDEX idx_composite_config_period ON kpi_composite_configs (executive_id, period_id);
CREATE INDEX idx_payout_summary_period   ON kpi_payout_summary    (period_id, status);

-- 6. Extend audit log for incentive workflow actions
ALTER TABLE kpi_audit_log
    MODIFY COLUMN action
        ENUM('create','update','delete','approve','reject','override','sync','close',
             'submit','calculate','lock','payout_approve','payout_reject') NOT NULL;
