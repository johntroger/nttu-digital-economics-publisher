import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liveFixture,LIVE_TEST_TIME as now} from './helpers/production-live-fixture.mjs';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {runStagedProductionPublisher as run} from '../src/production/publisher-stages.ts';
import {pauseProductionPublisher,reconcileProductionPublisher} from '../src/production/publisher-live.ts';
import {ProductionMetaPublisher} from '../src/production/publisher-provider.ts';
const sends=f=>f.calls.filter(x=>x.method==='POST').length;
async function fixture(options={}){
 const f=await liveFixture(options);f.db.exec(productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherStages:true}).at(-1).sql);
 let offset=0;f.tick=async()=>{f.setTime(now+offset++*60000);return run(f.env,f.provider,f.now);};
 f.prepare=async()=>{assert.equal((await f.tick()).state,'content_prepared');assert.equal((await f.tick()).state,'image_prepared');assert.equal((await f.tick()).state,'connection_prepared');};return f;
}
test('F3 migration is explicit, atomic and closed; rollback guards live progress',async()=>{
 const f=await liveFixture();try{
  const m=productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherStages:true}).at(-1);assert.equal(productionMigrations(f.env.PRODUCTION_DATABASE_ID).length,14);
  f.db.exec('BEGIN');assert.throws(()=>f.db.exec(m.sql+'SELECT nonexistent_f3;'));f.db.exec('ROLLBACK');assert.equal(f.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,14);
  assert.equal((await run(f.env,f.provider,f.now)).state,'closed');assert.equal(f.calls.length,0);
  f.db.exec(m.sql);assert.equal((await run(f.env,f.provider,f.now)).state,'closed');assert.equal(f.calls.length,0);
  f.db.exec('BEGIN');f.db.exec(readFileSync('cloud/production-publisher-stages-rollback.sql','utf8'));f.db.exec('COMMIT');assert.equal(f.db.prepare('SELECT count(*) n FROM schema_migrations').get().n,14);
 }finally{f.db.close();}
});
test('F3 completes durable content/image/connection/POST/GET/finalization on six distinct ticks',async()=>{
 const f=await fixture({open:true});try{
  await f.prepare();assert.equal(sends(f),0);
  assert.equal((await f.tick()).state,'evidence_recorded');assert.equal(sends(f),1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_usage').get().n,0);
  assert.equal(f.calls.at(-1).method,'POST');assert.equal(f.db.prepare('SELECT state FROM production_publisher_attempts').get().state,'intent');
  assert.equal((await f.tick()).state,'evidence_verified');assert.equal(f.calls.at(-1).method,'GET');assert.equal(sends(f),1);
  assert.equal((await f.tick()).state,'confirmed');assert.equal(sends(f),1);
  const u=f.db.prepare('SELECT * FROM production_publisher_usage').get();assert.equal(u.caption,f.item.caption);assert.equal(u.checksum,f.item.imageChecksum);assert.equal(u.day,'2026-10-08');
  assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await run(f.env,f.provider,f.now)).state,'coalesced');
 }finally{f.db.close();}
});
test('F3 concurrent ticks and replacement Worker objects retain one journal, intent and POST',async()=>{
 const f=await fixture({open:true});try{
  assert.equal((await f.tick()).state,'content_prepared');f.setTime(now+60000);const image=await Promise.all([run({...f.env},f.provider,f.now),run({...f.env},f.provider,f.now)]);assert.equal(image.filter(r=>r.state==='image_prepared').length,1);
  f.setTime(now+120000);await run({...f.env},f.provider,f.now);f.setTime(now+180000);
  const r=await Promise.all([run({...f.env},f.provider,f.now),run({...f.env},f.provider,f.now)]);assert.equal(r.filter(x=>x.state==='evidence_recorded').length,1);assert.equal(sends(f),1);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,1);
  assert.throws(()=>f.db.exec(readFileSync('cloud/production-publisher-stages-rollback.sql','utf8')),/CHECK/);
 }finally{f.db.close();}
});
test('F3 prepares ahead of 10:00 but cannot POST before the immutable permit due time',async()=>{
 const f=await fixture({open:true});try{
  f.db.prepare("INSERT INTO production_send_permits SELECT 'prewarm',page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,?,revoked FROM production_send_permits").run(now-300000);
  f.db.prepare("DELETE FROM production_send_permits WHERE id='fixture-only-explicit-permit'").run();
  for(const [offset,state] of [[-180000,'content_prepared'],[-120000,'image_prepared'],[-60000,'connection_prepared']]){f.setTime(now+offset);assert.equal((await run(f.env,f.provider,f.now)).state,state);assert.equal(sends(f),0);}
  f.db.exec('UPDATE production_publisher_runtime SET last_bucket=NULL');f.setTime(now-30000);assert.equal((await run(f.env,f.provider,f.now)).state,'not_due');assert.equal(sends(f),0);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,0);
  f.setTime(now);assert.equal((await run(f.env,f.provider,f.now)).state,'evidence_recorded');assert.equal(sends(f),1);
 }finally{f.db.close();}
});
test('F3 fails closed on selected source, binding, token, release, operation generation or expiry changes',async()=>{
 for(const mode of ['source','binding','token','release','generation','expiry','bytes','prerequisite']){
  const f=await fixture({open:true});try{await f.prepare();
   if(mode==='source')f.db.exec("UPDATE sources SET status='blocked'");
   if(mode==='binding')f.db.exec("UPDATE asset_bindings SET checksum='changed'");
   if(mode==='token')f.env.META_PAGE_ACCESS_TOKEN+='changed';
   if(mode==='release')f.env.RELEASE_SHA='f'.repeat(40);
   if(mode==='generation')f.db.exec('UPDATE application_state SET operation_generation=operation_generation+1');
   if(mode==='expiry')f.db.prepare('UPDATE production_publisher_preparation SET proof_expires_at=?').run(now+120000);
   if(mode==='bytes')f.env.MEDIA.get=async()=>({size:5000,arrayBuffer:async()=>new Uint8Array(5000).buffer});
   if(mode==='prerequisite')f.db.prepare('INSERT INTO post_prerequisites VALUES(?,?)').run(f.item.postId,f.db.prepare("SELECT id FROM posts WHERE content_key='P02'").get().id);
   try{await f.tick();}catch(e){assert.equal(mode,'bytes');assert.match(e.message,/FILE_INTEGRITY/);}
   assert.equal(sends(f),0,mode);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,0,mode);
  }finally{f.db.close();}
 }
});
test('F3 pause/revocation between phases or immediately after intent never dispatches',async()=>{
 for(const mode of ['pause','revoke','intent']){const f=await fixture({open:true});try{await f.prepare();
  if(mode==='pause')await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com',f.now());
  if(mode==='revoke')f.db.exec('UPDATE production_send_permits SET revoked=1');
  if(mode==='intent'){const b=f.env.DB.batch;f.env.DB.batch=async q=>{const r=await b(q);if(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n)f.db.exec('UPDATE application_state SET paused_by_user=1');return r;};}
  await f.tick();assert.equal(sends(f),0);
  if(mode==='intent'){assert.equal(f.db.prepare('SELECT state FROM production_publisher_jobs').get().state,'requested');assert.equal((await f.tick()).state,'unknown');assert.ok(f.db.prepare('SELECT active_job FROM production_publisher_config').get().active_job);}
 }finally{f.db.close();}}
});
test('F3 5xx/lost response/mismatched GET retain unknown across days without automatic repost',async()=>{
 for(const outcome of ['5xx','throw','mismatch']){const f=await fixture({open:true,outcome});try{await f.prepare();await f.tick();assert.equal((await f.tick()).state,'unknown');f.setTime(now+86400000);assert.equal((await run(f.env,f.provider,f.now)).state,'unknown');assert.equal(sends(f),1);assert.ok(f.db.prepare('SELECT active_job FROM production_publisher_config').get().active_job);}finally{f.db.close();}}
});
test('F3 crash after POST before evidence cannot retry; lease expiry durably records unknown',async()=>{
 const f=await fixture({open:true});try{await f.prepare();const original=f.env.DB.prepare;
  f.env.DB.prepare=q=>{if(q.startsWith('INSERT INTO production_publisher_evidence'))throw Error('crash before evidence');return original(q);};
  await assert.rejects(f.tick(),/crash before evidence/);assert.equal(sends(f),1);f.env.DB.prepare=original;
  assert.equal((await f.tick()).state,'evidence_recorded');assert.equal((await f.tick()).state,'unknown');assert.equal(sends(f),1);
  const t=f.db.prepare('SELECT id FROM production_publisher_attempts').get().id;assert.equal((await reconcileProductionPublisher(f.env,f.provider,t,f.remote,f.now)).state,'confirmed');assert.equal(sends(f),1);
 }finally{f.db.close();}
});
test('F3 durable verified evidence survives finalizer rollback and recovers while paused',async()=>{
 const f=await fixture({open:true});try{await f.prepare();await f.tick();await f.tick();f.db.exec("CREATE TRIGGER f3_fail BEFORE INSERT ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'finalizer rollback'); END");
  await assert.rejects(f.tick(),/finalizer rollback/);assert.equal(f.db.prepare('SELECT applied FROM production_publisher_evidence').get().applied,0);
  f.db.exec('DROP TRIGGER f3_fail');await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com',f.now());assert.equal((await f.tick()).state,'confirmed');assert.equal(sends(f),1);
 }finally{f.db.close();}
});
test('F3 exact retryable errors wait five minutes, reprepare and stop after three attempts',async()=>{
 const f=await fixture({open:true,outcome:'retryable'});try{await f.prepare();await f.tick();assert.equal((await f.tick()).state,'retry_wait');assert.equal((await f.tick()).state,'retry_wait');
  // Keep moving one phase at a time, including each backoff and new byte/Meta proof.
  for(let i=0;i<24;i++)await f.tick();assert.equal(sends(f),3);assert.equal(f.db.prepare('SELECT state FROM production_publisher_jobs').get().state,'failed');assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,3);
 }finally{f.db.close();}
});
test('F3 rejects expired lease, source change after projection and Vietnam midnight before intent',async()=>{
 for(const mode of ['lease','source','midnight']){const f=await fixture({open:true});try{await f.prepare();const original=f.env.DB.batch;
  f.env.DB.batch=async q=>{if(q.length===2){if(mode==='source')f.db.exec("UPDATE sources SET status='blocked'");if(mode==='lease')f.db.exec('UPDATE production_publisher_runtime SET lease_until=0');}return original(q);};
  if(mode==='midnight'){f.setTime(Date.parse('2026-10-08T17:00:00Z'));await run(f.env,f.provider,f.now);}else await f.tick();assert.equal(sends(f),0);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,0);
 }finally{f.db.close();}}
});
test('F3 stock scans one version per tick, includes current approvals and restarts on warehouse changes',async()=>{
 const f=await fixture();try{f.db.exec('UPDATE production_publisher_config SET stock_pending=1');assert.equal((await f.tick()).state,'stock_started');assert.equal((await f.tick()).state,'stock_item');assert.equal(f.db.prepare('SELECT cursor,remaining FROM production_publisher_stock_scan').get().remaining,1);
  f.db.exec("UPDATE sources SET status='blocked'");assert.equal((await f.tick()).state,'stock_restart');assert.equal((await f.tick()).state,'stock_started');
  for(let i=0;i<41;i++)await f.tick();assert.equal(f.db.prepare('SELECT stock_pending,stock_level FROM production_publisher_config').get().stock_level,'empty');assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,1);assert.equal(sends(f),0);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_stock_scan').get().n,0);
 }finally{f.db.close();}
});

