-- Core schema only. Claim/intent/finalization SQL is an approval-gated next step.
-- D1 enforces foreign keys; the local test harness enables them explicitly.
CREATE TABLE application_state (
  environment TEXT PRIMARY KEY CHECK (environment IN ('local','staging','production')),
  paused_by_user INTEGER NOT NULL DEFAULT 1 CHECK (paused_by_user IN (0,1)),
  operation_generation INTEGER NOT NULL DEFAULT 0 CHECK (operation_generation >= 0),
  maintenance_owner TEXT,
  blocked_reasons TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(blocked_reasons)),
  last_run_at TEXT,
  last_progress_at TEXT
);
INSERT INTO application_state(environment) VALUES ('local'), ('staging'), ('production');

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  content_key TEXT NOT NULL,
  topic_group TEXT NOT NULL CHECK (topic_group IN ('D','A','B','S','R','I')),
  pool TEXT NOT NULL CHECK (pool IN ('scheduled','reserve')),
  created_at TEXT NOT NULL,
  UNIQUE(batch_id, content_key)
);
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'image/png'),
  width INTEGER NOT NULL CHECK (width = 1080),
  height INTEGER NOT NULL CHECK (height = 1080),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  status TEXT NOT NULL CHECK (status IN ('pending','complete','blocked'))
);
CREATE TABLE post_versions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  caption_title TEXT NOT NULL,
  image_headline TEXT NOT NULL,
  image_points TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(image_points)),
  image_description TEXT NOT NULL,
  primary_audience TEXT NOT NULL CHECK (primary_audience IN ('student','prospective_student')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  asset_id TEXT REFERENCES assets(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','needs_review','ready','quarantined')),
  review_due_at TEXT,
  check_version INTEGER NOT NULL DEFAULT 0 CHECK (check_version >= 0),
  UNIQUE(post_id, version)
);
CREATE TABLE page_connections (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL REFERENCES application_state(environment),
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  UNIQUE(environment, page_id)
);
CREATE TABLE schedule_slots (
  id TEXT PRIMARY KEY,
  page_connection_id TEXT NOT NULL REFERENCES page_connections(id),
  business_date TEXT NOT NULL CHECK (
    business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(business_date) IS NOT NULL AND date(business_date) = business_date
  ),
  planned_post_id TEXT REFERENCES posts(id),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned','held','requested','confirmed','skipped','expired','unknown','replaced_by_late_publication')
  ),
  UNIQUE(page_connection_id, business_date)
);
CREATE TABLE publish_jobs (
  id TEXT PRIMARY KEY,
  page_connection_id TEXT NOT NULL REFERENCES page_connections(id),
  slot_id TEXT REFERENCES schedule_slots(id),
  request_id TEXT,
  post_version_id TEXT NOT NULL REFERENCES post_versions(id),
  caption_snapshot TEXT NOT NULL,
  asset_checksum TEXT NOT NULL,
  footer_version TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'held' CHECK (
    state IN ('held','publish_requested','evidence_pending','retry_wait','unknown','confirmed','failed','cancelled','quarantined')
  ),
  owner_token TEXT,
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  lease_until TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at TEXT,
  CHECK ((slot_id IS NOT NULL AND request_id IS NULL) OR (slot_id IS NULL AND request_id IS NOT NULL)),
  UNIQUE(page_connection_id, request_id)
);
CREATE UNIQUE INDEX one_active_job_per_slot ON publish_jobs(slot_id)
  WHERE slot_id IS NOT NULL AND state IN ('held','publish_requested','evidence_pending','retry_wait','unknown');
CREATE INDEX jobs_due ON publish_jobs(state, next_attempt_at);
CREATE TRIGGER pinned_version_immutable BEFORE UPDATE OF
  post_id, version, body, caption_title, image_headline, image_points, image_description,
  primary_audience, metadata_json, asset_id ON post_versions
WHEN EXISTS (SELECT 1 FROM publish_jobs WHERE post_version_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'pinned_version_immutable'); END;
CREATE TRIGGER connection_identity_immutable BEFORE UPDATE OF environment, page_id ON page_connections
BEGIN SELECT RAISE(ABORT, 'connection_identity_immutable'); END;
CREATE TRIGGER completed_asset_immutable BEFORE UPDATE OF
  storage_key, checksum, content_type, width, height, size_bytes ON assets
WHEN OLD.status IN ('complete','blocked')
BEGIN SELECT RAISE(ABORT, 'completed_asset_immutable'); END;
CREATE TRIGGER finalized_asset_not_reset BEFORE UPDATE OF status ON assets
WHEN OLD.status IN ('complete','blocked') AND NEW.status = 'pending'
BEGIN SELECT RAISE(ABORT, 'finalized_asset_not_reset'); END;
CREATE TRIGGER job_slot_page_insert BEFORE INSERT ON publish_jobs
WHEN NEW.slot_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM schedule_slots WHERE id = NEW.slot_id AND page_connection_id = NEW.page_connection_id
)
BEGIN SELECT RAISE(ABORT, 'job_slot_page_mismatch'); END;
CREATE TRIGGER job_payload_immutable BEFORE UPDATE OF
  page_connection_id, slot_id, request_id, post_version_id, caption_snapshot, asset_checksum, footer_version ON publish_jobs
BEGIN SELECT RAISE(ABORT, 'job_payload_immutable'); END;

