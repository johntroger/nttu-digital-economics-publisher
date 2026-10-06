-- Operational trial receipts: deliberately separate from daily publishing and business restore.
CREATE TABLE cloud_meta_trial (
 id INTEGER PRIMARY KEY CHECK(id=1),
 request_id TEXT NOT NULL UNIQUE,
 config_hash TEXT NOT NULL,
 page_id TEXT NOT NULL,
 caption TEXT NOT NULL,
 file_id TEXT NOT NULL REFERENCES cloud_library(id),
 image_checksum TEXT NOT NULL,
 prepared_at INTEGER NOT NULL,
 actor TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('prepared','intent','unknown','rejected','published')),
 sent_at INTEGER,
 remote_id TEXT,
 photo_id TEXT,
 confirmed_at INTEGER,
 reason TEXT
);
CREATE TRIGGER cloud_meta_trial_snapshot BEFORE UPDATE ON cloud_meta_trial
WHEN NEW.request_id!=OLD.request_id OR NEW.config_hash!=OLD.config_hash OR NEW.page_id!=OLD.page_id
 OR NEW.caption!=OLD.caption OR NEW.file_id!=OLD.file_id OR NEW.image_checksum!=OLD.image_checksum
 OR NEW.prepared_at!=OLD.prepared_at OR NEW.actor!=OLD.actor
BEGIN SELECT RAISE(ABORT,'TRIAL_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER cloud_meta_trial_state BEFORE UPDATE ON cloud_meta_trial
WHEN NOT ((OLD.state='prepared' AND NEW.state='intent') OR
 (OLD.state IN ('intent','unknown') AND NEW.state IN ('unknown','rejected','published')))
BEGIN SELECT RAISE(ABORT,'TRIAL_STATE_INVALID'); END;
CREATE TRIGGER cloud_meta_trial_no_delete BEFORE DELETE ON cloud_meta_trial
BEGIN SELECT RAISE(ABORT,'TRIAL_DELETE_FORBIDDEN'); END;
