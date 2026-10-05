import { transactionStore } from '../../scripts/transaction-store.mjs';
import { claimJob, recordIntent } from '../../src/storage/claims.ts';
export const NOW='2026-10-05T03:00:00Z';
export function seedReady(db,{ post='p1', version='v1', asset='image' }={}) {
  if (!db.prepare('SELECT id FROM post_versions WHERE id=?').get(version)) db.prepare(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_description,primary_audience)
    VALUES (?,?,1,?,'Tiêu đề','Ảnh','Mô tả','student')`).run(version,post,`Fixture nội dung ${post}`);
  db.prepare("INSERT INTO content_entries VALUES (?,?,'data',?,1,'caption')").run(post,version,`angle-${post}`);
  db.exec(`INSERT INTO sources(id,title,revision,locator,authority,status,reviewed_at)
    VALUES ('source','Fixture only','fixture-hash','fixture.invalid','document','verified','2026-10-04T00:00:00Z') ON CONFLICT DO NOTHING`);
  db.prepare("INSERT INTO version_sources VALUES (?,'source','fixture page 1')").run(version);
  db.prepare("INSERT INTO assets VALUES (?,?,?,'image/png',1080,1080,2000,'complete')").run(asset,`${asset}.png`,`${asset}-fixture-hash`);
  db.prepare("UPDATE post_versions SET asset_id=?,status='ready',metadata_json=? WHERE id=?").run(asset,JSON.stringify({ angle:`angle-${post}` }),version);
  db.prepare('INSERT INTO asset_bindings SELECT id,asset_id,check_version,? FROM post_versions WHERE id=?').run(`${asset}-fixture-hash`,version);
  db.prepare(`INSERT INTO content_checks SELECT ?,id,check_version,?,'footer-v2','test fixture','2026-10-04T01:00:00Z',1,1,1,1,1,1 FROM post_versions WHERE id=?`).run(`check-${version}`,`${asset}-fixture-hash`,version);
  db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment IN ('production','staging')");
}
export function claimInput(overrides={}) {
  return { id:'j1',page:'prod',postId:'p1',expectedVersion:'v1',slotId:'s1',requestId:null,token:'owner-one',actor:'fixture-runner',now:NOW,...overrides };
}
export function owner(overrides={}) { return { jobId:'j1',token:'owner-one',generation:1,actor:'fixture-runner',now:NOW,...overrides }; }
export function claimed(db) { return claimJob(transactionStore(db),claimInput()); }
export function intended(db) { claimed(db); return recordIntent(transactionStore(db),{...owner(),attemptId:'a1'}); }
export function verifiedRetryFixture(db,ordinal=1) {
  db.prepare("UPDATE attempts SET outcome='verified_failed_retryable' WHERE job_id='j1' AND ordinal=?").run(ordinal);
  db.exec("UPDATE publish_jobs SET state='retry_wait',next_attempt_at='2026-10-05T03:05:00Z' WHERE id='j1'; UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id='prod'");
}

