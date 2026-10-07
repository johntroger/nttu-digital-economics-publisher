CREATE TABLE production_http_trigger (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 last_http_at INTEGER,
 heartbeat_count INTEGER NOT NULL DEFAULT 0,
 last_tick_bucket INTEGER,
 lease_id TEXT,
 lease_until INTEGER,
 last_complete_at INTEGER,
 last_dispatch_state TEXT
);
INSERT INTO production_http_trigger(id) VALUES(1);