test('F4 SQL approval receipt cannot change and detects eligibility edits before and after intent',async()=>{
 for(const mode of ['version','source','expiry','after-intent']){const f=await fixture({open:true});try{await f.prepare();
  assert.throws(()=>f.db.exec("UPDATE production_publisher_preparation SET approval_snapshot='[]'"),/immutable/);
  assert.throws(()=>f.db.prepare("UPDATE post_versions SET body=body||' changed' WHERE id=?").run(f.item.versionId),/save a new editor version/);
  if(mode==='version')f.db.prepare("UPDATE post_versions SET status='quarantined' WHERE id=?").run(f.item.versionId);
  if(mode==='source')f.db.exec("UPDATE sources SET status='blocked'");
  if(mode==='expiry')f.db.exec("UPDATE sources SET review_due_at='2026-10-08T02:02:30.000Z'");
  if(mode==='after-intent'){const original=f.env.DB.batch;f.env.DB.batch=async q=>{const r=await original(q);if(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n)f.db.exec("UPDATE sources SET status='blocked'");return r;};}
  await f.tick();assert.equal(sends(f),0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,mode==='after-intent'?1:0);
 }finally{f.db.close();}}
});

test('F4 approval read and SQL snapshot are atomic; intervening edits cannot create a preparation receipt',async()=>{
 const f=await fixture({open:true});try{const original=f.env.DB.batch;
  f.env.DB.batch=async q=>{const r=await original(q);if(q.length===6)f.db.exec("UPDATE sources SET status='blocked'");return r;};
  assert.equal((await f.tick()).state,'claim_lost');assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_preparation').get().n,0);
  assert.equal(sends(f),0);
 }finally{f.db.close();}
});
