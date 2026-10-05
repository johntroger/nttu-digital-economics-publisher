CREATE TABLE cloud_backups (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  snapshot_json TEXT CHECK(snapshot_json IS NULL OR json_valid(snapshot_json)),
  files_json TEXT CHECK(files_json IS NULL OR json_valid(files_json)),
  next_index INTEGER NOT NULL DEFAULT 0 CHECK(next_index>=0),
  state TEXT NOT NULL DEFAULT 'building' CHECK(state IN ('building','complete')),
  manifest_checksum TEXT,
  completed_at TEXT
);
CREATE TRIGGER backup_identity_immutable BEFORE UPDATE OF id,actor,created_at ON cloud_backups
BEGIN SELECT RAISE(ABORT,'backup identity immutable'); END;
CREATE TRIGGER backup_snapshot_immutable BEFORE UPDATE OF snapshot_json,files_json ON cloud_backups
WHEN OLD.snapshot_json IS NOT NULL
BEGIN SELECT RAISE(ABORT,'backup snapshot immutable'); END;
CREATE TRIGGER backup_complete_immutable BEFORE UPDATE ON cloud_backups
WHEN OLD.state='complete'
BEGIN SELECT RAISE(ABORT,'complete backup immutable'); END;
CREATE TRIGGER backup_preserved BEFORE DELETE ON cloud_backups
BEGIN SELECT RAISE(ABORT,'backup preserved'); END;
CREATE TABLE cloud_backup_checks (
  id TEXT PRIMARY KEY,
  backup_id TEXT NOT NULL REFERENCES cloud_backups(id),
  next_index INTEGER NOT NULL DEFAULT 0 CHECK(next_index>=0),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TRIGGER backup_check_identity_immutable BEFORE UPDATE OF id,backup_id,created_at ON cloud_backup_checks
BEGIN SELECT RAISE(ABORT,'backup check identity immutable'); END;
CREATE TRIGGER backup_check_complete_immutable BEFORE UPDATE ON cloud_backup_checks
WHEN OLD.completed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'complete check immutable'); END;
CREATE TRIGGER backup_check_preserved BEFORE DELETE ON cloud_backup_checks
BEGIN SELECT RAISE(ABORT,'check preserved'); END;
