-- PRD Section 13: Incentive Engine Configuration

-- Incentive Configuration: Slabs and rules per executive
CREATE TABLE IF NOT EXISTS kpi_incentive_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executive_id INT NOT NULL, -- Target specific executive
  kpi_code VARCHAR(50) NOT NULL,
  slabs JSON NOT NULL, -- e.g., [{"min": 80, "max": 90, "rate": 2000}, {"min": 91, "max": 100, "rate": 5000}]
  bonus_threshold DECIMAL(5, 2), -- Attainment % needed for bonus (e.g. 100.00)
  bonus_amount DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(executive_id, kpi_code)
);

-- Incentive Results: Stored results of calculations
CREATE TABLE IF NOT EXISTS kpi_incentive_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executive_id INT NOT NULL,
  period_id INT NOT NULL,
  kpi_code VARCHAR(50) NOT NULL,
  actual_value DECIMAL(12, 2) DEFAULT 0.00,
  target_value DECIMAL(12, 2) DEFAULT 0.00,
  attainment_pct DECIMAL(5, 2) DEFAULT 0.00,
  commission_earned DECIMAL(12, 2) DEFAULT 0.00,
  bonus_earned DECIMAL(12, 2) DEFAULT 0.00,
  total_incentive DECIMAL(12, 2) DEFAULT 0.00,
  status ENUM('draft', 'calculated', 'approved', 'paid') DEFAULT 'calculated',
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_by INT,
  payment_ref VARCHAR(255),
  UNIQUE(executive_id, period_id, kpi_code),
  FOREIGN KEY (period_id) REFERENCES kpi_periods(id)
);
