-- Execute transactionally. Never remove an unresolved outbound journal.
CREATE TABLE production_runner_rollback_guard(ok INTEGER CHECK(ok=1));
INSERT INTO production_runner_rollback_guard SELECT CASE WHEN
 (SELECT count(*) FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown'))=0
 AND (SELECT count(*) FROM production_publisher_evidence WHERE applied=0)=0
 AND (SELECT count(*) FROM production_publisher_config WHERE enabled=1)=0
 THEN 1 ELSE 0 END;
DROP TABLE production_runner_rollback_guard;
DROP TABLE production_runner_grants;
DROP TABLE production_runner_sessions;
DELETE FROM schema_migrations WHERE name='0016_production_publisher_runner.sql';
