import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openCatalog } from '../scripts/catalog-store.mjs';
import { database } from './helpers/database.mjs';
import { seedReady, intended, owner, NOW } from './helpers/claims-fixture.mjs';
import { transactionStore } from '../scripts/transaction-store.mjs';
import { intakeEvidence, finalizeEvidence } from '../src/storage/evidence.ts';
import { claimJob, recordIntent, takeOwnership, setPaused, markExpiredIntentUnknown } from '../src/storage/claims.ts';
const OBS='2026-10-05T03:00:10Z', FIN='2026-10-05T03:00:20Z';
const evidence=(overrides={})=>({id:'e1',eventKey:'event1',attemptId:'a1',page:'prod',outcome:'confirmed',remoteId:'remote1',
  remotePublishedAt:OBS,remoteLink:'https://example.invalid/fixture-post',failureKind:null,retryAt:null,observedAt:OBS,...overrides});
const failure=(overrides={})=>evidence({outcome:'verified_failed_retryable',remoteId:null,remotePublishedAt:null,remoteLink:null,failureKind:'retryable',...overrides});
const unknown=(overrides={})=>failure({outcome:'unknown',failureKind:null,...overrides});
const code=(run,expected)=>assert.throws(run,error=>error.code===expected);
const count=(db,table)=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const status=(db)=>db.prepare("SELECT state FROM publish_jobs WHERE id='j1'").get().state;
function scenario(name,run){test(name,()=>{const db=database();try{seedReady(db);intended(db);run(db,transactionStore(db));}finally{db.close();}});}
const apply=(tx,id='e1',now=FIN)=>finalizeEvidence(tx,{id,actor:'fixture-finalizer',now});
scenario('intake is idempotent, retains immutable normalized evidence and never trusts another page', (db,tx)=>{
  assert.equal(intakeEvidence(tx,evidence()).duplicate,false);
  assert.equal(intakeEvidence(tx,evidence({id:'another-id'})).id,'e1');
  code(()=>intakeEvidence(tx,evidence({remoteId:'changed'})),'EVIDENCE_EVENT_CONFLICT');
  code(()=>intakeEvidence(tx,evidence({id:'e2',eventKey:'event2',page:'trial'})),'EVIDENCE_PAGE_MISMATCH');
  assert.equal(count(db,'publish_evidence'),1);assert.equal(count(db,'publications'),0);assert.equal(status(db),'evidence_pending');
});
scenario('normalized input validation rejects incomplete confirmation, failure with a post and timestamps before intent', (db,tx)=>{
  for(const [input,expected] of [[evidence({remoteId:null}),'INVALID_CONFIRMATION'],[failure({remoteId:'image-only'}),'FAILURE_HAS_REMOTE_PUBLICATION'],
    [evidence({observedAt:'2026-10-05T02:59:59Z',remotePublishedAt:null}),'EVIDENCE_BEFORE_INTENT'],
    [evidence({remotePublishedAt:'2026-10-05T03:01:00Z'}),'REMOTE_TIME_IN_FUTURE'],[failure({failureKind:null}),'INVALID_FAILURE_KIND']]) code(()=>intakeEvidence(tx,input),expected);
  code(()=>intakeEvidence(tx,evidence({remotePublishedAt:'2026-10-05T02:59:59Z'})),'REMOTE_PUBLICATION_BEFORE_INTENT');
  assert.equal(count(db,'publish_evidence'),0);
});
scenario('confirmed finalizes history slot usage actual day guard and outbox atomically once', (db,tx)=>{
  intakeEvidence(tx,evidence());assert.equal(apply(tx).state,'applied');assert.equal(apply(tx).duplicate,true);
  for(const table of ['publications','production_post_usage','actual_day_guards','notification_outbox']) assert.equal(count(db,table),1);
  assert.equal(status(db),'confirmed');assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'confirmed');
  assert.equal(db.prepare("SELECT active_job_id FROM page_publish_gates WHERE page_connection_id='prod'").get().active_job_id,null);
  const pub=db.prepare('SELECT * FROM publications').get();const j=db.prepare("SELECT * FROM publish_jobs WHERE id='j1'").get();
  assert.equal(pub.caption_snapshot,j.caption_snapshot);assert.equal(pub.asset_checksum,j.asset_checksum);
  assert.equal(db.prepare('SELECT state FROM notification_outbox').get().state,'pending');
});
scenario('another event for same remote post creates neither duplicate history nor duplicate success notification', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);intakeEvidence(tx,evidence({id:'e2',eventKey:'event2'}));apply(tx,'e2');
  assert.equal(count(db,'publications'),1);assert.equal(count(db,'notification_outbox'),1);assert.equal(count(db,'incidents'),0);
});
scenario('outbox failure rolls back finalization while independent intake survives and can be retried', (db,tx)=>{
  intakeEvidence(tx,evidence());db.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON notification_outbox BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.throws(()=>apply(tx),/fixture failure/);
  for(const table of ['publications','production_post_usage','actual_day_guards','notification_outbox'])assert.equal(count(db,table),0);
  assert.equal(count(db,'publish_evidence'),1);assert.equal(status(db),'evidence_pending');
  const e=db.prepare("SELECT * FROM publish_evidence WHERE id='e1'").get();assert.equal(e.state,'pending');assert.equal(e.last_error,'FINALIZATION_FAILED');
  db.exec('DROP TRIGGER fixture_fail');assert.equal(apply(tx).deferred,true);assert.equal(apply(tx,'e1','2026-10-05T03:01:20Z').state,'applied');
  assert.equal(count(db,'publications'),1);assert.equal(count(db,'attempts'),1);
});
scenario('expired owner and user pause do not discard confirmed evidence or re-enable schedule', (db,tx)=>{
  markExpiredIntentUnknown(tx,{jobId:'j1',actor:'recovery',now:'2026-10-05T03:03:00Z'});
  setPaused(tx,{environment:'production',paused:true,actor:'owner',now:FIN});
  intakeEvidence(tx,evidence({observedAt:'2026-10-05T03:04:00Z'}));apply(tx,'e1','2026-10-05T03:04:01Z');
  assert.equal(status(db),'confirmed');assert.equal(count(db,'publications'),1);
  assert.equal(db.prepare("SELECT paused_by_user FROM application_state WHERE environment='production'").get().paused_by_user,1);
});
scenario('maintenance defers finalization without dropping evidence or clearing user controls', (db,tx)=>{
  intakeEvidence(tx,evidence());db.exec("UPDATE application_state SET maintenance_owner='export-fixture' WHERE environment='production'");
  assert.equal(apply(tx).deferred,true);assert.equal(count(db,'publications'),0);
  db.exec("UPDATE application_state SET maintenance_owner=NULL WHERE environment='production'");assert.equal(apply(tx).state,'applied');
});
scenario('unknown retains gate and can later refine to confirmed without calling publisher again', (db,tx)=>{
  intakeEvidence(tx,unknown());apply(tx);assert.equal(status(db),'unknown');assert.equal(count(db,'publications'),0);
  assert.equal(db.prepare("SELECT active_job_id FROM page_publish_gates WHERE page_connection_id='prod'").get().active_job_id,'j1');
  intakeEvidence(tx,evidence({id:'e2',eventKey:'event2'}));assert.equal(apply(tx,'e2').state,'applied');
  assert.equal(status(db),'confirmed');assert.equal(count(db,'attempts'),1);
});
scenario('unknown after confirmation is a weaker observation and cannot regress success', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);intakeEvidence(tx,unknown({id:'e2',eventKey:'event2'}));apply(tx,'e2');
  assert.equal(status(db),'confirmed');assert.equal(db.prepare("SELECT outcome FROM attempts WHERE id='a1'").get().outcome,'confirmed');
});
scenario('verified retry finalizes safely, honors retry_after and needs reacquired ownership', (db,tx)=>{
  intakeEvidence(tx,failure({retryAt:'2026-10-05T03:10:00Z'}));apply(tx);assert.equal(status(db),'retry_wait');
  assert.equal(db.prepare("SELECT next_attempt_at FROM publish_jobs WHERE id='j1'").get().next_attempt_at,'2026-10-05T03:10:00.000Z');
  code(()=>takeOwnership(tx,{jobId:'j1',token:'retry-owner',actor:'runner',now:'2026-10-05T03:09:59Z'}),'RETRY_NOT_DUE');
  const taken=takeOwnership(tx,{jobId:'j1',token:'retry-owner',actor:'runner',now:'2026-10-05T03:10:00Z'});
  recordIntent(tx,{...owner({token:'retry-owner',generation:taken.generation,now:'2026-10-05T03:10:00Z'}),attemptId:'a2'});
  assert.equal(count(db,'attempts'),2);assert.equal(count(db,'publications'),0);
});
scenario('three verified failures retain repair post, restore same-day slot and alert once', (db,tx)=>{
  for(let ordinal=1;ordinal<=3;ordinal++){
    const seconds=(ordinal-1)*360, observed=new Date(Date.parse(OBS)+seconds*1000).toISOString(), now=new Date(Date.parse(FIN)+seconds*1000).toISOString();
    intakeEvidence(tx,failure({id:`e${ordinal}`,eventKey:`event${ordinal}`,attemptId:`a${ordinal}`,observedAt:observed}));apply(tx,`e${ordinal}`,now);
    if(ordinal<3){const at=new Date(Date.parse(now)+300_000).toISOString();const taken=takeOwnership(tx,{jobId:'j1',token:`retry${ordinal}`,actor:'runner',now:at});
      recordIntent(tx,{...owner({token:`retry${ordinal}`,generation:taken.generation,now:at}),attemptId:`a${ordinal+1}`});}
  }
  assert.equal(status(db),'failed');assert.equal(db.prepare("SELECT status FROM post_versions WHERE id='v1'").get().status,'needs_review');
  assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'planned');
  assert.equal(count(db,'attempts'),3);assert.equal(count(db,'notification_outbox'),1);
});
scenario('policy failure quarantines original version and does not rewrite its caption', (db,tx)=>{
  const before=db.prepare("SELECT caption_snapshot FROM publish_jobs WHERE id='j1'").get().caption_snapshot;
  intakeEvidence(tx,failure({outcome:'verified_failed_final',failureKind:'policy'}));apply(tx);
  assert.equal(status(db),'quarantined');assert.equal(db.prepare("SELECT status FROM post_versions WHERE id='v1'").get().status,'quarantined');
  assert.equal(db.prepare("SELECT caption_snapshot FROM publish_jobs WHERE id='j1'").get().caption_snapshot,before);
});
scenario('global failure blocks environment and cannot consume another reserve even when slot becomes available', (db,tx)=>{
  intakeEvidence(tx,failure({outcome:'verified_failed_final',failureKind:'global'}));apply(tx);
  assert.equal(count(db,'incidents'),1);assert.notEqual(db.prepare("SELECT blocked_reasons FROM application_state WHERE environment='production'").get().blocked_reasons,'[]');
  code(()=>claimJob(tx,{id:'new',page:'prod',postId:'p2',expectedVersion:'v3',slotId:'s1',requestId:null,token:'new-owner',actor:'runner',now:FIN}),'ENVIRONMENT_BLOCKED');
});
scenario('second remote ID stores both actual publications, retains first usage and blocks conflicts', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);intakeEvidence(tx,evidence({id:'e2',eventKey:'event2',remoteId:'remote2'}));assert.equal(apply(tx,'e2').state,'conflict');
  assert.equal(count(db,'publications'),2);assert.equal(count(db,'production_post_usage'),1);assert.equal(count(db,'actual_day_guards'),1);
  assert.equal(db.prepare("SELECT state FROM publish_evidence WHERE id='e2'").get().state,'conflict');
  assert.ok(count(db,'incidents')>=1);assert.equal(db.prepare('SELECT count(*) n FROM notification_outbox WHERE publication_id IS NOT NULL').get().n,2);
});
scenario('success missing remote date is stored honestly; later date adds proof without rewriting snapshot', (db,tx)=>{
  intakeEvidence(tx,evidence({remotePublishedAt:null}));assert.equal(apply(tx).state,'conflict');assert.equal(count(db,'publications'),1);assert.equal(count(db,'actual_day_guards'),0);
  const before=db.prepare('SELECT * FROM publications').get();assert.equal(before.remote_business_date,null);
  intakeEvidence(tx,evidence({id:'e2',eventKey:'event2'}));apply(tx,'e2');assert.equal(count(db,'publication_dates'),1);assert.equal(count(db,'actual_day_guards'),1);
  assert.deepEqual(db.prepare('SELECT * FROM publications').get(),before);
  assert.notEqual(db.prepare("SELECT blocked_reasons FROM application_state WHERE environment='production'").get().blocked_reasons,'[]');
});
scenario('publication after midnight consumes actual next day and returns displaced planned post to reserve', (db,tx)=>{
  db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date,planned_post_id) VALUES ('s2','prod','2026-10-06','p2')");
  intakeEvidence(tx,evidence({remotePublishedAt:'2026-10-05T17:01:00Z',observedAt:'2026-10-05T17:02:00Z'}));apply(tx,'e1','2026-10-05T17:03:00Z');
  assert.equal(db.prepare('SELECT business_date FROM actual_day_guards').get().business_date,'2026-10-06');
  assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s2'").get().status,'replaced_by_late_publication');
  assert.equal(db.prepare("SELECT pool FROM posts WHERE id='p2'").get().pool,'reserve');
});
scenario('failure arriving after known success is retained as conflict without resetting history or gate', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);intakeEvidence(tx,failure({id:'e2',eventKey:'event2'}));assert.equal(apply(tx,'e2').state,'conflict');
  assert.equal(status(db),'confirmed');assert.equal(count(db,'publications'),1);assert.equal(db.prepare("SELECT status FROM schedule_slots WHERE id='s1'").get().status,'confirmed');
});
scenario('staging success records trial history/outbox and never consumes production usage or guard', (db,tx)=>{
  // Separate trial page; the production request remains unresolved and independent.
  claimJob(tx,{id:'trialjob',page:'trial',postId:'p1',expectedVersion:'v1',slotId:null,requestId:'trial1',token:'trial-owner',actor:'runner',now:NOW});
  recordIntent(tx,{...owner({jobId:'trialjob',token:'trial-owner'}),attemptId:'trialattempt'});
  intakeEvidence(tx,evidence({id:'trial-e',eventKey:'trial-event',attemptId:'trialattempt',page:'trial'}));apply(tx,'trial-e');
  assert.equal(count(db,'publications'),1);assert.equal(count(db,'production_post_usage'),0);assert.equal(count(db,'actual_day_guards'),0);
  assert.equal(status(db),'publish_requested');
});
scenario('late success of previous attempt keeps newer unresolved attempt blocked instead of releasing page', (db,tx)=>{
  intakeEvidence(tx,failure());apply(tx);
  const next=takeOwnership(tx,{jobId:'j1',token:'retry',actor:'runner',now:'2026-10-05T03:06:00Z'});
  recordIntent(tx,{...owner({token:'retry',generation:next.generation,now:'2026-10-05T03:06:00Z'}),attemptId:'a2'});
  intakeEvidence(tx,evidence({id:'late',eventKey:'late',observedAt:'2026-10-05T03:06:10Z'}));assert.equal(apply(tx,'late','2026-10-05T03:06:20Z').state,'conflict');
  assert.equal(count(db,'publications'),1);assert.equal(status(db),'unknown');
  assert.equal(db.prepare("SELECT active_job_id FROM page_publish_gates WHERE page_connection_id='prod'").get().active_job_id,'j1');
  assert.equal(db.prepare("SELECT outcome FROM attempts WHERE id='a2'").get().outcome,null);
});
scenario('two distinct jobs with a remote-date collision retain both truths and do not overwrite existing day guard', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);
  seedReady(db,{post:'p2',version:'v3',asset:'image2'});
  db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date,planned_post_id) VALUES ('s2','prod','2026-10-06','p2')");
  claimJob(tx,{id:'j2',page:'prod',postId:'p2',expectedVersion:'v3',slotId:'s2',requestId:null,token:'second',actor:'runner',now:'2026-10-06T03:00:00Z'});
  recordIntent(tx,{...owner({jobId:'j2',token:'second',generation:2,now:'2026-10-06T03:00:00Z'}),attemptId:'a2'});
  // Inject a verified historical publication/guard fixture to exercise collision recovery.
  db.exec("INSERT INTO publications(id,job_id,remote_id,remote_link,caption_snapshot,asset_checksum,footer_version,confirmed_at,remote_business_date) SELECT 'other-truth','j1','other-remote','',caption_snapshot,asset_checksum,footer_version,'2026-10-06T03:00:00Z','2026-10-06' FROM publish_jobs WHERE id='j1'; INSERT INTO actual_day_guards VALUES ('prod','2026-10-06','other-truth')");
  intakeEvidence(tx,evidence({id:'e2',eventKey:'event2',attemptId:'a2',remoteId:'remote2',remotePublishedAt:'2026-10-06T03:00:10Z',observedAt:'2026-10-06T03:00:10Z'}));
  assert.equal(apply(tx,'e2','2026-10-06T03:00:20Z').state,'conflict');
  assert.equal(db.prepare("SELECT publication_id FROM actual_day_guards WHERE business_date='2026-10-06'").get().publication_id,'other-truth');
  assert.equal(count(db,'publications'),3);
});
scenario('remote ID claimed by another job retains conflict evidence without associating it twice', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);
  seedReady(db,{post:'p2',version:'v3',asset:'image2'});
  db.exec("INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('s2','prod','2026-10-06')");
  claimJob(tx,{id:'j2',page:'prod',postId:'p2',expectedVersion:'v3',slotId:'s2',requestId:null,token:'second',actor:'runner',now:'2026-10-06T03:00:00Z'});
  recordIntent(tx,{...owner({jobId:'j2',token:'second',generation:2,now:'2026-10-06T03:00:00Z'}),attemptId:'a2'});
  intakeEvidence(tx,evidence({id:'e2',eventKey:'event2',attemptId:'a2',remotePublishedAt:'2026-10-06T03:00:10Z',observedAt:'2026-10-06T03:00:10Z'}));
  assert.equal(apply(tx,'e2','2026-10-06T03:00:20Z').state,'conflict');assert.equal(count(db,'publications'),1);assert.equal(count(db,'publish_evidence'),2);
});
scenario('weaker repeated confirmation cannot erase an already verified remote-date proof', (db,tx)=>{
  intakeEvidence(tx,evidence());apply(tx);
  intakeEvidence(tx,evidence({id:'weak',eventKey:'weak',remotePublishedAt:null}));assert.equal(apply(tx,'weak').state,'applied');
  assert.equal(count(db,'incidents'),0);assert.equal(count(db,'actual_day_guards'),1);assert.equal(count(db,'notification_outbox'),1);
});
test('two SQLite worker finalizers apply one evidence exactly once to history and outbox',async()=>{
  const root=resolve('tmp/step-04-races');mkdirSync(root,{recursive:true});const directory=mkdtempSync(resolve(root,'race-'));
  const path=resolve(directory,'catalog.sqlite'),db=openCatalog(path);
  db.exec("INSERT INTO posts VALUES ('p1','fixture','P01','D','scheduled','2026-10-05T00:00:00Z'); INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_description,primary_audience) VALUES ('v1','p1',1,'Nội dung một','Tiêu đề','Ảnh','Mô tả','student'); INSERT INTO page_connections VALUES ('prod','production','fixture.invalid','Fixture'); INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES ('s1','prod','2026-10-05')");
  const workers=[],ready=[],result=[],barrier=new SharedArrayBuffer(4);let timer;
  try{
    seedReady(db);intended(db);intakeEvidence(transactionStore(db),evidence());
    for(let i=0;i<2;i++){
      const worker=new Worker(new URL('./helpers/claim-racer.mjs',import.meta.url),{workerData:{path,action:'finalize',input:{id:'e1',actor:`finalizer-${i}`,now:FIN},barrier}});workers.push(worker);
      let mark,fail;ready.push(new Promise((resolve,reject)=>{mark=resolve;fail=reject;}));
      result.push(new Promise((resolve,reject)=>{worker.on('message',m=>m.ready?mark():resolve(m));worker.on('error',e=>{fail(e);reject(e);});}));
    }
    const completed=Promise.all(result);completed.catch(()=>{});
    const deadline=new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Finalizer race timed out')),10_000));
    await Promise.race([Promise.all(ready),deadline]);Atomics.store(new Int32Array(barrier),0,1);Atomics.notify(new Int32Array(barrier),0);
    const results=await Promise.race([completed,deadline]);assert.equal(results.filter(r=>r.ok).length,2);assert.equal(results.filter(r=>r.result.duplicate).length,1);
    for(const table of ['publications','production_post_usage','actual_day_guards','notification_outbox'])assert.equal(count(db,table),1);
  }finally{clearTimeout(timer);await Promise.all(workers.map(w=>w.terminate()));db.close();}
});
