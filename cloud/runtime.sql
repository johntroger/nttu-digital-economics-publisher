CREATE TABLE cloud_runtime (
  id INTEGER PRIMARY KEY CHECK(id=1),
  environment TEXT NOT NULL CHECK(environment='staging'),
  last_scheduled_at INTEGER,
  heartbeat_count INTEGER NOT NULL DEFAULT 0 CHECK(heartbeat_count>=0)
);
INSERT INTO cloud_runtime(id,environment) VALUES (1,'staging');
