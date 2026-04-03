-- PRD Section 10: one_employee_cache
-- id: internal PK
-- one_employee_id: from ONE CRM
-- name, role, team_id, franchisee_id: metadata
-- cached_at: for TTL logic (1 hour)

CREATE TABLE IF NOT EXISTS one_employee_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  one_employee_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  team_id VARCHAR(255),
  franchisee_id VARCHAR(255),
  cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (one_employee_id)
);
