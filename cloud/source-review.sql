CREATE TABLE cloud_reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES posts(id),
  version_id TEXT NOT NULL REFERENCES post_versions(id),
  check_version INTEGER NOT NULL,
  asset_checksum TEXT NOT NULL,
  footer_version TEXT NOT NULL,
  source_snapshot TEXT NOT NULL CHECK(json_valid(source_snapshot)),
  body_snapshot TEXT NOT NULL,
  caption_snapshot TEXT NOT NULL,
  rubric_json TEXT NOT NULL CHECK(json_valid(rubric_json)),
  reviewer TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE(version_id,check_version)
);
CREATE TRIGGER cloud_review_immutable BEFORE UPDATE ON cloud_reviews
BEGIN SELECT RAISE(ABORT,'cloud review is immutable'); END;
CREATE TRIGGER cloud_review_preserved BEFORE DELETE ON cloud_reviews
BEGIN SELECT RAISE(ABORT,'cloud review is preserved'); END;
CREATE TABLE cloud_review_requests (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  review_id TEXT NOT NULL REFERENCES cloud_reviews(id)
);
CREATE TRIGGER cloud_review_request_immutable BEFORE UPDATE ON cloud_review_requests
BEGIN SELECT RAISE(ABORT,'cloud review request is immutable'); END;
CREATE TRIGGER cloud_review_request_preserved BEFORE DELETE ON cloud_review_requests
BEGIN SELECT RAISE(ABORT,'cloud review request is preserved'); END;
-- Identity alignment for previously owner-attached library images, not a QA approval.
INSERT INTO asset_bindings(version_id,asset_id,check_version,checksum)
SELECT v.id,v.asset_id,v.check_version,a.checksum FROM post_versions v
JOIN assets a ON a.id=v.asset_id JOIN cloud_library l ON a.id='library-'||l.id
WHERE l.kind='image' AND l.state='complete' AND a.status='complete'
ON CONFLICT(version_id) DO NOTHING;
