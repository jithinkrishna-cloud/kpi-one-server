-- Final Schema Fixes for Phase 1 (F12-A)
-- Incorporating Dual-Value Support, Strict Validation, and Audit readiness.

-- 1. Period Lifecycle Stages
ALTER TABLE kpi_periods 
MODIFY COLUMN status ENUM('draft', 'pending', 'active', 'approved', 'closed') DEFAULT 'draft';

-- 2. Target Schema Enhancements
-- Note: 'target_value' already exists. Adding Benchmark/Ceiling for dual-target KPIs.
ALTER TABLE kpi_targets
ADD COLUMN benchmark_value DECIMAL(15, 2) DEFAULT NULL AFTER target_value,
ADD COLUMN ceiling_value DECIMAL(15, 2) DEFAULT NULL AFTER benchmark_value,
ADD COLUMN set_by INT NOT NULL AFTER revision_history,
MODIFY COLUMN status ENUM('active', 'pending', 'approved') DEFAULT 'active';

-- 3. UNIQUE Constraint for Data Integrity
-- Ensure we don't have duplicate target entries per executive/period/kpi.
-- The table already had a unique constraint (executive_id, period_id, kpi_code) in 002.
-- But we'll re-verify it or add it if missing in some environments.
-- ALTER TABLE kpi_targets ADD CONSTRAINT unique_target UNIQUE (executive_id, period_id, kpi_code);

-- 4. Team Target Reconciliation Logic
ALTER TABLE kpi_team_targets 
ADD COLUMN final_value DECIMAL(15, 2) AFTER override_value;

-- 5. KPI Metadata Master Table
CREATE TABLE IF NOT EXISTS kpi_master (
  code VARCHAR(50) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type ENUM('revenue', 'quality', 'activity', 'output') NOT NULL,
  unit VARCHAR(20) DEFAULT NULL,
  requires_dual_target BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Audit Log Table (F12-A compliance)
CREATE TABLE IF NOT EXISTS kpi_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(50) NOT NULL,
  record_id INT NOT NULL,
  action ENUM('create', 'update', 'delete', 'approve', 'override', 'sync') NOT NULL,
  old_value JSON DEFAULT NULL,
  new_value JSON DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  performed_by INT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
