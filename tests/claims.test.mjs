import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { database, addPublication } from './helpers/database.mjs';
import { openCatalog } from '../scripts/catalog-store.mjs';
import { transactionStore } from '../scripts/transaction-store.mjs';
import { claimJob, recordIntent, takeOwnership, cancelUnsent, markExpiredIntentUnknown, setPaused, beginMaintenance, finishMaintenance } from '../src/storage/claims.ts';
import { composeCaption } from '../src/domain/footer.ts';
import { seedReady, claimInput, owner, claimed, intended, verifiedRetryFixture, NOW } from './helpers/claims-fixture.mjs';
function scenario(name,run) { test(name,()=>{ const db=database(); try { seedReady(db); run(db,transactionStore(db)); } finally { db.close(); } }); }
const code = (run,expected) => assert.throws(run,error => error.code===expected);
const count=(db,table)=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
scenario('claim atomically pins caption/image/footer and reserves slot/page without attempt', (db,tx)=>{
  const result=claimed(db); assert.equal(result.generation,1);
  const j=db.prepare("SELECT * FROM publish_jobs WHERE id='j1'").get();
  assert.equal(j.caption_snapshot,composeCaption('Nội dung một')); assert.equal(j.state,'held');
  assert.equal(j.asset_checksum,'image-fixture-hash'); assert.equal(j.footer_version,'footer-v2');
  assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'held');
  assert.equal(db.prepare("SELECT active_job_id FROM page_publish_gates WHERE page_connection_id='prod'").get().active_job_id,'j1');
  assert.equal(count(db,'attempts'),0); assert.equal(count(db,'operation_events'),1);
  code(()=>claimJob(tx,claimInput()),'CLAIM_ALREADY_EXISTS');
});
scenario('failed eligibility or stale expected version leaves no job/slot/gate/audit side effects', (db,tx)=>{
  code(()=>claimJob(tx,claimInput({expectedVersion:'v2'})),'ACTIVE_VERSION_CHANGED');
  db.exec("UPDATE sources SET status='blocked' WHERE id='source'");
  code(()=>claimed(db),'CONTENT_INELIGIBLE');
  for(const table of ['publish_jobs','job_claims','page_publish_gates','operation_events']) assert.equal(count(db,table),0);
  assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'planned');
});
scenario('pause, blocks and malformed barrier fail closed at claim', (db,tx)=>{
  setPaused(tx,{environment:'production',paused:true,actor:'owner',now:NOW}); code(()=>claimed(db),'PAUSED');
  setPaused(tx,{environment:'production',paused:false,actor:'owner',now:NOW});
  db.exec("UPDATE application_state SET blocked_reasons='[\"connection_fault\"]' WHERE environment='production'"); code(()=>claimed(db),'ENVIRONMENT_BLOCKED');
  db.exec("UPDATE application_state SET blocked_reasons='{}' WHERE environment='production'"); code(()=>claimed(db),'INVALID_BARRIER');
  assert.equal(count(db,'publish_jobs'),0);
});
scenario('production requires today due slot; trial requires distinct request', (db,tx)=>{
  code(()=>claimJob(tx,claimInput({now:'2026-10-05T02:59:59Z'})),'NOT_DUE');
  code(()=>claimJob(tx,claimInput({now:'2026-10-06T03:00:00Z'})),'SLOT_DATE_MISMATCH');
  code(()=>claimJob(tx,claimInput({slotId:null,requestId:'production-click'})),'PRODUCTION_REQUIRES_SLOT');
  code(()=>claimJob(tx,claimInput({page:'trial'})),'TRIAL_REQUIRES_REQUEST');
  code(()=>claimJob(tx,claimInput({slotId:null,requestId:null})),'INVALID_TARGET');
  code(()=>claimJob(tx,claimInput({now:'2026-02-30T03:00:00Z'})),'INVALID_TIME');
});
scenario('actual production day guard blocks intent even if slot still appears held', (db,tx)=>{
  claimed(db); addPublication(db);
  db.exec("INSERT INTO actual_day_guards VALUES ('prod','2026-10-05','pub1')");
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'DAY_ALREADY_PUBLISHED');
  assert.equal(count(db,'attempts'),0);
});
scenario('after midnight an unsent held job cannot publish a previous-day slot', (db,tx)=>{
  claimed(db);
  code(()=>takeOwnership(tx,{jobId:'j1',token:'next-owner',actor:'runner',now:'2026-10-05T17:00:00Z'}),'SLOT_DATE_MISMATCH');
  assert.equal(count(db,'attempts'),0);
});
scenario('two trial requests cannot reserve the same page concurrently; failed claim has no writes', (db,tx)=>{
  claimJob(tx,claimInput({page:'trial',slotId:null,requestId:'r1'}));
  code(()=>claimJob(tx,claimInput({id:'j2',page:'trial',slotId:null,requestId:'r2'})),'PAGE_BUSY');
  assert.equal(count(db,'publish_jobs'),1); assert.equal(count(db,'job_claims'),1);
});
scenario('intent records attempt once, snapshot is unchanged and replay never returns a second permit', (db,tx)=>{
  const permit=intended(db); assert.equal(permit.attemptId,'a1'); assert.equal(permit.assetKey,'image.png');
  assert.equal(db.prepare("SELECT state FROM publish_jobs WHERE id='j1'").get().state,'publish_requested');
  code(()=>recordIntent(tx,{...owner(),attemptId:'a2'}),'JOB_NOT_UNSENT');
  assert.equal(count(db,'attempts'),1); assert.equal(count(db,'publications'),0);
  assert.throws(()=>db.exec("UPDATE job_claims SET asset_key='other.png' WHERE job_id='j1'"),/immutable/);
  assert.throws(()=>db.exec("UPDATE attempts SET intent_at='new' WHERE id='a1'"),/immutable/);
});
scenario('wrong token, wrong generation, expired lease and mismatched gate cannot write intent', (db,tx)=>{
  claimed(db);
  for(const change of [{token:'wrong'},{generation:99},{now:'2026-10-05T03:02:00Z'}]) code(()=>recordIntent(tx,{...owner(change),attemptId:'a1'}),'OWNERSHIP_CONFLICT');
  db.exec("UPDATE page_publish_gates SET generation=99 WHERE page_connection_id='prod'");
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'OWNERSHIP_CONFLICT'); assert.equal(count(db,'attempts'),0);
});
scenario('pause then resume invalidates old owner; explicit safe takeover preserves payload', (db,tx)=>{
  claimed(db); const snapshot=db.prepare("SELECT caption_snapshot FROM publish_jobs WHERE id='j1'").get().caption_snapshot;
  setPaused(tx,{environment:'production',paused:true,actor:'owner',now:NOW}); code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'PAUSED');
  setPaused(tx,{environment:'production',paused:false,actor:'owner',now:NOW}); code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'OWNERSHIP_CONFLICT');
  const next=takeOwnership(tx,{jobId:'j1',token:'owner-two',actor:'runner',now:NOW});
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'OWNERSHIP_CONFLICT');
  const result=recordIntent(tx,{...owner({token:'owner-two',generation:next.generation}),attemptId:'a1'}); assert.equal(result.caption,snapshot);
});
scenario('held lease can be taken over only with no attempt; a current owner cannot be displaced', (db,tx)=>{
  claimed(db); code(()=>takeOwnership(tx,{jobId:'j1',token:'owner-two',actor:'runner',now:NOW}),'OWNER_STILL_ACTIVE');
  const next=takeOwnership(tx,{jobId:'j1',token:'owner-two',actor:'runner',now:'2026-10-05T03:02:00Z'});
  assert.equal(next.generation,2);
  recordIntent(tx,{...owner({token:'owner-two',generation:2,now:'2026-10-05T03:02:00Z'}),attemptId:'a1'});
  code(()=>takeOwnership(tx,{jobId:'j1',token:'third',actor:'runner',now:'2026-10-05T03:10:00Z'}),'JOB_NOT_UNSENT');
});
scenario('expired requested intent becomes unknown while attempt and page gate remain durable', (db,tx)=>{
  intended(db); code(()=>markExpiredIntentUnknown(tx,{jobId:'j1',actor:'recovery',now:NOW}),'NOT_EXPIRED_INTENT');
  markExpiredIntentUnknown(tx,{jobId:'j1',actor:'recovery',now:'2026-10-05T03:03:00Z'});
  assert.equal(db.prepare("SELECT state FROM publish_jobs WHERE id='j1'").get().state,'unknown');
  assert.equal(db.prepare("SELECT outcome FROM attempts WHERE id='a1'").get().outcome,null);
  assert.equal(db.prepare("SELECT active_job_id FROM page_publish_gates WHERE page_connection_id='prod'").get().active_job_id,'j1');
  code(()=>claimJob(tx,claimInput({id:'j2'})),'SLOT_CLOSED');
  code(()=>takeOwnership(tx,{jobId:'j1',token:'new',actor:'runner',now:'2026-10-05T03:10:00Z'}),'JOB_NOT_UNSENT');
});
scenario('known wrong source/asset and active-version edit stop sends after a successful claim', (db,tx)=>{
  claimed(db); db.exec("UPDATE assets SET status='blocked' WHERE id='image'");
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'CONTENT_INELIGIBLE');
  db.exec("UPDATE assets SET status='complete' WHERE id='image'; UPDATE content_entries SET active_version_id='v2' WHERE post_id='p1'");
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'ACTIVE_VERSION_CHANGED'); assert.equal(count(db,'attempts'),0);
});
scenario('cancel only an owned unsent hold; requested jobs cannot free slot or gate', (db,tx)=>{
  claimed(db); cancelUnsent(tx,owner());
  assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'planned');
  const next=claimJob(tx,claimInput({id:'j2',token:'second'}));
  recordIntent(tx,{...owner({jobId:'j2',token:'second',generation:next.generation}),attemptId:'a2'});
  code(()=>cancelUnsent(tx,owner({jobId:'j2',token:'second',generation:next.generation})),'JOB_NOT_UNSENT');
});
scenario('maintenance wins before intent; finishing needs matching owner/proofs and keeps pause/block', (db,tx)=>{
  claimed(db); assert.equal(beginMaintenance(tx,{environment:'production',owner:'backup1',actor:'backup',now:NOW}).acquired,true);
  code(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),'MAINTENANCE');
  assert.equal(beginMaintenance(tx,{environment:'production',owner:'backup2',actor:'backup',now:NOW}).acquired,false);
  const finish={environment:'production',owner:'backup1',generation:1,actor:'backup',now:NOW,databaseAvailable:true,exportFinished:true};
  code(()=>finishMaintenance(tx,{...finish,exportFinished:false}),'EXPORT_NOT_VERIFIED');
  code(()=>finishMaintenance(tx,{...finish,owner:'wrong'}),'OWNERSHIP_CONFLICT');
  setPaused(tx,{environment:'production',paused:true,actor:'owner',now:NOW});
  db.exec("UPDATE application_state SET blocked_reasons='[\"source_fault\"]' WHERE environment='production'");
  finishMaintenance(tx,finish); const s=db.prepare("SELECT * FROM application_state WHERE environment='production'").get();
  assert.equal(s.paused_by_user,1); assert.equal(s.blocked_reasons,'["source_fault"]'); assert.equal(s.maintenance_owner,null);
});
scenario('intent wins before maintenance; unknown also defers maintenance without writes', (db,tx)=>{
  intended(db); const request={environment:'production',owner:'backup',actor:'backup',now:NOW};
  assert.equal(beginMaintenance(tx,request).acquired,false);
  markExpiredIntentUnknown(tx,{jobId:'j1',actor:'recovery',now:'2026-10-05T03:03:00Z'});
  assert.equal(beginMaintenance(tx,request).acquired,false);
  assert.equal(db.prepare("SELECT maintenance_owner FROM application_state WHERE environment='production'").get().maintenance_owner,null);
});
scenario('old maintenance generation cannot finish a new session even when owner label repeats', (db,tx)=>{
  const input={environment:'production',owner:'backup',actor:'backup',now:NOW};
  const first=beginMaintenance(tx,input);
  const finish={...input,generation:first.generation,databaseAvailable:true,exportFinished:true};
  finishMaintenance(tx,finish); const second=beginMaintenance(tx,input);
  assert.equal(second.generation,2); code(()=>finishMaintenance(tx,finish),'OWNERSHIP_CONFLICT');
  assert.equal(db.prepare("SELECT maintenance_owner FROM application_state WHERE environment='production'").get().maintenance_owner,'backup');
});
scenario('claim rollback after inserted job and zero-row CAS create no partial ownership', (db,tx)=>{
  db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON job_claims BEGIN SELECT RAISE(ABORT,'fixture abort'); END");
  assert.throws(()=>claimed(db),/fixture abort/); assert.equal(count(db,'publish_jobs'),0); assert.equal(count(db,'page_publish_gates'),0);
  db.exec('DROP TRIGGER fixture_fail');
  const noCas={...tx,run:(sql,...p)=>sql.startsWith('UPDATE page_publish_gates')?0:tx.run(sql,...p)};
  code(()=>claimJob(noCas,claimInput()),'OWNERSHIP_CONFLICT');
  assert.equal(count(db,'publish_jobs'),0); assert.equal(count(db,'job_claims'),0); assert.equal(count(db,'operation_events'),0);
});
scenario('intent failure rolls back inserted attempt, counters, slot state and audit', (db,tx)=>{
  claimed(db); db.exec("CREATE TRIGGER fixture_fail BEFORE UPDATE OF state ON publish_jobs WHEN NEW.state='publish_requested' BEGIN SELECT RAISE(ABORT,'fixture abort'); END");
  assert.throws(()=>recordIntent(tx,{...owner(),attemptId:'a1'}),/fixture abort/);
  assert.equal(count(db,'attempts'),0); assert.equal(count(db,'operation_events'),1);
  const j=db.prepare("SELECT state,attempt_count FROM publish_jobs WHERE id='j1'").get(); assert.equal(j.state,'held'); assert.equal(j.attempt_count,0);
});
scenario('verified retry waits five minutes, reclaims ownership and uses identical snapshot up to three attempts', (db,tx)=>{
  const first=intended(db); verifiedRetryFixture(db);
  code(()=>takeOwnership(tx,{jobId:'j1',token:'retry',actor:'runner',now:'2026-10-05T03:04:59Z'}),'RETRY_NOT_DUE');
  const next=takeOwnership(tx,{jobId:'j1',token:'retry',actor:'runner',now:'2026-10-05T03:05:00Z'});
  const second=recordIntent(tx,{...owner({token:'retry',generation:next.generation,now:'2026-10-05T03:05:00Z'}),attemptId:'a2'}); assert.equal(first.caption,second.caption);
  verifiedRetryFixture(db,2);
  const last=takeOwnership(tx,{jobId:'j1',token:'retry3',actor:'runner',now:'2026-10-05T03:06:00Z'});
  const third=recordIntent(tx,{...owner({token:'retry3',generation:last.generation,now:'2026-10-05T03:06:00Z'}),attemptId:'a3'}); assert.equal(first.checksum,third.checksum);
  verifiedRetryFixture(db,3); code(()=>takeOwnership(tx,{jobId:'j1',token:'retry4',actor:'runner',now:'2026-10-05T03:07:00Z'}),'ATTEMPT_LIMIT');
  assert.equal(count(db,'attempts'),3);
});
scenario('unverified retry cannot turn an ambiguous outcome into a new intent', (db,tx)=>{
  intended(db); verifiedRetryFixture(db); db.exec("UPDATE attempts SET outcome='unknown' WHERE id='a1'");
  code(()=>takeOwnership(tx,{jobId:'j1',token:'retry',actor:'runner',now:'2026-10-05T03:05:00Z'}),'RETRY_NOT_VERIFIED'); assert.equal(count(db,'attempts'),1);
});
scenario('verified retry releases page but preserves original post hold; different trial can run', (db,tx)=>{
  seedReady(db,{post:'p2',version:'v3',asset:'image2'});
  claimJob(tx,claimInput({page:'trial',slotId:null,requestId:'trial-first'}));
  recordIntent(tx,{...owner(),attemptId:'a1'});
  db.exec("UPDATE attempts SET outcome='verified_failed_retryable' WHERE id='a1'; UPDATE publish_jobs SET state='retry_wait',next_attempt_at='2026-10-05T03:05:00Z' WHERE id='j1'; UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id='trial'");
  code(()=>claimJob(tx,claimInput({id:'same-post',page:'trial',slotId:null,requestId:'same-post'})),'CONTENT_INELIGIBLE');
  claimJob(tx,claimInput({id:'j2',postId:'p2',expectedVersion:'v3',page:'trial',slotId:null,requestId:'another-post',token:'two'}));
  code(()=>takeOwnership(tx,{jobId:'j1',token:'retry',actor:'runner',now:'2026-10-05T03:05:00Z'}),'OWNERSHIP_CONFLICT');
  assert.equal(count(db,'publish_jobs'),2); assert.equal(count(db,'attempts'),1);
});

