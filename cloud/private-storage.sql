CREATE TABLE cloud_library (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('document','logo','image')),
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 180),
  source_key TEXT,
  checksum TEXT NOT NULL CHECK(length(checksum)=64),
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/png','image/jpeg')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=12582912),
  width INTEGER,
  height INTEGER,
  state TEXT NOT NULL CHECK(state IN ('pending','complete')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(kind,checksum)
);
CREATE TRIGGER cloud_library_complete_immutable BEFORE UPDATE ON cloud_library
WHEN OLD.state='complete'
BEGIN SELECT RAISE(ABORT,'complete library metadata is immutable'); END;
CREATE TRIGGER cloud_library_preserved BEFORE DELETE ON cloud_library
BEGIN SELECT RAISE(ABORT,'library files are preserved'); END;
