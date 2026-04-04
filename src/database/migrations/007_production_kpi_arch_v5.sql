-- Production Architecture Migration for KPI Phase 1 (F12-A)
-- Includes: Atomic states, Race-condition prevention, and Optimized indexing.

-- 1. KPI Periods Enhancements
ALTER TABLE kpi_periods 
MODIFY COLUMN status ENUM('draft', 'pending', 'active', 'rejected', 'closed') DEFAULT 'draft',
ADD COLUMN rejection_reason TEXT DEFAULT NULL AFTER status,
ADD COLUMN approved_by INT DEFAULT NULL AFTER rejection_reason,
ADD COLUMN is_frozen BOOLEAN DEFAULT FALSE AFTER approved_by;

-- 2. KPI Targets Cleanup & Constraints
-- Drop redundant status column (Single source of truth = Period)
ALTER TABLE kpi_targets DROP COLUMN status;
ALTER TABLE kpi_targets DROP COLUMN approved_by; -- Moved to period

-- Ensure UNIQUE constraint for data integrity (executive, period, kpi)
-- The constraint might already be there, but we'll re-ensure it.
ALTER TABLE kpi_targets MODIFY COLUMN kpi_code VARCHAR(50) NOT NULL;
ALTER TABLE kpi_targets ADD UNIQUE INDEX unique_target (executive_id, period_id, kpi_code);

-- High-Performance Indexes for Scale
CREATE INDEX idx_targets_exec_period ON kpi_targets (executive_id, period_id);
CREATE INDEX idx_targets_period_kpi ON kpi_targets (period_id, kpi_code);

-- 3. Team Target Logic - Atomic & Audit Ready
ALTER TABLE kpi_team_targets 
ADD COLUMN override_by INT DEFAULT NULL AFTER override_value,
ADD COLUMN reason TEXT DEFAULT NULL AFTER override_by;

-- Resolve Indexing for Aggregations
CREATE INDEX idx_team_targets_lookup ON kpi_team_targets (team_id, period_id, kpi_code);

-- 4. Unified Audit Log Structure (Refinement)
-- Ensure entity_type is clear (target, team_target, period)
ALTER TABLE kpi_audit_log 
MODIFY COLUMN action ENUM('create', 'update', 'delete', 'approve', 'reject', 'override', 'sync') NOT NULL,
ADD COLUMN entity_type VARCHAR(50) DEFAULT 'target' AFTER table_name;
