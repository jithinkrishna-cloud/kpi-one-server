-- PRD Section 12: KPI Actuals Storage

-- Consolidated Daily Actuals Table
-- Stores both automated counts (from ONE API) and manual entries (Collection Revenue)
CREATE TABLE IF NOT EXISTS kpi_actuals_daily (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executive_id INT NOT NULL, -- ONE employee id
  actual_date DATE NOT NULL,
  kpi_code VARCHAR(50) NOT NULL, -- e.g., 'leads', 'revenue', 'collection'
  value DECIMAL(12, 2) DEFAULT 0.00,
  source ENUM('auto', 'manual') NOT NULL,
  note TEXT, -- Audit note for manual entries
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(executive_id, actual_date, kpi_code),
  INDEX (executive_id, actual_date)
);
