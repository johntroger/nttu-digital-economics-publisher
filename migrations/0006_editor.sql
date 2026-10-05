-- Local editing records. No publisher or automatic readiness transition is introduced.
CREATE TABLE editor_revisions (
  version_id TEXT PRIMARY KEY REFERENCES post_versions(id),
  parent_version_id TEXT REFERENCES post_versions(id),
  restored_from_id TEXT REFERENCES post_versions(id),
  action TEXT NOT NULL CHECK(action IN ('import','save','restore')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE editor_requests (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  result_version_id TEXT NOT NULL REFERENCES post_versions(id)
);
CREATE TABLE editor_imports (
  batch_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL
);
CREATE TABLE editor_render_receipts (
  asset_id TEXT PRIMARY KEY REFERENCES assets(id),
  version_id TEXT NOT NULL REFERENCES post_versions(id),
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  input_checksum TEXT NOT NULL,
  dependency_json TEXT NOT NULL CHECK(json_valid(dependency_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE editor_reviews (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES post_versions(id),
  check_version INTEGER NOT NULL,
  body_snapshot TEXT NOT NULL,
  caption_snapshot TEXT NOT NULL,
  asset_checksum TEXT NOT NULL,
  footer_version TEXT NOT NULL,
  source_note TEXT NOT NULL,
  rubric_json TEXT NOT NULL CHECK(json_valid(rubric_json)),
  reviewer TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE(version_id,check_version)
);
CREATE TRIGGER editor_revision_immutable BEFORE UPDATE ON editor_revisions
BEGIN SELECT RAISE(ABORT,'editor revision is immutable'); END;
CREATE TRIGGER editor_request_immutable BEFORE UPDATE ON editor_requests
BEGIN SELECT RAISE(ABORT,'editor request is immutable'); END;
CREATE TRIGGER editor_review_immutable BEFORE UPDATE ON editor_reviews
BEGIN SELECT RAISE(ABORT,'editor review is immutable'); END;
CREATE TRIGGER editor_render_receipt_immutable BEFORE UPDATE ON editor_render_receipts
BEGIN SELECT RAISE(ABORT,'editor render receipt is immutable'); END;
CREATE TRIGGER editor_version_content_immutable BEFORE UPDATE OF post_id,version,body,caption_title,
  image_headline,image_points,image_description,primary_audience,metadata_json ON post_versions
WHEN EXISTS(SELECT 1 FROM editor_revisions WHERE version_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'save a new editor version'); END;
