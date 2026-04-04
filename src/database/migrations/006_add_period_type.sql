-- Add missing 'type' column to kpi_periods
ALTER TABLE kpi_periods 
ADD COLUMN type ENUM('monthly', 'quarterly', 'yearly', 'daily', 'weekly') DEFAULT 'monthly' AFTER end_date;
