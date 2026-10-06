-- Operational diagnostics only; credentials remain Worker Secrets.
CREATE TABLE cloud_meta_checks (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE,
 config_hash TEXT NOT NULL, actor TEXT NOT NULL,
 checked_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('verified_read_only','needs_action','unavailable')),
 reason TEXT NOT NULL, page_id TEXT, page_name TEXT,
 scopes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(scopes_json)),
 expires_at INTEGER, data_access_expires_at INTEGER
);
CREATE TRIGGER cloud_meta_check_immutable BEFORE UPDATE ON cloud_meta_checks
 BEGIN SELECT RAISE(ABORT,'immutable Meta diagnostic'); END;
