-- F12-B: KPI Actuals Tracking Migration
-- Adds sync metadata, performance indexes, and audit log enhancements.

-- 1. Add synced_at column to kpi_actuals_daily
--    Tracks when the last auto-sync wrote this row (null for manual entries)
ALTER TABLE kpi_actuals_daily
    ADD COLUMN synced_at TIMESTAMP DEFAULT NULL AFTER note;

-- 2. Performance index for sync lookups (executive + kpi_code + date range)
CREATE INDEX idx_actuals_exec_kpi_date
    ON kpi_actuals_daily (executive_id, kpi_code, actual_date);

-- 3. Index for manual-entry immutability check (source + executive + kpi)
CREATE INDEX idx_actuals_manual_lookup
    ON kpi_actuals_daily (executive_id, kpi_code, source);

-- 4. Extend audit log action ENUM to include 'close' and 'sync' (if not already present)
ALTER TABLE kpi_audit_log
    MODIFY COLUMN action
        ENUM('create', 'update', 'delete', 'approve', 'reject', 'override', 'sync', 'close')
        NOT NULL;

-- 5. Add entity_type 'actual' to distinguish actuals audit entries
--    (table already has entity_type added in migration 007; this ensures the
--     kpi_actuals_daily table name is referenced correctly by the repository)

-- 6. Add index on kpi_incentive_results for the pending-incentive pre-close check
CREATE INDEX idx_incentive_results_period_status
    ON kpi_incentive_results (period_id, status);

-- 7. Seed kpi_master with all 13 KPIs if not already populated
INSERT IGNORE INTO kpi_master (code, name, type, unit, requires_dual_target) VALUES
    ('sales_revenue',          'Sales Revenue',              'revenue',  'INR',     FALSE),
    ('collection_revenue',     'Collection Revenue',         'revenue',  'INR',     FALSE),
    ('lead_quality_relevancy', 'Lead Quality/Relevancy',     'quality',  '%',       FALSE),
    ('lead_conversion',        'Lead Conversion',            'quality',  '%',       FALSE),
    ('call_connect_rate',      'Call Connect Rate',          'activity', '%',       FALSE),
    ('deal_creation',          'Deal Creation',              'output',   'count',   FALSE),
    ('quote_creation',         'Quote Creation',             'output',   'count',   FALSE),
    ('customer_touch',         'Customer Touchpoints',       'activity', 'count',   FALSE),
    ('dialed_calls',           'Number of Calls Dialed',     'activity', 'count',   FALSE),
    ('talk_time',              'Talk Time',                  'activity', 'minutes', FALSE),
    ('clients_onboarded',      'Clients Onboarded',          'output',   'count',   FALSE),
    ('services_completed',     'Services Completed',         'output',   'count',   FALSE),
    ('completion_tat',         'Completion TAT (SLA)',        'output',   'days',    TRUE);
