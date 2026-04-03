-- Add metadata column to store multi-franchise roles and permissions
ALTER TABLE one_employee_cache ADD COLUMN metadata JSON NULL AFTER franchisee_id;
