-- Live operation tables. No fixture rows, permits, jobs or schedule are imported.
CREATE TABLE production_publisher_config (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, start_date TEXT, connection_hash TEXT,
 active_job TEXT, blocked TEXT, stock_pending INTEGER NOT NULL DEFAULT 0,
 stock_level TEXT NOT NULL DEFAULT 'normal', stock_episode INTEGER NOT NULL DEFAULT 0,
 publish_time TEXT NOT NULL DEFAULT '10:00' CHECK(publish_time='10:00'),
 timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK(timezone='Asia/Ho_Chi_Minh')
);
INSERT INTO production_publisher_config(id) VALUES(1);
CREATE TRIGGER production_publisher_revision AFTER UPDATE OF enabled,start_date,connection_hash,blocked ON production_publisher_config BEGIN
 UPDATE production_publisher_config SET revision=revision+1 WHERE id=1;
END;
CREATE TABLE production_send_permits (
 id TEXT PRIMARY KEY, page_id TEXT NOT NULL CHECK(page_id='817593604765443'),
 version_id TEXT NOT NULL REFERENCES post_versions(id), caption TEXT NOT NULL, checksum TEXT NOT NULL,
 business_date TEXT NOT NULL, due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>due_at),
 mode TEXT NOT NULL DEFAULT 'normal' CHECK(mode IN ('normal','test')),
 actor TEXT NOT NULL CHECK(actor='tranthanhtung37@gmail.com'), approved_at INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)), CHECK(approved_at<=due_at)
);
CREATE TRIGGER production_permit_immutable BEFORE UPDATE OF id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at ON production_send_permits BEGIN SELECT RAISE(ABORT,'immutable publication approval'); END;
CREATE TABLE production_publisher_jobs (
 id TEXT PRIMARY KEY, permit TEXT NOT NULL UNIQUE REFERENCES production_send_permits(id),
 day TEXT NOT NULL, post TEXT NOT NULL REFERENCES posts(id), version TEXT NOT NULL REFERENCES post_versions(id),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), caption TEXT NOT NULL, checksum TEXT NOT NULL,
 config_revision INTEGER NOT NULL, operation_generation INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('held','requested','retry_wait','unknown','confirmed','failed','cancelled')),
 tries INTEGER NOT NULL DEFAULT 0 CHECK(tries BETWEEN 0 AND 3), next_at INTEGER,
 lease_until INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX production_one_active_job ON production_publisher_jobs((1)) WHERE state IN ('held','requested','retry_wait','unknown');
CREATE TRIGGER production_job_immutable BEFORE UPDATE OF id,permit,day,post,version,snapshot,caption,checksum,config_revision,operation_generation ON production_publisher_jobs BEGIN SELECT RAISE(ABORT,'immutable publication snapshot'); END;
CREATE TABLE production_publisher_attempts (
 id TEXT PRIMARY KEY, job TEXT NOT NULL REFERENCES production_publisher_jobs(id), ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 3),
 state TEXT NOT NULL CHECK(state IN ('intent','confirmed','retryable','policy','global','unknown')),
 created_at INTEGER NOT NULL, UNIQUE(job,ordinal)
);
CREATE TRIGGER production_attempt_immutable BEFORE UPDATE OF id,job,ordinal,created_at ON production_publisher_attempts BEGIN SELECT RAISE(ABORT,'immutable intent'); END;
CREATE TRIGGER production_attempt_terminal BEFORE UPDATE OF state ON production_publisher_attempts WHEN OLD.state NOT IN ('intent','unknown') AND NEW.state!=OLD.state BEGIN SELECT RAISE(ABORT,'terminal outcome'); END;
CREATE TABLE production_publisher_evidence (
 attempt TEXT PRIMARY KEY REFERENCES production_publisher_attempts(id), response TEXT NOT NULL CHECK(json_valid(response)),
 sent_at INTEGER NOT NULL, observed_at INTEGER NOT NULL, applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1))
);
CREATE TRIGGER production_evidence_identity BEFORE UPDATE OF attempt,sent_at ON production_publisher_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER production_evidence_terminal BEFORE UPDATE OF response,observed_at ON production_publisher_evidence WHEN json_extract(OLD.response,'$.kind')!='unknown' BEGIN SELECT RAISE(ABORT,'terminal evidence'); END;
CREATE TABLE production_publisher_usage (
 day TEXT PRIMARY KEY, job TEXT NOT NULL UNIQUE REFERENCES production_publisher_jobs(id), post TEXT NOT NULL UNIQUE REFERENCES posts(id),
 remote_id TEXT NOT NULL UNIQUE, confirmed_at INTEGER NOT NULL, caption TEXT NOT NULL, checksum TEXT NOT NULL
);
CREATE TRIGGER production_usage_immutable BEFORE UPDATE ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'immutable publication'); END;
CREATE TRIGGER production_usage_no_delete BEFORE DELETE ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'immutable publication'); END;
CREATE TABLE production_publisher_runtime (
 id INTEGER PRIMARY KEY CHECK(id=1), last_received_at INTEGER, last_complete_at INTEGER,
 heartbeat_count INTEGER NOT NULL DEFAULT 0, lease_id TEXT, lease_until INTEGER, last_bucket INTEGER,
 state TEXT NOT NULL DEFAULT 'closed', last_queries INTEGER NOT NULL DEFAULT 0, last_duration_ms INTEGER NOT NULL DEFAULT 0
);
INSERT INTO production_publisher_runtime(id) VALUES(1);
CREATE TABLE production_publisher_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL
);
