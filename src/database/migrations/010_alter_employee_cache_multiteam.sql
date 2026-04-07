-- PRD Fix: Multi-team employee support
-- Adds roles (RoleTypeIds), team_ids (TeamIDs array), and kpi_role (derived)
-- to one_employee_cache to support employees belonging to multiple teams.
--
-- Compatible with MySQL 5.7+
-- The migration runner handles ER_DUP_FIELDNAME gracefully if re-run.

ALTER TABLE one_employee_cache
  ADD COLUMN roles     JSON        NULL    COMMENT 'Array of RoleTypeIds e.g. [1,2]'           AFTER metadata,
  ADD COLUMN team_ids  JSON        NULL    COMMENT 'Array of all TeamIDs e.g. [9,29]'           AFTER roles,
  ADD COLUMN kpi_role  VARCHAR(50) NULL    COMMENT 'Derived: KPI Admin/Manager/Executive'       AFTER team_ids;