async function race(path,actions) {
  const barrier=new SharedArrayBuffer(4), workers=[], readiness=[], results=[];
  for(const [action,input] of actions) {
    const w=new Worker(new URL('./helpers/claim-racer.mjs',import.meta.url),{workerData:{path,action,input,barrier}}); workers.push(w);
    let mark,failReady; readiness.push(new Promise((resolve,reject)=>{mark=resolve;failReady=reject;}));
    results.push(new Promise((resolve,reject)=>{ w.on('message',message=>message.ready?mark():resolve(message)); w.on('error',error=>{failReady(error);reject(error);}); }));
  }
  let timer;
  const deadline=new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Worker race timed out')),10_000));
  const completed=Promise.all(results); completed.catch(()=>{});
  try { await Promise.race([Promise.all(readiness),deadline]); Atomics.store(new Int32Array(barrier),0,1); Atomics.notify(new Int32Array(barrier),0); return await Promise.race([completed,deadline]); }
  finally { clearTimeout(timer); await Promise.all(workers.map(w=>w.terminate())); }
}
function fileFixture() {
  const root=resolve('tmp/step-03-races'); mkdirSync(root,{recursive:true}); const directory=mkdtempSync(resolve(root,'race-'));
  const path=resolve(directory,'catalog.sqlite'), db=openCatalog(path);
  db.exec(`INSERT INTO posts VALUES ('p1','fixture','P01','D','scheduled','2026-10-05T00:00:00Z');
    INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_description,primary_audience) VALUES ('v1','p1',1,'Nội dung một','Tiêu đề','Ảnh','Mô tả','student');
    INSERT INTO page_connections VALUES ('prod','production','fixture.invalid','Fixture');
    INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('s1','prod','2026-10-05')`);
  seedReady(db); return {db,path};
}
test('two independent SQLite workers racing same slot produce exactly one complete claim',async()=>{
  const {db,path}=fileFixture();
  try {
    const results=await race(path,[['claim',claimInput()],['claim',claimInput({id:'j2',token:'owner-two'})]]);
    assert.equal(results.filter(r=>r.ok).length,1); assert.equal(count(db,'publish_jobs'),1); assert.equal(count(db,'job_claims'),1); assert.equal(count(db,'operation_events'),1);
    assert.equal(count(db,'attempts'),0);
  } finally {db.close();}
});
test('maintenance and intent race on separate SQLite workers has one winning action',async()=>{
  const {db,path}=fileFixture();
  try {
    claimed(db);
    const results=await race(path,[['intent',{...owner(),attemptId:'a1'}],['maintenance',{environment:'production',owner:'backup',actor:'backup',now:NOW}]]);
    const intent=results[0],maintenance=results[1];
    assert.ok((intent.ok && maintenance.ok && !maintenance.result.acquired) || (!intent.ok && intent.code==='MAINTENANCE' && maintenance.result.acquired));
    assert.equal(count(db,'attempts'),intent.ok?1:0);
  } finally {db.close();}
});

