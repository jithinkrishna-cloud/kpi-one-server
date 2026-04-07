-- Migration: 012_create_franchisee_targets.sql
-- Creates kpi_franchisee_targets table for F12-A Franchisee Target rollup

CREATE TABLE IF NOT EXISTS kpi_franchisee_targets (
  id               INT             AUTO_INCREMENT PRIMARY KEY,
  franchisee_id    VARCHAR(50)     NOT NULL,
  period_id        INT             NOT NULL,
  kpi_code         VARCHAR(50)     NOT NULL,
  auto_sum         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  override_value   DECIMAL(15,2)   DEFAULT NULL,
  override_by      VARCHAR(50)     DEFAULT NULL,    -- one_employee_id of Admin who overrode
  override_reason  TEXT            DEFAULT NULL,
  final_value      DECIMAL(15,2)   NOT NULL DEFAULT 0,  -- override_value if set, else auto_sum
  revision_history JSON            DEFAULT NULL,
  created_at       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_franchisee_period_kpi (franchisee_id, period_id, kpi_code),
  KEY idx_period_id     (period_id),
  KEY idx_franchisee_id (franchisee_id),

  CONSTRAINT fk_ft_period FOREIGN KEY (period_id) REFERENCES kpi_periods (id) ON DELETE CASCADE
);
