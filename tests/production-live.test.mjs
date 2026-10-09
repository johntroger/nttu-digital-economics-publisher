import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture,LIVE_TEST_TIME as now} from './helpers/production-live-fixture.mjs';
import {runProductionPublisher,publisherPreflight,pauseProductionPublisher,publisherAuthorized,reconcileProductionPublisher} from '../src/production/publisher-live.ts';
import {ProductionMetaPublisher,publicationHash,PRODUCTION_PAGE} from '../src/production/publisher-provider.ts';
const sends=f=>f.calls.filter(c=>c.method==='POST').length;

test('publisher hashes and uploads only the exact image slice, excluding surrounding buffer bytes',async()=>{
 const f=await liveFixture();try{
  const image=f.imageBytes.get(f.item.key);assert.ok(image);const backing=new Uint8Array(image.length+2);backing.fill(99);backing.set(image,1);const bytes=backing.subarray(1,-1),checksum=await publicationHash(image);
  assert.equal(await publicationHash(bytes),checksum);assert.notEqual(await publicationHash(backing),checksum);
  let uploads=0;const provider=new ProductionMetaPublisher(f.env,async(url,init)=>{uploads++;assert.equal(init.method,'POST');assert.deepEqual(new Uint8Array(await init.body.get('source').arrayBuffer()),new Uint8Array(image));return Response.json({post_id:f.remote});});
  assert.equal((await provider.dispatch({attemptId:'image-slice',pageId:PRODUCTION_PAGE,caption:f.item.caption,checksum,bytes,sentAt:now})).kind,'unknown');assert.equal(uploads,1);
  if(typeof SharedArrayBuffer!=='undefined'){const shared=new SharedArrayBuffer(backing.length);new Uint8Array(shared).set(backing);assert.equal(await publicationHash(new Uint8Array(shared,1,image.length)),checksum);}
 }finally{f.db.close();}
});
test('Live schema migration remains disabled, empty and transactional; closed tick never touches a provider',async()=>{
 const f=await liveFixture();try{
  const before=f.db.prepare('SELECT total_changes() n').get().n,p=await publisherPreflight(f.env,now);assert.equal(p.state,'closed');assert.equal(p.counts.permits,0);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
  assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'closed');assert.equal(f.calls.length,0);
  assert.equal(f.db.prepare('SELECT heartbeat_count n FROM production_publisher_runtime').get().n,1);
  for(const t of ['production_publisher_jobs','production_publisher_usage','production_send_permits','publish_jobs','publications','schedule_slots'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
  await assert.rejects(runProductionPublisher(f.env,{},f.now),/EXPLICIT_LIVE_PROVIDER/);
  assert.throws(()=>new ProductionMetaPublisher(f.env),/EXPLICIT_META_TRANSPORT/);
 }finally{f.db.close();}
});
test('Checksum-pinned image bytes and explicit permit produce one correlated native-SQL publication; duplicate/day sends are suppressed',async()=>{
 const f=await liveFixture({open:true});try{const r=await runProductionPublisher(f.env,f.provider,f.now);assert.equal(r.state,'confirmed');assert.equal(sends(f),1);assert.ok(r.queries<=50,r.queries);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'coalesced');f.setTime(now+60000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'day_complete');assert.equal(sends(f),1);const usage=f.db.prepare('SELECT * FROM production_publisher_usage').get();assert.equal(usage.remote_id,f.remote);assert.equal(usage.caption,f.item.caption);assert.equal(usage.checksum,f.item.imageChecksum);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{f.db.close();}
});
test('Concurrent HTTP invocations claim one intent and one POST',async()=>{
 const f=await liveFixture({open:true});try{const r=await Promise.all([runProductionPublisher(f.env,f.provider,f.now),runProductionPublisher(f.env,f.provider,f.now)]);assert.equal(sends(f),1);assert.equal(r.filter(r=>r.state==='confirmed').length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,1);}finally{f.db.close();}
});
test('Timeout, 5xx, lost response and caption mismatch hold Page lock across days with zero automatic repost',async()=>{
 for(const outcome of ['5xx','throw','mismatch']){const f=await liveFixture({open:true,outcome});try{assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'unknown');f.setTime(now+86400000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'unknown');assert.equal(sends(f),1);await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com',f.now());assert.ok(f.db.prepare('SELECT active_job FROM production_publisher_config').get().active_job);}finally{f.db.close();}}
});
test('Durable evidence survives finalizer rollback; paused recovery finishes without POST',async()=>{
 const f=await liveFixture({open:true});try{f.db.exec("CREATE TRIGGER fail_live_finalizer BEFORE INSERT ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'rollback finalizer'); END");await assert.rejects(runProductionPublisher(f.env,f.provider,f.now),/rollback finalizer/);assert.equal(sends(f),1);assert.equal(f.db.prepare('SELECT applied FROM production_publisher_evidence').get().applied,0);f.db.exec('DROP TRIGGER fail_live_finalizer');await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com');f.setTime(now+60000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'confirmed');assert.equal(sends(f),1);}finally{f.db.close();}
});
test('Explicit rate-limit retries wait five minutes and stop after three; reserve needs its own permit on another invocation',async()=>{
 const f=await liveFixture({open:true,outcome:'retryable'});try{assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'retry_wait');f.setTime(now+60000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'retry_wait');assert.equal(sends(f),1);for(const offset of [300000,600000]){f.setTime(now+offset);await runProductionPublisher(f.env,f.provider,f.now);}assert.equal(sends(f),3);assert.equal(f.db.prepare('SELECT state FROM production_publisher_jobs').get().state,'failed');f.setTime(now+660000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'publication_approval_required');assert.equal(sends(f),3);}finally{f.db.close();}
});
test('R2 corruption, absent permit and changed token prevent POST',async()=>{
 for(const mode of ['bytes','permit','token']){const f=await liveFixture({open:true});try{if(mode==='bytes')f.env.MEDIA.get=async()=>({size:5000,arrayBuffer:async()=>new Uint8Array(5000).buffer});if(mode==='permit')f.db.exec('DELETE FROM production_send_permits');if(mode==='token')f.env.META_PAGE_ACCESS_TOKEN+='changed';try{await runProductionPublisher(f.env,f.provider,f.now);}catch(e){assert.equal(mode,'bytes');assert.match(e.message,/FILE_INTEGRITY_FAILED/);}assert.equal(sends(f),0);}finally{f.db.close();}}
});
test('Pause/source revocation after network preflight blocks the durable intent',async()=>{
 for(const mode of ['pause','source']){const f=await liveFixture({open:true,hook:async(url,init,{db})=>{if(url.pathname.endsWith('/me')){if(mode==='pause')db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");else db.exec("UPDATE sources SET status='needs_review'");}}});try{await runProductionPublisher(f.env,f.provider,f.now);assert.equal(sends(f),0);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,0);}finally{f.db.close();}}
});
test('Telegram/monitor credentials cannot authorize publisher; explicit new capability must differ',async()=>{
 const f=await liveFixture();try{const request=token=>new Request('https://example.invalid/',{headers:{Authorization:'Bearer '+token}});f.env.PRODUCTION_TRIGGER_TOKEN='a'.repeat(64);f.env.PRODUCTION_MONITOR_TOKEN='b'.repeat(64);assert.equal(await publisherAuthorized(request(f.env.PRODUCTION_TRIGGER_TOKEN),f.env),false);f.env.PRODUCTION_PUBLISHER_TOKEN=f.env.PRODUCTION_TRIGGER_TOKEN;assert.equal(await publisherAuthorized(request(f.env.PRODUCTION_TRIGGER_TOKEN),f.env),false);f.env.PRODUCTION_PUBLISHER_TOKEN='c'.repeat(64);assert.equal(await publisherAuthorized(request(f.env.PRODUCTION_TRIGGER_TOKEN),f.env),false);assert.equal(await publisherAuthorized(request(f.env.PRODUCTION_PUBLISHER_TOKEN),f.env),true);}finally{f.db.close();}
});
test('A pause immediately after committed intent suppresses POST and preserves unknown',async()=>{
 const f=await liveFixture({open:true});try{const original=f.env.DB.batch;f.env.DB.batch=async statements=>{const r=await original(statements);if(f.db.prepare("SELECT count(*) n FROM production_publisher_attempts WHERE state='intent'").get().n)f.db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'");return r;};assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'unknown');assert.equal(sends(f),0);assert.equal(f.db.prepare('SELECT state FROM production_publisher_jobs').get().state,'unknown');}finally{f.db.close();}
});
test('A remote hint alone cannot unlock unknown; a correlated GET can finalize without POST',async()=>{
 const f=await liveFixture({open:true,outcome:'throw'});try{await runProductionPublisher(f.env,f.provider,f.now);const t=f.db.prepare('SELECT id FROM production_publisher_attempts').get().id;assert.equal((await reconcileProductionPublisher(f.env,f.provider,t,'551227411605506_123456',f.now)).state,'unknown');assert.equal((await reconcileProductionPublisher(f.env,f.provider,t,f.remote,f.now)).state,'confirmed');assert.equal(sends(f),1);assert.equal(f.db.prepare('SELECT state FROM production_publisher_jobs').get().state,'confirmed');}finally{f.db.close();}
});
