-- A single staging schedule exception. Cleared on confirmed publication.
ALTER TABLE cloud_daily_config ADD COLUMN test_publish_at TEXT;
