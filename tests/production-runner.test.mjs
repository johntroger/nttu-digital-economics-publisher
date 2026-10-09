import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runnerFixture} from './helpers/production-runner-http.mjs';
import {LIVE_TEST_TIME as now} from './helpers/production-live-fixture.mjs';
import {runSimulatedActionsRunner as run,runSimulatedRunnerMonitor,simulatedClient} from '../scripts/production-actions-runner.mjs';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
const count=(f,table)=>f.db.prepare('SELECT count(*) n FROM '+table).get().n;
test('F5 is opt-in, transactional and has a rollback guard; defaults do not add runner migration',async()=>{
 const f=await runnerFixture({open:false});try{assert.equal(productionMigrations(f.env.PRODUCTION_DATABASE_ID).length,14);assert.equal(productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherRunner:true}).length,16);assert.equal((await run(f.options)).state,'closed');assert.equal(f.postCount(),0);f.db.exec('BEGIN');f.db.exec(readFileSync('cloud/production-publisher-runner-rollback.sql','utf8'));f.db.exec('COMMIT');assert.equal(count(f,'schema_migrations'),15);assert.equal(count(f,'posts'),40);}finally{await f.dispose();}
});
test('F5 HTTP multipart + native SQLite publishes one mock post and retains all warehouse rows',async()=>{
 const f=await runnerFixture();try{const posts=count(f,'posts'),assets=count(f,'assets');const r=await run(f.options);assert.equal(r.state,'confirmed',JSON.stringify(r));assert.equal(f.postCount(),1);assert.equal(count(f,'production_publisher_usage'),1);assert.equal(count(f,'posts'),posts);assert.equal(count(f,'assets'),assets);assert.equal(count(f,'production_publisher_attempts'),1);assert.equal((await run(f.options)).state,'day_complete');assert.equal(f.postCount(),1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{await f.dispose();}
});
test('F5 concurrent HTTP runners produce one intent and one POST',async()=>{
 const f=await runnerFixture();try{const results=await Promise.all([run(f.options),run(f.options)]);assert.equal(results.filter(x=>x.state==='confirmed').length,1,JSON.stringify(results));assert.equal(f.postCount(),1);assert.equal(count(f,'production_publisher_attempts'),1);}finally{await f.dispose();}
});
test('F5 proof rechecks mutable approval at the write even after earlier reads succeeded',async()=>{
 for(const mode of ['pause','source','version']){
  const f=await runnerFixture();try{
   const prepare=f.env.DB.prepare.bind(f.env.DB);let changed=false;
   f.env.DB.prepare=sql=>{if(!changed&&sql.includes('UPDATE production_runner_sessions SET image_bytes=')){
    changed=true;
    if(mode==='pause')f.db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");
    if(mode==='source')f.db.exec("UPDATE sources SET status='blocked'");
    if(mode==='version')f.db.exec('UPDATE post_versions SET check_version=check_version+1');
   }return prepare(sql);};
   const result=await run(f.options);assert.equal(changed,true);assert.equal(result.state,'held_or_closed');assert.equal(f.postCount(),0);assert.equal(count(f,'production_publisher_attempts'),0);assert.equal(f.db.prepare('SELECT image_bytes FROM production_runner_sessions').get().image_bytes,null);
  }finally{await f.dispose();}
 }
});
test('F5 every data group denies rows when the approval changes after claim',async()=>{
 for(let group=0;group<5;group++){
  const f=await runnerFixture();try{
   const runner=randomUUID(),claim=await f.request('/runner/claim',{runner}),held=await claim.json();assert.equal(held.state,'held');
   f.db.exec("UPDATE sources SET status='blocked'");
   const response=await f.request('/runner/data',{job:held.job,runner,group,offset:0}),body=await response.json();assert.equal(response.status,409);assert.equal(body.error,'RUNNER_APPROVAL_CHANGED');assert.equal(body.rows,undefined);assert.equal(f.postCount(),0);assert.equal(count(f,'production_publisher_attempts'),0);
  }finally{await f.dispose();}
 }
});
test('F5 compact data gate never returns rows after pause, revoke, generation or lease changes',async()=>{
 for(const mode of ['pause','permit','generation','lease','release','owner','identity']){
  const f=await runnerFixture();try{
   const runner=randomUUID(),held=await (await f.request('/runner/claim',{runner})).json();assert.equal(held.state,'held');
   if(mode==='pause')f.db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");
   if(mode==='permit')f.db.exec('UPDATE production_send_permits SET revoked=1');
   if(mode==='generation')f.db.exec('UPDATE application_state SET operation_generation=operation_generation+1');
   if(mode==='lease')f.setTime(now+180001);
   if(mode==='release')f.env.RELEASE_SHA='f'.repeat(40);
   if(mode==='identity')f.env.PRODUCTION_DATABASE_ID='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
   const response=await f.request('/runner/data',{job:held.job,runner:mode==='owner'?randomUUID():runner,group:1,offset:0}),body=await response.json();
   assert.ok(response.status>=400,mode);assert.equal(body.rows,undefined,mode);assert.equal(f.postCount(),0);assert.equal(count(f,'production_publisher_attempts'),0);
  }finally{await f.dispose();}
 }
});
test('F5 pause/revocation and source/version changes before or after intent never POST',async()=>{
 for(const stage of ['before_intent','after_intent'])for(const mode of ['pause','permit','source','version','generation','release']){
  const f=await runnerFixture();try{const r=await run({...f.options,hook:async point=>{if(point!==stage)return;if(mode==='pause')f.db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");if(mode==='permit')f.db.exec('UPDATE production_send_permits SET revoked=1');if(mode==='source')f.db.exec("UPDATE sources SET status='blocked'");if(mode==='version')f.db.exec('UPDATE post_versions SET check_version=check_version+1');if(mode==='generation')f.db.exec('UPDATE application_state SET operation_generation=operation_generation+1');if(mode==='release')f.env.RELEASE_SHA='f'.repeat(40);}});assert.equal(f.postCount(),0,stage+mode+JSON.stringify(r));assert.equal(count(f,'production_publisher_attempts'),stage==='before_intent'?0:1);}finally{await f.dispose();}
 }
});
test('F5 crash points recover GET/evidence only; missing remote hints hold unknown',async()=>{
 for(const stage of ['after_intent','after_authorize','after_post','after_hint','after_get','after_evidence']){
  const f=await runnerFixture();try{let thrown=false;const first=await run({...f.options,hook:async p=>{if(p===stage&&!thrown){thrown=true;throw Error('SIMULATED_CRASH');}}});assert.equal(first.state,'needs_reconciliation',stage+JSON.stringify(first));const before=f.postCount();f.db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");const recovery=await run(f.options);assert.equal(f.postCount(),before);assert.equal(recovery.state,['after_hint','after_get','after_evidence'].includes(stage)?'confirmed':'unknown',stage+JSON.stringify(recovery));assert.equal(count(f,'production_publisher_attempts'),1);}finally{await f.dispose();}
 }
});
test('F5 lost callback response and failed finalizer keep durable evidence and never repost',async()=>{
 for(const mode of ['callback','finalizer']){
  const f=await runnerFixture();try{if(mode==='finalizer')f.db.exec("CREATE TRIGGER fail_f5_finalizer BEFORE INSERT ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'rollback'); END");let lost=false;const original=fetch;const transport=async(url,init)=>{const r=await original(url,init);if(mode==='callback'&&new URL(url).pathname==='/runner/evidence'&&!lost){lost=true;throw Error('LOST_CALLBACK');}return r;};const first=await run({...f.options,transport});assert.equal(first.state,'needs_reconciliation',JSON.stringify(first));assert.equal(f.postCount(),1);assert.equal(count(f,'production_publisher_evidence'),1);if(mode==='finalizer')f.db.exec('DROP TRIGGER fail_f5_finalizer');assert.equal((await run(f.options)).state,'confirmed');assert.equal(f.postCount(),1);}finally{await f.dispose();}
 }
});
test('F5 explicit retryable outcome waits five minutes; timeouts and mismatches never retry POST',async()=>{
 const f=await runnerFixture({outcome:'retryable'});try{assert.equal((await run(f.options)).state,'retry_wait');f.setTime(now+60000);assert.equal((await run(f.options)).state,'retry_wait');assert.equal(f.postCount(),1);f.setTime(now+300000);f.setOutcome('confirmed');assert.equal((await run(f.options)).state,'confirmed');assert.equal(f.postCount(),2);}finally{await f.dispose();}
 for(const outcome of ['throw','mismatch']){const f=await runnerFixture({outcome});try{assert.equal((await run(f.options)).state,'unknown');f.setTime(now+86400000);assert.equal((await run(f.options)).state,'unknown');assert.equal(f.postCount(),1);}finally{await f.dispose();}}
});
test('F5 image corruption, quota exhaustion and invalid network origin never create intent',async()=>{
 const f=await runnerFixture();try{assert.equal((await run({...f.options,quotaAllowed:false})).state,'quota_blocked');assert.equal(count(f,'production_publisher_jobs'),0);assert.throws(()=>simulatedClient({...f.options,apiOrigin:'https://nttu-publisher-production.nttu-kts-johntroger.workers.dev'}),/LOOPBACK/);f.env.MEDIA.get=async()=>({size:f.item.imageChecksum?f.imageBytes.get('P01').length:0,arrayBuffer:async()=>new Uint8Array(f.imageBytes.get('P01').length).buffer});assert.equal((await run(f.options)).state,'held_or_closed');assert.equal(f.postCount(),0);assert.equal(count(f,'production_publisher_attempts'),0);}finally{await f.dispose();}
});
test('F5 API rejects clock/Page/SQL injection, unscoped credentials, oversized bodies and repeated grants',async()=>{
 const f=await runnerFixture();try{
  for(const bad of ['b'.repeat(64),'c'.repeat(64),'d'.repeat(64)])assert.equal((await f.request('/runner/claim',{runner:randomUUID()},bad)).status,401);
  assert.equal((await f.request('/runner/status',{},'b'.repeat(64))).status,200);
  for(const body of [{runner:randomUUID(),at:now},{runner:randomUUID(),pageId:'551227411605506'},{runner:randomUUID(),sql:'DELETE FROM posts'},{runner:randomUUID(),padding:'x'.repeat(9000)}])assert.ok((await f.request('/runner/claim',body)).status>=400);
  const r=await run({...f.options,hook:async(stage,{job,attempt,runner})=>{if(stage==='after_authorize'){const g=f.db.prepare('SELECT grant_id FROM production_runner_grants').get().grant_id;const again=await (await f.request('/runner/authorize',{job,attempt,runner,grant:g})).json();assert.equal(again.dispatch,false);}}});assert.equal(r.state,'confirmed');assert.equal(f.postCount(),1);
  const attempt=f.db.prepare('SELECT id FROM production_publisher_attempts').get().id,job=f.db.prepare('SELECT id FROM production_publisher_jobs').get().id;
  const bad=await f.request('/runner/evidence',{runner:randomUUID(),job,attempt,result:{kind:'confirmed',attemptId:attempt,pageId:'551227411605506',remoteId:f.remote,captionHash:'e'.repeat(64),checksum:f.item.imageChecksum,confirmedAt:now}});assert.ok(bad.status>=400);assert.equal(count(f,'production_publisher_usage'),1);
 }finally{await f.dispose();}
});
test('F5 monitor reads fresh pause/generation after mocked provider verification',async()=>{
 const f=await runnerFixture({graphHook:async(url,req,{db})=>{if(url.pathname.endsWith('/me'))db.exec("UPDATE application_state SET paused_by_user=1,operation_generation=operation_generation+1 WHERE environment='production'");}});try{const r=await runSimulatedRunnerMonitor(f.options);assert.equal(r.enabled,false);assert.equal(r.paused,true);assert.equal(r.connectionVerified,true);assert.equal(f.postCount(),0);}finally{await f.dispose();}
});
test('F5 expired lease/proof, wrong day and elapsed runner budget never POST',async()=>{
 for(const mode of ['lease','proof','day','budget']){const f=await runnerFixture();try{
  const r=await run({...f.options,...(mode==='budget'?{maxMs:1}:{}),hook:async stage=>{
   if(stage==='before_intent'){if(mode==='lease')f.setTime(now+180001);if(mode==='proof')f.setTime(now+60001);if(mode==='day')f.setTime(now+86400000);}
  }});assert.equal(f.postCount(),0,mode+JSON.stringify(r));assert.equal(count(f,'production_publisher_attempts'),0);
 }finally{await f.dispose();}}
});
test('F5 held lease takeover requires expiry; rollback blocks unresolved intent',async()=>{
 const f=await runnerFixture();try{const first=await run({...f.options,hook:async stage=>{if(stage==='before_image')throw Error('SIMULATED_CRASH');}});assert.equal(first.state,'held_or_closed');assert.equal((await run(f.options)).state,'leased');f.setTime(now+180001);assert.equal((await run(f.options)).state,'confirmed');assert.equal(f.postCount(),1);}finally{await f.dispose();}
 const g=await runnerFixture();try{await run({...g.options,hook:async stage=>{if(stage==='after_intent')throw Error('SIMULATED_CRASH');}});g.db.exec('BEGIN');assert.throws(()=>g.db.exec(readFileSync('cloud/production-publisher-runner-rollback.sql','utf8')),/CHECK/);g.db.exec('ROLLBACK');assert.equal(count(g,'production_publisher_attempts'),1);assert.equal(g.postCount(),0);const status=await (await g.request('/runner/status',{},'b'.repeat(64))).json();assert.equal(status.state,'requested');assert.equal(status.enabled,false);}finally{await g.dispose();}
});
