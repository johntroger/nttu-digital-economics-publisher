import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../scripts/catalog-store.mjs';

export function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  db.exec(`
    INSERT INTO posts VALUES ('p1','batch1','P01','D','scheduled','2026-10-05T00:00:00Z');
    INSERT INTO posts VALUES ('p2','batch1','P02','A','reserve','2026-10-05T00:00:00Z');
    INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_description,primary_audience)
      VALUES ('v1','p1',1,'Nội dung một','Tiêu đề','Ảnh','Mô tả','student'),
             ('v2','p1',2,'Nội dung sửa','Tiêu đề','Ảnh','Mô tả','student');
    INSERT INTO page_connections VALUES ('prod','production','official-fixture','Fixture production');
    INSERT INTO page_connections VALUES ('trial','staging','trial-fixture','Fixture trial');
    INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('s1','prod','2026-10-05');
  `);
  return db;
}

export function addJob(db, { id = 'j1', page = 'prod', slot = 's1', request = null, version = 'v1' } = {}) {
  db.prepare(`INSERT INTO publish_jobs(id,page_connection_id,slot_id,request_id,post_version_id,
    caption_snapshot,asset_checksum,footer_version) VALUES (?,?,?,?,?,'Snapshot gốc','hash1','footer1')`)
    .run(id, page, slot, request, version);
}

export function addPublication(db, { id = 'pub1', job = 'j1', remote = 'remote1' } = {}) {
  db.prepare(`INSERT INTO publications(id,job_id,remote_id,remote_link,caption_snapshot,asset_checksum,
    footer_version,confirmed_at,remote_business_date) VALUES (?,?,?,'https://example.invalid/post',
    'Snapshot gốc','hash1','footer1','2026-10-05T03:00:00Z','2026-10-05')`).run(id, job, remote);
}
