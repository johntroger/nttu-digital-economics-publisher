CREATE TABLE production_operations (
 id INTEGER PRIMARY KEY CHECK(id=1),
 last_scheduled_at INTEGER,
 heartbeat_count INTEGER NOT NULL DEFAULT 0,
 last_dispatch_state TEXT
);
INSERT INTO production_operations(id) VALUES(1);
