-- Operational control is deliberately disabled on deployment and after restore.
CREATE TABLE cloud_daily_config (
 id INTEGER PRIMARY KEY CHECK(id=1),
 page_connection_id TEXT REFERENCES page_connections(id),
 start_date TEXT,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 config_hash TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 stock_pending INTEGER NOT NULL DEFAULT 0 CHECK(stock_pending IN (0,1)),
 configured_at TEXT,
 actor TEXT
);
INSERT INTO cloud_daily_config(id) VALUES(1);
-- Scheduled staging posts share the business history, while trial requests remain independent.
CREATE TRIGGER cloud_daily_actual_date_guard BEFORE INSERT ON publications
WHEN NEW.remote_business_date IS NOT NULL AND EXISTS(
 SELECT 1 FROM publish_jobs n JOIN page_connections c ON c.id=n.page_connection_id
 JOIN publish_jobs old ON old.page_connection_id=n.page_connection_id
 JOIN publications p ON p.job_id=old.id
 WHERE n.id=NEW.job_id AND n.slot_id IS NOT NULL AND old.slot_id IS NOT NULL
 AND c.environment='staging' AND p.remote_business_date=NEW.remote_business_date AND p.id<>NEW.id
)
BEGIN SELECT RAISE(ABORT,'cloud_daily_actual_date_guard'); END;
