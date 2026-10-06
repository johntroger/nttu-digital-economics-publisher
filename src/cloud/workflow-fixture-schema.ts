// Only installed in isolated test D1 databases. Never a staging migration.
export const WORKFLOW_FIXTURE_SCHEMA = `
CREATE TABLE fixture_flow_config (
 id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL CHECK(identity='isolated-d1-fixture'),
 target TEXT NOT NULL CHECK(target LIKE 'fixture:%'), start_date TEXT,
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)), maintenance INTEGER NOT NULL DEFAULT 0,
 blocked TEXT, active_job TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE fixture_flow_posts (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TRIGGER fixture_flow_post_revision AFTER UPDATE ON fixture_flow_posts BEGIN
 UPDATE fixture_flow_config SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER fixture_flow_post_insert AFTER INSERT ON fixture_flow_posts BEGIN
 UPDATE fixture_flow_config SET revision=revision+1 WHERE id=1;
END;
CREATE TABLE fixture_flow_slots (
 day TEXT PRIMARY KEY, planned TEXT REFERENCES fixture_flow_posts(id),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','confirmed','expired'))
);
CREATE TABLE fixture_flow_jobs (
 id TEXT PRIMARY KEY, day TEXT NOT NULL REFERENCES fixture_flow_slots(day),
 post TEXT NOT NULL REFERENCES fixture_flow_posts(id), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 caption TEXT NOT NULL, checksum TEXT NOT NULL, config_revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('held','requested','retry_wait','unknown','confirmed','failed','cancelled')),
 tries INTEGER NOT NULL DEFAULT 0 CHECK(tries BETWEEN 0 AND 3), next_at INTEGER,
 lease_until INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER fixture_flow_snapshot BEFORE UPDATE OF day,post,snapshot,caption,checksum,config_revision ON fixture_flow_jobs
 BEGIN SELECT RAISE(ABORT,'immutable workflow snapshot'); END;
CREATE TABLE fixture_flow_attempts (
 id TEXT PRIMARY KEY, job TEXT NOT NULL REFERENCES fixture_flow_jobs(id), ordinal INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('intent','confirmed','retryable','policy','global','unknown')),
 created_at INTEGER NOT NULL, remote_id TEXT, confirmed_at INTEGER, UNIQUE(job,ordinal)
);
CREATE TRIGGER fixture_flow_attempt_terminal BEFORE UPDATE ON fixture_flow_attempts WHEN OLD.state!='intent' AND OLD.state!='unknown'
 BEGIN SELECT RAISE(ABORT,'terminal receipt'); END;
CREATE TABLE fixture_flow_usage (
 day TEXT PRIMARY KEY, post TEXT NOT NULL UNIQUE REFERENCES fixture_flow_posts(id),
 job TEXT NOT NULL UNIQUE REFERENCES fixture_flow_jobs(id), remote_id TEXT NOT NULL UNIQUE,
 confirmed_at INTEGER NOT NULL, body TEXT NOT NULL, angle TEXT NOT NULL
);
CREATE TABLE fixture_flow_outbox (
 event_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE TABLE fixture_flow_stock (id INTEGER PRIMARY KEY CHECK(id=1), level TEXT NOT NULL, episode INTEGER NOT NULL);
`;
