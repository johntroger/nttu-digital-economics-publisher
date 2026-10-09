-- F5 opt-in journal. No activation or real credentials. Keep F3/F4 journals.
CREATE TABLE production_runner_sessions (
 job TEXT PRIMARY KEY REFERENCES production_publisher_jobs(id),
 runner TEXT NOT NULL, release TEXT NOT NULL, snapshot TEXT NOT NULL,
 expires_at INTEGER NOT NULL, caption_hash TEXT,
 image_bytes INTEGER, proof_until INTEGER, fingerprint TEXT
);
CREATE TRIGGER production_runner_snapshot_immutable BEFORE UPDATE OF job,release,snapshot ON production_runner_sessions
 BEGIN SELECT RAISE(ABORT,'immutable runner snapshot'); END;
CREATE TABLE production_runner_grants (
 attempt TEXT PRIMARY KEY REFERENCES production_publisher_attempts(id),
 job TEXT NOT NULL REFERENCES production_publisher_jobs(id),
 runner TEXT NOT NULL, grant_id TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL, authorized_at INTEGER
);
CREATE TRIGGER production_runner_grant_identity BEFORE UPDATE OF attempt,job,runner,grant_id,expires_at ON production_runner_grants
 BEGIN SELECT RAISE(ABORT,'immutable dispatch grant'); END;
CREATE TRIGGER production_runner_grant_once BEFORE UPDATE OF authorized_at ON production_runner_grants
 WHEN OLD.authorized_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'dispatch grant already consumed'); END;
