import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workflowFixture} from './helpers/workflow-fixture.mjs';
import {openCatalog,importBriefs} from '../scripts/catalog-store.mjs';
import {transactionStore} from '../scripts/transaction-store.mjs';
import {FakePublisher} from '../src/workflow/fake-adapter.ts';
import {runLocalTick,enableSimulation,configureSimulationSchedule,resumeSimulationAfterRefill} from '../src/workflow/local-runner.ts';
import {claimJob,recordIntent,setPaused} from '../src/storage/claims.ts';
import {intakeEvidence} from '../src/storage/evidence.ts';
const count=(db,table)=>db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
const tick=(f,publisher=new FakePublisher(),extra={})=>runLocalTick(f.tx,publisher,{page:'prod',now:f.now,id:f.id,...extra});
function scenario(name,run,options){test(name,async()=>{const f=workflowFixture(options);try{await run(f);}finally{f.db.close();}});}
scenario('before 10h no request; at 10h one success; repeated ticks same day cannot publish again',async f=>{
  const publisher=new FakePublisher();f.setNow('2026-10-05T02:59:59Z');assert.equal((await tick(f,publisher)).status,'not_due');
  f.setNow('2026-10-05T03:00:00Z');assert.equal((await tick(f,publisher)).status,'day_complete');
  await tick(f,publisher);f.setNow('2026-10-05T16:59:59Z');await tick(f,publisher);
  assert.equal(publisher.requests.length,1);assert.equal(count(f.db,'publications'),1);
  assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'p1');
});
scenario('schedule must be explicitly configured; fake mode never activates a live destination',async f=>{
  assert.equal((await tick(f)).status,'schedule_not_started');
  enableSimulation(f.tx);
  configureSimulationSchedule(f.tx,{page:'prod',startDate:'2026-10-06'});
  assert.equal((await tick(f)).status,'schedule_not_started');
  assert.throws(()=>configureSimulationSchedule(f.tx,{page:'prod',startDate:'2026-10-07'}),e=>e.code==='SCHEDULE_ALREADY_CONFIGURED');
},{configure:false});
scenario('permanent candidate failure is repaired and reserve succeeds in the same day',async f=>{
  const publisher=new FakePublisher(['final','confirmed']);const result=await tick(f,publisher);
  assert.equal(result.status,'day_complete');assert.equal(publisher.requests.length,2);assert.equal(count(f.db,'publications'),1);
  assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'r1');
  assert.equal(f.db.prepare("SELECT status FROM post_versions WHERE id='p1-v1'").get().status,'needs_review');
});
scenario('reserve selection respects same-topic priority instead of merely taking first stock row',async f=>{
  f.db.exec("UPDATE posts SET topic_group='A' WHERE id='r1'");
  const publisher=new FakePublisher(['final','confirmed']);await tick(f,publisher);
  assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'r2');
});
scenario('known invalid planned version is never sent and is replaced with an eligible reserve',async f=>{
  f.db.exec("UPDATE post_versions SET review_due_at='2026-10-05T03:00:00Z' WHERE id='p1-v1'");
  const publisher=new FakePublisher();await tick(f,publisher);assert.equal(publisher.requests.length,1);
  assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'r1');
});
scenario('five failed reserve candidates continue to the next reserve rather than stopping at three reserves',async f=>{
  const publisher=new FakePublisher(['final','final','final','final','final','confirmed']);await tick(f,publisher);
  assert.equal(publisher.requests.length,6);assert.equal(count(f.db,'publications'),1);assert.equal(count(f.db,'publish_jobs'),6);
},{mains:1,reserves:5});
scenario('retry waits five minutes, reaches three attempts, then takes reserve with snapshots unchanged',async f=>{
  const publisher=new FakePublisher(['retryable','retryable','retryable','confirmed']);
  assert.equal((await tick(f,publisher)).status,'retry_wait');assert.equal(publisher.requests.length,1);
  f.setNow('2026-10-05T03:04:59Z');await tick(f,publisher);assert.equal(publisher.requests.length,1);
  f.setNow('2026-10-05T03:05:00Z');await tick(f,publisher);
  f.setNow('2026-10-05T03:10:00Z');assert.equal((await tick(f,publisher)).status,'day_complete');
  assert.equal(publisher.requests.length,4);
  assert.equal(publisher.requests[0].caption,publisher.requests[2].caption);assert.equal(publisher.requests[0].checksum,publisher.requests[2].checksum);
});
scenario('unknown and thrown transport errors hold page, alert and never take reserve',async f=>{
  const publisher=new FakePublisher(['throw','confirmed']);assert.equal((await tick(f,publisher)).status,'reconciliation_required');
  f.setNow('2026-10-06T03:00:00Z');await tick(f,publisher);assert.equal(publisher.requests.length,1);assert.equal(count(f.db,'publications'),0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE event_id LIKE 'unknown:%'").get().n,1);
});
scenario('global failure stops all candidate fallback; policy failure quarantines only offending candidate',async f=>{
  const publisher=new FakePublisher(['global','confirmed']);assert.equal((await tick(f,publisher)).status,'blocked');assert.equal(publisher.requests.length,1);
});
scenario('policy failure can use another reserve while original caption remains quarantined',async f=>{
  const publisher=new FakePublisher(['policy','confirmed']);await tick(f,publisher);assert.equal(publisher.requests.length,2);
  assert.equal(f.db.prepare("SELECT status FROM post_versions WHERE id='p1-v1'").get().status,'quarantined');
});
scenario('bounded tick can be continued without repeating previously failed candidates',async f=>{
  const publisher=new FakePublisher(['final','final','confirmed']);assert.equal((await tick(f,publisher,{budget:1})).status,'budget_exhausted');
  assert.equal(publisher.requests.length,1);await tick(f,publisher);assert.equal(publisher.requests.length,3);assert.equal(count(f.db,'publications'),1);
});
scenario('empty stock emits one episode alert, blocks schedule and never auto-generates content',async f=>{
  const publisher=new FakePublisher();assert.equal((await tick(f,publisher)).status,'stock_empty');await tick(f,publisher);
  assert.equal(publisher.requests.length,0);assert.equal(count(f.db,'posts'),0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE event_id LIKE 'stock:%'").get().n,1);
  assert.throws(()=>resumeSimulationAfterRefill(f.tx,{page:'prod',now:f.now()}),e=>e.code==='STOCK_STILL_EMPTY');
},{mains:0,reserves:0});
scenario('refill requires explicit resume; clearing only stock stop preserves user pause and other blocks',async f=>{
  const publisher=new FakePublisher();await tick(f,publisher);f.add('fresh','reserve',1);
  assert.equal((await tick(f,publisher)).status,'blocked');assert.equal(publisher.requests.length,0);
  setPaused(f.tx,{environment:'production',paused:true,actor:'owner',now:f.now()});
  f.db.exec("UPDATE application_state SET blocked_reasons=json_insert(blocked_reasons,'$[#]','other_fault') WHERE environment='production'");
  resumeSimulationAfterRefill(f.tx,{page:'prod',now:f.now()});
  const s=f.db.prepare("SELECT * FROM application_state WHERE environment='production'").get();assert.equal(s.paused_by_user,1);assert.deepEqual(JSON.parse(s.blocked_reasons),['other_fault']);
},{mains:0,reserves:0});
scenario('coverage threshold alerts at three eligible posts, deduplicated while paused',async f=>{
  setPaused(f.tx,{environment:'production',paused:true,actor:'owner',now:f.now()});await tick(f);await tick(f);
  const alert=JSON.parse(f.db.prepare("SELECT payload_json FROM notification_outbox WHERE event_id LIKE 'stock:%'").get().payload_json);
  assert.equal(alert.kind,'stock_low');assert.equal(alert.coverageDays,3);assert.equal(count(f.db,'notification_outbox'),1);
},{mains:2,reserves:1});
scenario('missed previous day expires slot and moves unused planned post to reserve without catch-up posting',async f=>{
  f.setNow('2026-10-06T03:00:00Z');const publisher=new FakePublisher();await tick(f,publisher);
  assert.equal(publisher.requests.length,1);assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'p2');
  assert.equal(f.db.prepare("SELECT status FROM schedule_slots WHERE business_date='2026-10-05'").get().status,'expired');
  assert.equal(f.db.prepare("SELECT pool FROM posts WHERE id='p1'").get().pool,'reserve');
});
scenario('expired unsent held job is cancelled safely, but next day publishes only its own planned post',async f=>{
  claimJob(f.tx,{id:'old-held',page:'prod',postId:'p1',expectedVersion:'p1-v1',slotId:'slot:prod:2026-10-05',requestId:null,token:'old',actor:'fixture',now:f.now()});
  f.setNow('2026-10-06T03:00:00Z');const publisher=new FakePublisher();await tick(f,publisher);
  assert.equal(f.db.prepare("SELECT state FROM publish_jobs WHERE id='old-held'").get().state,'cancelled');assert.equal(publisher.requests.length,1);
});
scenario('verified retry left overnight is retained for repair rather than retried alongside today slot',async f=>{
  const publisher=new FakePublisher(['retryable','confirmed']);await tick(f,publisher);
  f.setNow('2026-10-06T03:00:00Z');await tick(f,publisher);
  assert.equal(publisher.requests.length,2);assert.equal(count(f.db,'publications'),1);
  assert.equal(f.db.prepare('SELECT post_id FROM production_post_usage').get().post_id,'p2');
  assert.equal(f.db.prepare("SELECT status FROM post_versions WHERE id='p1-v1'").get().status,'needs_review');
});
scenario('late reconciliation across midnight consumes actual day before any new planned post is sent',async f=>{
  const publisher=new FakePublisher(['unknown']);await tick(f,publisher);
  const a=f.db.prepare('SELECT id FROM attempts').get().id;
  f.setNow('2026-10-06T03:00:00Z');
  intakeEvidence(f.tx,{id:'late-proof',eventKey:'late-proof',attemptId:a,page:'prod',outcome:'confirmed',remoteId:'fixture:late-post',remotePublishedAt:'2026-10-05T17:00:10Z',remoteLink:'https://example.invalid/late-fixture',failureKind:null,retryAt:null,observedAt:'2026-10-06T02:00:00Z'});
  assert.equal((await tick(f,publisher)).status,'day_complete');assert.equal(publisher.requests.length,1);
  assert.equal(f.db.prepare("SELECT pool FROM posts WHERE id='p2'").get().pool,'reserve');
});
scenario('expired committed intent becomes unknown on restart and is never sent from replay',async f=>{
  const claim=claimJob(f.tx,{id:'old',page:'prod',postId:'p1',expectedVersion:'p1-v1',slotId:'slot:prod:2026-10-05',requestId:null,token:'old',actor:'fixture',now:f.now()});
  recordIntent(f.tx,{jobId:'old',token:'old',generation:claim.generation,actor:'fixture',now:f.now(),attemptId:'old-a'});
  f.setNow('2026-10-05T03:03:00Z');const publisher=new FakePublisher();assert.equal((await tick(f,publisher)).status,'reconciliation_required');
  assert.equal(publisher.requests.length,0);assert.equal(f.db.prepare("SELECT state FROM publish_jobs WHERE id='old'").get().state,'unknown');
});
scenario('queued confirmed evidence is finalized before any new send after restart',async f=>{
  const claim=claimJob(f.tx,{id:'old',page:'prod',postId:'p1',expectedVersion:'p1-v1',slotId:'slot:prod:2026-10-05',requestId:null,token:'old',actor:'fixture',now:f.now()});
  const permit=recordIntent(f.tx,{jobId:'old',token:'old',generation:claim.generation,actor:'fixture',now:f.now(),attemptId:'old-a'});
  const result=await new FakePublisher().publish(permit,f.now());intakeEvidence(f.tx,{...result,id:'old-e',eventKey:'old-event'});
  const publisher=new FakePublisher();await tick(f,publisher);assert.equal(publisher.requests.length,0);assert.equal(count(f.db,'publications'),1);
});
scenario('pending finalization failure blocks publisher until internal queue succeeds',async f=>{
  f.db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON notification_outbox WHEN NEW.publication_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'fixture fail'); END");
  const publisher=new FakePublisher();assert.equal((await tick(f,publisher)).status,'evidence_recovery_required');assert.equal(publisher.requests.length,1);
  assert.equal((await tick(f,publisher)).status,'evidence_pending');assert.equal(publisher.requests.length,1);
  f.db.exec('DROP TRIGGER fail_outbox');f.setNow('2026-10-05T03:01:00Z');await tick(f,publisher);assert.equal(count(f.db,'publications'),1);assert.equal(publisher.requests.length,1);
});
scenario('simultaneous ticks see committed intent while fake publisher awaits, with no transaction across await',async f=>{
  let release;const barrier=new Promise(resolve=>release=resolve);
  class Delayed extends FakePublisher{async publish(permit,now){f.tx.immediate(()=>assert.equal(count(f.db,'attempts'),1));await barrier;return super.publish(permit,now);}}
  const publisher=new Delayed(),first=tick(f,publisher);assert.equal((await tick(f,publisher)).status,'reconciliation_required');release();await first;
  assert.equal(publisher.requests.length,1);assert.equal(count(f.db,'publications'),1);
});
scenario('pause after committed intent preserves eventual evidence but prevents the next day send',async f=>{
  class Pausing extends FakePublisher{async publish(permit,now){setPaused(f.tx,{environment:'production',paused:true,actor:'owner',now});return super.publish(permit,now);}}
  const publisher=new Pausing();assert.equal((await tick(f,publisher)).status,'paused');assert.equal(count(f.db,'publications'),1);
  f.setNow('2026-10-06T03:00:00Z');await tick(f,publisher);assert.equal(publisher.requests.length,1);
});
scenario('maintenance does not mutate expiry/stock and never sends even with ready content',async f=>{
  f.db.exec("UPDATE application_state SET maintenance_owner='fixture-export' WHERE environment='production'");f.setNow('2026-10-06T03:00:00Z');
  const publisher=new FakePublisher();assert.equal((await tick(f,publisher)).status,'maintenance');assert.equal(count(f.db,'stock_alert_state'),0);
  assert.equal(f.db.prepare("SELECT status FROM schedule_slots WHERE business_date='2026-10-05'").get().status,'planned');assert.equal(publisher.requests.length,0);
});
test('real 40 briefs stay drafts and do not result in any fake publication or generated post',async()=>{
  const db=openCatalog(),tx=transactionStore(db);
  try{db.exec("INSERT INTO page_connections VALUES ('prod','production','fixture:production','LOCAL SIMULATION'); UPDATE application_state SET paused_by_user=0 WHERE environment='production'");
    importBriefs(db,JSON.parse(readFileSync(new URL('../content/content-plan-40.json',import.meta.url),'utf8')));enableSimulation(tx);configureSimulationSchedule(tx,{page:'prod',startDate:'2026-10-05'});
    const publisher=new FakePublisher();let id=0;const result=await runLocalTick(tx,publisher,{page:'prod',now:()=> '2026-10-05T03:00:00Z',id:()=>String(++id)});
    assert.equal(result.status,'stock_empty');assert.equal(count(db,'posts'),40);assert.equal(count(db,'publications'),0);assert.equal(publisher.requests.length,0);
  }finally{db.close();}
});
test('fake runner refuses real destinations even if simulation marker is force enabled',async()=>{
  const db=openCatalog(),tx=transactionStore(db);
  try{
    db.exec("INSERT INTO page_connections VALUES ('prod','production','real-page-id','Real destination')");
    assert.throws(()=>enableSimulation(tx),e=>e.code==='REAL_DESTINATION_FORBIDDEN');
    db.exec('UPDATE simulation_settings SET enabled=1 WHERE id=1');
    const publisher=new FakePublisher();await assert.rejects(runLocalTick(tx,publisher,{page:'prod',now:()=> '2026-10-05T03:00:00Z',id:()=> 'id'}),e=>e.code==='REAL_DESTINATION_FORBIDDEN');
    assert.equal(publisher.requests.length,0);
  }finally{db.close();}
});
scenario('unapproved adapter and invalid work budget cannot create attempts',async f=>{
  await assert.rejects(tick(f,{mode:'local_fake',publish:()=>{throw new Error('must not run');}}),e=>e.code==='FAKE_ADAPTER_REQUIRED');
  await assert.rejects(tick(f,new FakePublisher(),{budget:0}),e=>e.code==='INVALID_BUDGET');
  assert.equal(count(f.db,'attempts'),0);
});
