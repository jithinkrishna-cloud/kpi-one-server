-- PRD Section 11: KPI Periods and Targets

-- Periods: Monthly intervals for KPI tracking
CREATE TABLE IF NOT EXISTS kpi_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL, -- e.g., "April 2024"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active', 'closed') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Targets: Individual per-executive goals
CREATE TABLE IF NOT EXISTS kpi_targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executive_id INT NOT NULL, -- ONE employee id
  period_id INT NOT NULL,
  kpi_code VARCHAR(50) NOT NULL, -- e.g., 'sales_revenue'
  target_value DECIMAL(12, 2) DEFAULT 0.00,
  status ENUM('pending', 'approved') DEFAULT 'pending',
  approved_by INT NULL, 
  revision_history JSON, -- MySQL JSON for audit logs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(executive_id, period_id, kpi_code),
  FOREIGN KEY (period_id) REFERENCES kpi_periods(id)
);

-- Team Targets: Manager-level aggregation and override
CREATE TABLE IF NOT EXISTS kpi_team_targets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id VARCHAR(255) NOT NULL,
  period_id INT NOT NULL,
  kpi_code VARCHAR(50) NOT NULL,
  auto_sum DECIMAL(12, 2) DEFAULT 0.00,
  override_value DECIMAL(12, 2) DEFAULT NULL,
  revision_history JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, period_id, kpi_code),
  FOREIGN KEY (period_id) REFERENCES kpi_periods(id)
);
