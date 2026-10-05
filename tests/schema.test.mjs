import test from 'node:test';
import assert from 'node:assert/strict';
import { database, addJob, addPublication } from './helpers/database.mjs';

function scenario(name, run) {
  test(name, () => { const db = database(); try { run(db); } finally { db.close(); } });
}

scenario('all environments begin paused without seeded jobs or remote publications', db => {
  assert.equal(db.prepare('SELECT count(*) AS n FROM application_state WHERE paused_by_user=1').get().n, 3);
  assert.equal(db.prepare('SELECT count(*) AS n FROM publish_jobs').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM publications').get().n, 0);
});
scenario('one page/date cannot receive two slots; another page stays independent', db => {
  assert.throws(() => db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('s2','prod','2026-10-05')"));
  db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('st','trial','2026-10-05')");
  assert.throws(() => db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('bad','prod','2026-02-30')"));
});
scenario('one active candidate per slot; a confirmed failure permits a replacement', db => {
  addJob(db);
  assert.throws(() => addJob(db, { id: 'j2' }));
  db.exec("UPDATE publish_jobs SET state='failed' WHERE id='j1'");
  addJob(db, { id: 'j2' });
});
scenario('slot and page cannot be mixed and trial requests are idempotency-scoped', db => {
  assert.throws(() => addJob(db, { page: 'trial' }), /job_slot_page_mismatch/);
  addJob(db, { page: 'trial', slot: null, request: 'click1' });
  assert.throws(() => addJob(db, { id: 'j2', page: 'trial', slot: null, request: 'click1' }));
  addJob(db, { id: 'j3', page: 'trial', slot: null, request: 'click2' });
});
scenario('job payload is pinned while retry state can change', db => {
  addJob(db);
  assert.throws(() => db.exec("UPDATE publish_jobs SET caption_snapshot='Mới' WHERE id='j1'"), /job_payload_immutable/);
  db.exec("UPDATE publish_jobs SET state='retry_wait',attempt_count=2 WHERE id='j1'");
  assert.throws(() => db.exec("UPDATE publish_jobs SET attempt_count=4 WHERE id='j1'"));
});
scenario('claimed version and page identity cannot be moved underneath a pinned job', db => {
  addJob(db);
  assert.throws(() => db.exec("UPDATE post_versions SET post_id='p2' WHERE id='v1'"), /pinned_version_immutable/);
  assert.throws(() => db.exec("UPDATE post_versions SET body='Đã thay' WHERE id='v1'"), /pinned_version_immutable/);
  db.exec("UPDATE post_versions SET status='quarantined' WHERE id='v1'");
  assert.throws(() => db.exec("UPDATE page_connections SET page_id='different-page' WHERE id='prod'"), /connection_identity_immutable/);
});
scenario('a completed image is immutable but can be blocked for later review', db => {
  db.exec("INSERT INTO assets VALUES ('img','images/1.png','hash','image/png',1080,1080,4096,'complete')");
  assert.throws(() => db.exec("UPDATE assets SET storage_key='images/other.png' WHERE id='img'"), /completed_asset_immutable/);
  db.exec("UPDATE assets SET status='blocked' WHERE id='img'");
  assert.throws(() => db.exec("UPDATE assets SET checksum='other' WHERE id='img'"), /completed_asset_immutable/);
  assert.throws(() => db.exec("UPDATE assets SET status='pending' WHERE id='img'"), /finalized_asset_not_reset/);
  assert.throws(() => db.exec("INSERT INTO assets VALUES ('bad','images/bad.png','hash','image/png',1080,720,4096,'complete')"));
});
scenario('an expired lease cannot clear or replace an uncertain page gate', db => {
  addJob(db);
  db.exec("UPDATE publish_jobs SET state='unknown' WHERE id='j1'");
  db.exec("INSERT INTO page_publish_gates VALUES ('prod','j1',1,'2000-01-01T00:00:00Z')");
  assert.throws(() => db.exec("UPDATE page_publish_gates SET active_job_id=NULL WHERE page_connection_id='prod'"), /uncertain_gate_not_released/);
  db.exec("UPDATE publish_jobs SET state='confirmed' WHERE id='j1'");
  db.exec("UPDATE page_publish_gates SET active_job_id=NULL WHERE page_connection_id='prod'");
});
scenario('gate cannot point to a job on another page', db => {
  addJob(db);
  assert.throws(() => db.exec("INSERT INTO page_publish_gates VALUES ('trial','j1',0,NULL)"), /gate_page_mismatch/);
});
scenario('evidence survives a subsequent finalization transaction rollback', db => {
  addJob(db);
  db.exec("INSERT INTO attempts VALUES ('a1','j1',1,'2026-10-05T03:00:00Z','confirmed')");
  db.exec(`INSERT INTO publish_evidence(id,attempt_id,event_key,outcome,remote_id,observed_at,normalized_json)
    VALUES ('e1','a1','event1','confirmed','remote1','2026-10-05T03:00:00Z','{}')`);
  db.exec('BEGIN');
  try {
    addPublication(db);
    db.exec("INSERT INTO production_post_usage VALUES ('trial','p1','pub1','2026-10-05T03:00:00Z')");
    assert.fail('invalid usage should abort');
  } catch (error) {
    assert.match(error.message, /usage_matches_publication/);
    db.exec('ROLLBACK');
  }
  assert.equal(db.prepare('SELECT state FROM publish_evidence WHERE id=?').get('e1').state, 'pending');
  assert.equal(db.prepare('SELECT count(*) AS n FROM publications').get().n, 0);
  assert.throws(() => db.exec("UPDATE publish_evidence SET remote_id='other' WHERE id='e1'"), /evidence_payload_immutable/);
});
scenario('new version does not reset production usage; trial does not consume usage', db => {
  addJob(db);
  addPublication(db);
  db.exec("INSERT INTO production_post_usage VALUES ('prod','p1','pub1','2026-10-05T03:00:00Z')");
  assert.throws(() => db.exec("INSERT INTO production_post_usage VALUES ('prod','p1','pub1','2026-10-06T03:00:00Z')"));
  addJob(db, { id: 'jt', page: 'trial', slot: null, request: 'trial1', version: 'v2' });
  addPublication(db, { id: 'pt', job: 'jt', remote: 'trial-remote' });
  assert.throws(() => db.exec("INSERT INTO production_post_usage VALUES ('trial','p1','pt','2026-10-05T03:00:00Z')"), /usage_matches_publication/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM production_post_usage').get().n, 1);
});
scenario('two actual remote IDs stay recorded even when the daily guard conflicts', db => {
  addJob(db);
  addPublication(db);
  db.exec("INSERT INTO actual_day_guards VALUES ('prod','2026-10-05','pub1')");
  addPublication(db, { id: 'pub2', remote: 'remote2' });
  assert.throws(() => db.exec("INSERT INTO actual_day_guards VALUES ('prod','2026-10-05','pub2')"));
  assert.equal(db.prepare('SELECT count(*) AS n FROM publications').get().n, 2);
  assert.throws(() => db.exec("UPDATE publications SET caption_snapshot='Edited' WHERE id='pub1'"), /publication_immutable/);
});
scenario('outbox cannot invent successful delivery and keeps event identity unique', db => {
  db.exec("INSERT INTO notification_outbox(event_id,payload_json) VALUES ('event1','{}')");
  assert.throws(() => db.exec("UPDATE notification_outbox SET state='delivered' WHERE event_id='event1'"));
  assert.throws(() => db.exec("UPDATE notification_outbox SET state='delivered',message_id='' WHERE event_id='event1'"));
  db.exec("UPDATE notification_outbox SET state='delivery_unknown' WHERE event_id='event1'");
  db.exec("UPDATE notification_outbox SET state='delivered',message_id='42' WHERE event_id='event1'");
  assert.throws(() => db.exec("INSERT INTO notification_outbox(event_id,payload_json) VALUES ('event1','{}')"));
});
