CREATE TABLE incidents (
  incident_key TEXT PRIMARY KEY,
  environment TEXT NOT NULL REFERENCES application_state(environment),
  page_connection_id TEXT NOT NULL REFERENCES page_connections(id),
  job_id TEXT NOT NULL REFERENCES publish_jobs(id),
  evidence_id TEXT NOT NULL REFERENCES publish_evidence(id),
  code TEXT NOT NULL, opened_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved'))
);
-- Later verified remote timestamps enrich history without rewriting its snapshot.
CREATE TABLE publication_dates (
  publication_id TEXT PRIMARY KEY REFERENCES publications(id),
  evidence_id TEXT NOT NULL REFERENCES publish_evidence(id),
  remote_published_at TEXT NOT NULL,
  business_date TEXT NOT NULL
);
CREATE TRIGGER publication_date_immutable BEFORE UPDATE ON publication_dates
BEGIN SELECT RAISE(ABORT,'publication_date_immutable'); END;
DROP TRIGGER guard_matches_publication;
CREATE TRIGGER guard_matches_publication BEFORE INSERT ON actual_day_guards
WHEN NOT EXISTS (
 SELECT 1 FROM publications p JOIN publish_jobs j ON j.id=p.job_id JOIN page_connections c ON c.id=j.page_connection_id
 LEFT JOIN publication_dates d ON d.publication_id=p.id
 WHERE p.id=NEW.publication_id AND c.id=NEW.page_connection_id AND c.environment='production'
 AND (p.remote_business_date=NEW.business_date OR d.business_date=NEW.business_date)
)
BEGIN SELECT RAISE(ABORT,'guard_matches_publication'); END;
