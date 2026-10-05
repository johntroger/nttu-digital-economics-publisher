-- Content review is separate from publication. Newly imported briefs remain drafts.
CREATE TABLE content_entries (
  post_id TEXT PRIMARY KEY REFERENCES posts(id),
  active_version_id TEXT NOT NULL REFERENCES post_versions(id),
  concept TEXT NOT NULL,
  angle TEXT NOT NULL,
  stable_order INTEGER NOT NULL CHECK(stable_order >= 0),
  stage TEXT NOT NULL DEFAULT 'brief' CHECK(stage IN ('brief','caption'))
);
CREATE TABLE content_imports (
  batch_id TEXT PRIMARY KEY, checksum TEXT NOT NULL, imported_at TEXT NOT NULL
);
CREATE TRIGGER entry_version_insert BEFORE INSERT ON content_entries
WHEN NOT EXISTS(SELECT 1 FROM post_versions WHERE id=NEW.active_version_id AND post_id=NEW.post_id)
BEGIN SELECT RAISE(ABORT,'active version belongs to another post'); END;
CREATE TRIGGER entry_version_update BEFORE UPDATE ON content_entries
WHEN NOT EXISTS(SELECT 1 FROM post_versions WHERE id=NEW.active_version_id AND post_id=NEW.post_id)
BEGIN SELECT RAISE(ABORT,'active version belongs to another post'); END;
CREATE TABLE sources (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, revision TEXT NOT NULL,
  locator TEXT NOT NULL, authority TEXT NOT NULL CHECK(authority IN ('document','user_confirmation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','blocked')),
  reviewed_at TEXT, review_due_at TEXT,
  CHECK(status != 'verified' OR reviewed_at IS NOT NULL)
);
CREATE TABLE facts (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
  fact_key TEXT NOT NULL, value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  cohort INTEGER, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','blocked')),
  review_due_at TEXT
);
CREATE TABLE version_sources (
  version_id TEXT NOT NULL REFERENCES post_versions(id), source_id TEXT NOT NULL REFERENCES sources(id),
  location TEXT NOT NULL, PRIMARY KEY(version_id,source_id)
);
CREATE TABLE version_facts (
  version_id TEXT NOT NULL REFERENCES post_versions(id), fact_id TEXT NOT NULL REFERENCES facts(id),
  PRIMARY KEY(version_id,fact_id)
);
CREATE TABLE post_prerequisites (
  post_id TEXT NOT NULL REFERENCES posts(id), prerequisite_id TEXT NOT NULL REFERENCES posts(id),
  PRIMARY KEY(post_id,prerequisite_id), CHECK(post_id != prerequisite_id)
);
CREATE TABLE asset_bindings (
  version_id TEXT PRIMARY KEY REFERENCES post_versions(id), asset_id TEXT NOT NULL REFERENCES assets(id),
  check_version INTEGER NOT NULL CHECK(check_version >= 0), checksum TEXT NOT NULL
);
CREATE TABLE content_checks (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES post_versions(id),
  check_version INTEGER NOT NULL CHECK(check_version >= 0), asset_checksum TEXT NOT NULL,
  footer_version TEXT NOT NULL, reviewer TEXT NOT NULL CHECK(length(trim(reviewer)) > 0),
  checked_at TEXT NOT NULL,
  accuracy INTEGER NOT NULL CHECK(accuracy IN (0,1)), usefulness INTEGER NOT NULL CHECK(usefulness IN (0,1)),
  clarity INTEGER NOT NULL CHECK(clarity IN (0,1)), originality INTEGER NOT NULL CHECK(originality IN (0,1)),
  visual_quality INTEGER NOT NULL CHECK(visual_quality IN (0,1)), mandatory_pass INTEGER NOT NULL CHECK(mandatory_pass IN (0,1)),
  UNIQUE(version_id,check_version)
);
CREATE TRIGGER checks_immutable BEFORE UPDATE ON content_checks
BEGIN SELECT RAISE(ABORT,'review record is immutable'); END;
CREATE TRIGGER source_revision_immutable BEFORE UPDATE OF title,revision,locator,authority ON sources
BEGIN SELECT RAISE(ABORT,'create a new source revision'); END;
CREATE TRIGGER fact_revision_immutable BEFORE UPDATE OF source_id,fact_key,value_json,cohort ON facts
BEGIN SELECT RAISE(ABORT,'create a new fact revision'); END;
-- Every edit invalidates prior QA and rendered-image alignment.
CREATE TRIGGER content_edit_revision AFTER UPDATE OF body,caption_title,image_headline,image_points,
  image_description,primary_audience,metadata_json,asset_id ON post_versions
BEGIN UPDATE post_versions SET check_version=OLD.check_version+1 WHERE id=NEW.id; END;
CREATE TRIGGER source_ref_insert AFTER INSERT ON version_sources
BEGIN UPDATE post_versions SET check_version=check_version+1 WHERE id=NEW.version_id; END;
CREATE TRIGGER source_ref_delete AFTER DELETE ON version_sources
BEGIN UPDATE post_versions SET check_version=check_version+1 WHERE id=OLD.version_id; END;
CREATE TRIGGER source_ref_update AFTER UPDATE ON version_sources
BEGIN
  UPDATE post_versions SET check_version=check_version+1 WHERE id=OLD.version_id;
  UPDATE post_versions SET check_version=check_version+1 WHERE id=NEW.version_id AND id != OLD.version_id;
END;
CREATE TRIGGER fact_ref_insert AFTER INSERT ON version_facts
BEGIN UPDATE post_versions SET check_version=check_version+1 WHERE id=NEW.version_id; END;
CREATE TRIGGER fact_ref_delete AFTER DELETE ON version_facts
BEGIN UPDATE post_versions SET check_version=check_version+1 WHERE id=OLD.version_id; END;
CREATE TRIGGER fact_ref_update AFTER UPDATE ON version_facts
BEGIN
  UPDATE post_versions SET check_version=check_version+1 WHERE id=OLD.version_id;
  UPDATE post_versions SET check_version=check_version+1 WHERE id=NEW.version_id AND id != OLD.version_id;
END;
CREATE TRIGGER entry_edit_revision AFTER UPDATE OF concept,angle,stage ON content_entries
BEGIN UPDATE post_versions SET check_version=check_version+1 WHERE id=NEW.active_version_id; END;
CREATE TRIGGER version_sources_pinned_insert BEFORE INSERT ON version_sources
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=NEW.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
CREATE TRIGGER version_sources_pinned_update BEFORE UPDATE ON version_sources
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=OLD.version_id) OR EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=NEW.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
CREATE TRIGGER version_sources_pinned_delete BEFORE DELETE ON version_sources
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=OLD.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
CREATE TRIGGER version_facts_pinned_insert BEFORE INSERT ON version_facts
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=NEW.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
CREATE TRIGGER version_facts_pinned_update BEFORE UPDATE ON version_facts
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=OLD.version_id) OR EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=NEW.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
CREATE TRIGGER version_facts_pinned_delete BEFORE DELETE ON version_facts
WHEN EXISTS(SELECT 1 FROM publish_jobs WHERE post_version_id=OLD.version_id)
BEGIN SELECT RAISE(ABORT,'pinned version references are immutable'); END;
