ALTER TABLE application_state ADD COLUMN maintenance_generation INTEGER NOT NULL DEFAULT 0 CHECK(maintenance_generation >= 0);
CREATE TABLE job_claims (
  job_id TEXT PRIMARY KEY REFERENCES publish_jobs(id),
  check_version INTEGER NOT NULL CHECK(check_version >= 0),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  asset_key TEXT NOT NULL,
  asset_size INTEGER NOT NULL CHECK(asset_size > 0),
  operation_generation INTEGER NOT NULL CHECK(operation_generation >= 0),
  created_at TEXT NOT NULL
);
CREATE TRIGGER claim_snapshot_immutable BEFORE UPDATE OF job_id,check_version,asset_id,asset_key,asset_size,created_at ON job_claims
BEGIN SELECT RAISE(ABORT,'claim_snapshot_immutable'); END;
CREATE TABLE operation_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  environment TEXT NOT NULL REFERENCES application_state(environment),
  job_id TEXT REFERENCES publish_jobs(id),
  action TEXT NOT NULL, actor TEXT NOT NULL, occurred_at TEXT NOT NULL,
  previous_state TEXT, new_state TEXT, reason TEXT NOT NULL
);
CREATE TRIGGER operation_events_immutable BEFORE UPDATE ON operation_events
BEGIN SELECT RAISE(ABORT,'operation_events_immutable'); END;
CREATE TRIGGER environment_barrier_generation AFTER UPDATE OF paused_by_user,blocked_reasons,maintenance_owner ON application_state
WHEN NEW.paused_by_user != OLD.paused_by_user OR NEW.blocked_reasons != OLD.blocked_reasons
  OR NEW.maintenance_owner IS NOT OLD.maintenance_owner
BEGIN UPDATE application_state SET operation_generation=OLD.operation_generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER attempt_intent_immutable BEFORE UPDATE OF id,job_id,ordinal,intent_at ON attempts
BEGIN SELECT RAISE(ABORT,'attempt_intent_immutable'); END;
