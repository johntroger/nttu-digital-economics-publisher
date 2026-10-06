-- One owner-approved P01 publication on the test Page; never enables a daily slot.
CREATE TABLE cloud_content_trial (
 id INTEGER PRIMARY KEY CHECK(id=1), request_id TEXT NOT NULL UNIQUE,
 version_id TEXT NOT NULL REFERENCES post_versions(id), check_version INTEGER NOT NULL,
 config_hash TEXT NOT NULL, caption TEXT NOT NULL, title TEXT NOT NULL,
 file_id TEXT NOT NULL REFERENCES cloud_library(id), checksum TEXT NOT NULL,
 prepared_at INTEGER NOT NULL, actor TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('prepared','intent','unknown','rejected','published')),
 sent_at INTEGER, remote_id TEXT, photo_id TEXT, confirmed_at INTEGER,
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json))
);
CREATE TRIGGER content_trial_snapshot BEFORE UPDATE ON cloud_content_trial
WHEN NEW.request_id!=OLD.request_id OR NEW.version_id!=OLD.version_id OR NEW.check_version!=OLD.check_version
 OR NEW.config_hash!=OLD.config_hash OR NEW.caption!=OLD.caption OR NEW.title!=OLD.title
 OR NEW.file_id!=OLD.file_id OR NEW.checksum!=OLD.checksum
 OR NEW.prepared_at!=OLD.prepared_at OR NEW.actor!=OLD.actor
BEGIN SELECT RAISE(ABORT,'CONTENT_TRIAL_IMMUTABLE'); END;
CREATE TRIGGER content_trial_state BEFORE UPDATE ON cloud_content_trial
WHEN NOT ((OLD.state='prepared' AND NEW.state='intent') OR
 (OLD.state IN ('intent','unknown') AND NEW.state IN ('unknown','rejected','published')))
BEGIN SELECT RAISE(ABORT,'CONTENT_TRIAL_STATE_INVALID'); END;
CREATE TRIGGER content_trial_no_delete BEFORE DELETE ON cloud_content_trial
BEGIN SELECT RAISE(ABORT,'CONTENT_TRIAL_DELETE_FORBIDDEN'); END;
