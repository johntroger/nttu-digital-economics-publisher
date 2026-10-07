-- Only the empty, disabled B37 schema is reversible. Never delete live receipts.
CREATE TEMP TABLE step37_rollback_guard (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO step37_rollback_guard SELECT CASE WHEN
 EXISTS(SELECT 1 FROM production_identity WHERE environment='production' AND database_id='09cdecc7-36a2-4196-950e-ef68b1ecd834')
 AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL)
 AND EXISTS(SELECT 1 FROM production_publisher_config WHERE enabled=0 AND active_job IS NULL)
 AND NOT EXISTS(SELECT 1 FROM production_send_permits)
 AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs)
 AND NOT EXISTS(SELECT 1 FROM production_publisher_evidence)
 AND NOT EXISTS(SELECT 1 FROM production_publisher_usage)
 THEN 1 ELSE 0 END;
DROP TABLE production_publisher_usage;
DROP TABLE production_publisher_evidence;
DROP TABLE production_publisher_attempts;
DROP TABLE production_publisher_jobs;
DROP TABLE production_send_permits;
DROP TABLE production_publisher_runtime;
DROP TABLE production_publisher_audit;
DROP TABLE production_publisher_config;
DELETE FROM schema_migrations WHERE name='0014_production_publisher.sql';
DROP TABLE step37_rollback_guard;
