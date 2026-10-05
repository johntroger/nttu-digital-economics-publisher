-- No credentials or sessions are stored in the exported database.
CREATE TABLE cloud_caption_keys (
  checksum TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE REFERENCES posts(id),
  version_id TEXT NOT NULL REFERENCES post_versions(id)
);