CREATE TABLE page_publish_gates (
  page_connection_id TEXT PRIMARY KEY REFERENCES page_connections(id),
  active_job_id TEXT REFERENCES publish_jobs(id),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  lease_until TEXT
);
CREATE TRIGGER gate_page_insert BEFORE INSERT ON page_publish_gates
WHEN NEW.active_job_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM publish_jobs WHERE id = NEW.active_job_id AND page_connection_id = NEW.page_connection_id
)
BEGIN SELECT RAISE(ABORT, 'gate_page_mismatch'); END;
CREATE TRIGGER gate_page_update BEFORE UPDATE ON page_publish_gates
WHEN NEW.active_job_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM publish_jobs WHERE id = NEW.active_job_id AND page_connection_id = NEW.page_connection_id
)
BEGIN SELECT RAISE(ABORT, 'gate_page_mismatch'); END;
CREATE TRIGGER uncertain_gate_not_released BEFORE UPDATE OF active_job_id ON page_publish_gates
WHEN OLD.active_job_id IS NOT NULL AND NEW.active_job_id IS NOT OLD.active_job_id AND EXISTS (
  SELECT 1 FROM publish_jobs WHERE id = OLD.active_job_id AND state IN ('publish_requested','evidence_pending','unknown')
)
BEGIN SELECT RAISE(ABORT, 'uncertain_gate_not_released'); END;

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES publish_jobs(id),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
  intent_at TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('confirmed','verified_failed_retryable','verified_failed_final','unknown')),
  UNIQUE(job_id, ordinal)
);
CREATE TABLE publish_evidence (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  event_key TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('confirmed','verified_failed_retryable','verified_failed_final','unknown')),
  remote_id TEXT,
  observed_at TEXT NOT NULL,
  normalized_json TEXT NOT NULL CHECK (json_valid(normalized_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','applied','conflict')),
  next_at TEXT,
  last_error TEXT,
  CHECK (outcome <> 'confirmed' OR (remote_id IS NOT NULL AND length(trim(remote_id)) > 0))
);
CREATE INDEX evidence_pending ON publish_evidence(state, next_at);
CREATE TRIGGER evidence_payload_immutable BEFORE UPDATE OF
  attempt_id, event_key, outcome, remote_id, observed_at, normalized_json ON publish_evidence
BEGIN SELECT RAISE(ABORT, 'evidence_payload_immutable'); END;

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES publish_jobs(id),
  remote_id TEXT NOT NULL CHECK (length(trim(remote_id)) > 0),
  remote_link TEXT NOT NULL,
  caption_snapshot TEXT NOT NULL,
  asset_checksum TEXT NOT NULL,
  footer_version TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  remote_published_at TEXT,
  remote_business_date TEXT,
  UNIQUE(job_id, remote_id)
);
CREATE TRIGGER remote_id_per_page BEFORE INSERT ON publications
WHEN EXISTS (
  SELECT 1 FROM publications p JOIN publish_jobs old_job ON old_job.id = p.job_id
  JOIN publish_jobs new_job ON new_job.id = NEW.job_id
  WHERE old_job.page_connection_id = new_job.page_connection_id AND p.remote_id = NEW.remote_id
)
BEGIN SELECT RAISE(ABORT, 'remote_id_per_page'); END;
CREATE TRIGGER publication_immutable BEFORE UPDATE ON publications
BEGIN SELECT RAISE(ABORT, 'publication_immutable'); END;

CREATE TABLE production_post_usage (
  page_connection_id TEXT NOT NULL REFERENCES page_connections(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  first_publication_id TEXT NOT NULL REFERENCES publications(id),
  used_at TEXT NOT NULL,
  PRIMARY KEY(page_connection_id, post_id)
);
CREATE TRIGGER usage_matches_publication BEFORE INSERT ON production_post_usage
WHEN NOT EXISTS (
  SELECT 1 FROM publications p JOIN publish_jobs j ON j.id = p.job_id
  JOIN post_versions v ON v.id = j.post_version_id
  JOIN page_connections c ON c.id = j.page_connection_id
  WHERE p.id = NEW.first_publication_id AND c.id = NEW.page_connection_id
    AND v.post_id = NEW.post_id AND c.environment = 'production'
)
BEGIN SELECT RAISE(ABORT, 'usage_matches_publication'); END;

CREATE TABLE actual_day_guards (
  page_connection_id TEXT NOT NULL REFERENCES page_connections(id),
  business_date TEXT NOT NULL,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  PRIMARY KEY(page_connection_id, business_date)
);
CREATE TRIGGER guard_matches_publication BEFORE INSERT ON actual_day_guards
WHEN NOT EXISTS (
  SELECT 1 FROM publications p JOIN publish_jobs j ON j.id = p.job_id
  JOIN page_connections c ON c.id = j.page_connection_id
  WHERE p.id = NEW.publication_id AND c.id = NEW.page_connection_id
    AND c.environment = 'production' AND p.remote_business_date = NEW.business_date
)
BEGIN SELECT RAISE(ABORT, 'guard_matches_publication'); END;

CREATE TABLE notification_outbox (
  event_id TEXT PRIMARY KEY,
  publication_id TEXT REFERENCES publications(id),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','retry_wait','delivery_unknown','delivered','needs_action','quarantined')),
  tries INTEGER NOT NULL DEFAULT 0 CHECK (tries >= 0),
  next_at TEXT,
  message_id TEXT,
  last_error TEXT,
  CHECK (state <> 'delivered' OR (message_id IS NOT NULL AND length(trim(message_id)) > 0))
);
CREATE INDEX outbox_due ON notification_outbox(state, next_at);
