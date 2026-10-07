// Isolated test schema only. Never installed on production or staging.
export const PRODUCTION_FIXTURE_SCHEMA = `
CREATE TABLE production_fixture_config (
 id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL CHECK(identity='isolated-d1-fixture'),
 target TEXT NOT NULL CHECK(target LIKE 'fixture:%'), start_date TEXT,
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)), maintenance INTEGER NOT NULL DEFAULT 0,
 blocked TEXT, active_job TEXT, revision INTEGER NOT NULL DEFAULT 1,
 page TEXT NOT NULL, database_id TEXT NOT NULL, bucket TEXT NOT NULL,
 deployment_gate INTEGER NOT NULL DEFAULT 0 CHECK(deployment_gate IN (0,1)),
 owner_gate INTEGER NOT NULL DEFAULT 0 CHECK(owner_gate IN (0,1)),
 connection_gate INTEGER NOT NULL DEFAULT 0 CHECK(connection_gate IN (0,1))
);
CREATE TRIGGER production_fixture_config_revision AFTER UPDATE OF paused,maintenance,blocked,start_date,page,database_id,bucket,deployment_gate,owner_gate,connection_gate ON production_fixture_config BEGIN
 UPDATE production_fixture_config SET revision=revision+1 WHERE id=1;
END;
CREATE TABLE production_fixture_posts (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TRIGGER production_fixture_post_revision AFTER UPDATE ON production_fixture_posts BEGIN
 UPDATE production_fixture_config SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER production_fixture_post_insert AFTER INSERT ON production_fixture_posts BEGIN
 UPDATE production_fixture_config SET revision=revision+1 WHERE id=1;
END;
CREATE TABLE production_fixture_slots (
 day TEXT PRIMARY KEY, planned TEXT REFERENCES production_fixture_posts(id),
 state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','confirmed','expired'))
);
CREATE TABLE production_fixture_jobs (
 id TEXT PRIMARY KEY, day TEXT NOT NULL REFERENCES production_fixture_slots(day),
 post TEXT NOT NULL REFERENCES production_fixture_posts(id), snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
 caption TEXT NOT NULL, checksum TEXT NOT NULL, config_revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('held','requested','retry_wait','unknown','confirmed','failed','cancelled')),
 tries INTEGER NOT NULL DEFAULT 0 CHECK(tries BETWEEN 0 AND 3), next_at INTEGER,
 lease_until INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TRIGGER production_fixture_snapshot BEFORE UPDATE OF day,post,snapshot,caption,checksum,config_revision ON production_fixture_jobs
 BEGIN SELECT RAISE(ABORT,'immutable workflow snapshot'); END;
CREATE TABLE production_fixture_attempts (
 id TEXT PRIMARY KEY, job TEXT NOT NULL REFERENCES production_fixture_jobs(id), ordinal INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('intent','confirmed','retryable','policy','global','unknown')),
 created_at INTEGER NOT NULL, remote_id TEXT, confirmed_at INTEGER, UNIQUE(job,ordinal)
);
CREATE TRIGGER production_fixture_attempt_terminal BEFORE UPDATE ON production_fixture_attempts WHEN OLD.state!='intent' AND OLD.state!='unknown'
 BEGIN SELECT RAISE(ABORT,'terminal receipt'); END;
CREATE TABLE production_fixture_evidence (
 attempt TEXT PRIMARY KEY REFERENCES production_fixture_attempts(id), job TEXT NOT NULL REFERENCES production_fixture_jobs(id),
 response TEXT NOT NULL CHECK(json_valid(response)), sent_at INTEGER NOT NULL, observed_at INTEGER NOT NULL,
 applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1))
);
CREATE TRIGGER production_fixture_evidence_immutable BEFORE UPDATE OF attempt,job,sent_at ON production_fixture_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence identity'); END;
CREATE TRIGGER production_fixture_evidence_terminal BEFORE UPDATE OF response,observed_at ON production_fixture_evidence WHEN json_extract(OLD.response,'$.kind')!='unknown' BEGIN SELECT RAISE(ABORT,'terminal evidence'); END;
CREATE TABLE production_fixture_usage (
 day TEXT PRIMARY KEY, post TEXT NOT NULL UNIQUE REFERENCES production_fixture_posts(id),
 job TEXT NOT NULL UNIQUE REFERENCES production_fixture_jobs(id), remote_id TEXT NOT NULL UNIQUE,
 confirmed_at INTEGER NOT NULL, body TEXT NOT NULL, angle TEXT NOT NULL
);
CREATE TABLE production_fixture_outbox (
 event_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE TABLE production_fixture_stock (id INTEGER PRIMARY KEY CHECK(id=1), level TEXT NOT NULL, episode INTEGER NOT NULL);
`;
