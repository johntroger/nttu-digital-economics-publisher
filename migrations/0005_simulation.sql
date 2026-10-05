-- Disabled by default, isolated local fake workflow only.
CREATE TABLE simulation_settings (
  id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
INSERT INTO simulation_settings VALUES (1,0);
CREATE TABLE simulation_schedules (
  page_connection_id TEXT PRIMARY KEY REFERENCES page_connections(id), start_date TEXT NOT NULL
);
CREATE TABLE stock_alert_state (
  page_connection_id TEXT PRIMARY KEY REFERENCES page_connections(id),
  level TEXT NOT NULL CHECK(level IN ('normal','low','empty')),
  episode INTEGER NOT NULL CHECK(episode>=0), eligible_count INTEGER NOT NULL CHECK(eligible_count>=0)
);
