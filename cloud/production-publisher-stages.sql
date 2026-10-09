-- F3 journal only. Install explicitly after F4 rollout review; no activation.
CREATE TABLE production_publisher_preparation (
 job TEXT PRIMARY KEY REFERENCES production_publisher_jobs(id),
 phase TEXT NOT NULL CHECK(phase IN ('image','connection','send')),
 revision INTEGER NOT NULL DEFAULT 1,
 release TEXT NOT NULL, fingerprint TEXT NOT NULL,
 approval_snapshot TEXT,
 image_bytes INTEGER, verified_at INTEGER, proof_expires_at INTEGER,
 CHECK(image_bytes IS NULL OR image_bytes BETWEEN 1 AND 5242880)
);
CREATE TRIGGER production_preparation_identity BEFORE UPDATE OF job,release,fingerprint,approval_snapshot ON production_publisher_preparation
 BEGIN SELECT RAISE(ABORT,'immutable preparation identity'); END;
CREATE TABLE production_publisher_stock_scan (
 id INTEGER PRIMARY KEY CHECK(id=1), snapshot TEXT NOT NULL,
 release TEXT NOT NULL, started_at INTEGER NOT NULL, cursor INTEGER NOT NULL DEFAULT 0,
 remaining INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1
);
