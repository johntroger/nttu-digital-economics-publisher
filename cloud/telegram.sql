-- Operational transport state is excluded from content backups and never restores access.
CREATE TABLE cloud_telegram_runtime (
  id INTEGER PRIMARY KEY CHECK(id=1),
  active_attempt TEXT,
  next_send_at TEXT
);
INSERT INTO cloud_telegram_runtime(id) VALUES(1);
CREATE TABLE cloud_telegram_attempts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES notification_outbox(event_id),
  target_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('intent','delivered','retry_wait','delivery_unknown','needs_action')),
  finished_at TEXT,
  reason TEXT
);
CREATE INDEX telegram_attempts_event ON cloud_telegram_attempts(event_id,created_at);
CREATE TRIGGER telegram_attempt_identity BEFORE UPDATE OF id,event_id,target_hash,created_at,expires_at ON cloud_telegram_attempts
BEGIN SELECT RAISE(ABORT,'telegram attempt identity immutable'); END;
CREATE TRIGGER telegram_attempt_finished BEFORE UPDATE ON cloud_telegram_attempts
WHEN OLD.state!='intent'
BEGIN SELECT RAISE(ABORT,'telegram attempt finished'); END;
