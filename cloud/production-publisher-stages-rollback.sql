-- Refuse rollback if any journal, unresolved job or unapplied evidence exists.
CREATE TEMP TABLE f3_rollback_guard(ok INTEGER CHECK(ok=1));
INSERT INTO f3_rollback_guard SELECT CASE WHEN
 NOT EXISTS(SELECT 1 FROM production_publisher_preparation)
 AND NOT EXISTS(SELECT 1 FROM production_publisher_stock_scan)
 AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown'))
 AND NOT EXISTS(SELECT 1 FROM production_publisher_evidence WHERE applied=0)
 THEN 1 ELSE 0 END;
DROP TABLE f3_rollback_guard;
DROP TRIGGER production_preparation_identity;
DROP TABLE production_publisher_preparation;
DROP TABLE production_publisher_stock_scan;
DELETE FROM schema_migrations WHERE name='0015_production_publisher_stages.sql';
