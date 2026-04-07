-- Stores the ONE CRM bearer token alongside the employee cache row.
-- Used by the KPI backend to proxy calls to ONE CRM APIs (e.g. /getTeams)
-- without depending on a cookie being present in the request.
-- Compatible with MySQL 5.7+

ALTER TABLE one_employee_cache
  ADD COLUMN crm_token TEXT NULL COMMENT 'ONE CRM bearer token for outgoing API calls' AFTER kpi_role;
