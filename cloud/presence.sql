-- Durable observations remain in content backups; scan claims are operational.
CREATE TABLE cloud_publication_presence (
 remote_id TEXT PRIMARY KEY, page_id TEXT NOT NULL,
 observed_status TEXT CHECK(observed_status IN ('available','unavailable')),
 observed_at INTEGER, first_unavailable_at INTEGER,
 checked_at INTEGER NOT NULL,
 check_result TEXT NOT NULL CHECK(check_result IN ('available','unavailable','unverified')),
 reason TEXT NOT NULL
);
CREATE TABLE cloud_presence_runs (
 id TEXT PRIMARY KEY, page_id TEXT NOT NULL, business_date TEXT NOT NULL,
 started_at INTEGER NOT NULL, completed_at INTEGER, seed_token TEXT NOT NULL,
 UNIQUE(page_id,business_date)
);
CREATE TABLE cloud_presence_items (
 run_id TEXT NOT NULL REFERENCES cloud_presence_runs(id) ON DELETE CASCADE,
 remote_id TEXT NOT NULL, owner TEXT, lease_until INTEGER,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','intent','available','unavailable','unverified')),
 checked_at INTEGER, reason TEXT,
 PRIMARY KEY(run_id,remote_id)
);
CREATE INDEX cloud_presence_pending ON cloud_presence_items(run_id,state,remote_id);
