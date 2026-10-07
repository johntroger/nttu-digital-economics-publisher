import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {managementFixture} from './cloud-management-smoke.mjs';
import {PRODUCTION_FIXTURE_SCHEMA} from '../src/production/publisher-fixture-schema.ts';
import {FakeProductionPublisher,runProductionSimulation,reconcileProductionSimulation} from '../src/production/publisher-simulation.ts';
import {workflowFixture} from '../tests/helpers/workflow-fixture.mjs';
import {composeCaption} from '../src/domain/footer.ts';
import {readCatalog} from '../src/storage/catalog.ts';
import worker from '../src/cloud/worker.ts';
import {nativeProductionPublisher} from './production-publisher-native.mjs';

export async function runProductionPublisherSmoke({bundlePath}={}){
  const f=await managementFixture({testOnlyMigration:PRODUCTION_FIXTURE_SCHEMA});
  const env={...f.env,APP_ENV:'test',INTEGRATION_MODE:'fake'},DB=env.DB;
  const sql=(q,...args)=>DB.prepare(q).bind(...args);
  const results=[];
  const reset=async()=>{
    await DB.batch(['production_fixture_evidence','production_fixture_outbox','production_fixture_stock','production_fixture_usage','production_fixture_attempts','production_fixture_jobs','production_fixture_slots','production_fixture_posts','production_fixture_config'].map(table=>sql('DELETE FROM '+table)));
    await sql("INSERT INTO production_fixture_config(id,identity,target,start_date,paused,page,database_id,bucket,deployment_gate,owner_gate,connection_gate) VALUES(1,'isolated-d1-fixture','fixture:d1','2026-10-05',0,'817593604765443','09cdecc7-36a2-4196-950e-ef68b1ecd834','nttu-publisher-production-assets',1,1,1)").run();
    const local=workflowFixture({mains:2,reserves:2}),posts=readCatalog(local.tx);local.db.close();
    for(const p of posts)p.productionReceipt={versionId:p.versionId,body:p.body,caption:composeCaption(p.body),imageChecksum:p.asset.checksum};
    await DB.batch(posts.map(p=>sql('INSERT INTO production_fixture_posts(id,payload) VALUES (?,?)',p.postId,JSON.stringify(p))));
    await DB.batch([sql("INSERT INTO production_fixture_slots VALUES('2026-10-05','p1','open')"),sql("INSERT INTO production_fixture_slots VALUES('2026-10-06','p2','open')")]);
  };
  let time=Date.parse('2026-10-05T03:00:00Z');
  const now=()=>time,run=p=>runProductionSimulation(env,{publisher:p,now,budget:4});
  try{
    await reset();
    let release,started;const start=new Promise(r=>started=r),barrier=new Promise(r=>release=r);
    const parallel=new FakeProductionPublisher(async r=>{started();await barrier;return{kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time};});
    const first=run(parallel);await start;assert.equal((await run(parallel)).status,'in_flight');release();assert.equal((await first).status,'confirmed');
    assert.equal(parallel.calls.length,1);assert.equal((await sql('SELECT count(*) n FROM production_fixture_usage').first()).n,1);
    results.push('D1 concurrent ticks: one intent, one send, atomic usage/outbox');
    await reset();
    const retries=new FakeProductionPublisher(async r=>r.postId==='p1'?{kind:'retryable'}:{kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time});
    assert.equal((await run(retries)).status,'retry_wait');time+=299000;await run(retries);assert.equal(retries.calls.length,1);time+=1000;await run(retries);time+=300000;assert.equal((await run(retries)).status,'confirmed');assert.equal(retries.calls.length,4);
    const events=(await sql('SELECT payload_json,event_id FROM production_fixture_outbox').all()).results;
    for(const event of events){const payload=JSON.parse(event.payload_json);assert.equal(payload.environment,'production');assert.equal(payload.simulation,true);}
    results.push('D1 retries: 5 minutes / 3 attempts, same-day reserve and isolated notification intents');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    const lost=new FakeProductionPublisher(async()=>{throw Error('simulated lost response');});assert.equal((await run(lost)).status,'reconciliation_required');
    // A fresh runner instance reads durable state rather than an in-memory flag.
    const fresh=new FakeProductionPublisher(async()=>{throw Error('must not be called');});time+=86400000;
    assert.equal((await run(fresh)).status,'reconciliation_required');assert.equal(fresh.calls.length,0);
    const attempt=(await sql('SELECT id FROM production_fixture_attempts').first()).id;
    await reconcileProductionSimulation(env,fresh,attempt,{kind:'confirmed',remoteId:'fixture:verified-late',confirmedAt:time},time);
    assert.equal((await run(fresh)).status,'day_complete');assert.equal((await sql('SELECT day FROM production_fixture_usage').first()).day,'2026-10-06');
    results.push('D1 lost response and fresh runner: no repost; verified late receipt protects actual day');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    let batches=0;const original=DB.batch.bind(DB);env.DB={...DB,prepare:DB.prepare.bind(DB),batch:async statements=>{batches++;if(batches===3)throw Error('receipt failpoint');return original(statements);}};
    const crash=new FakeProductionPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time}));await assert.rejects(run(crash),/receipt failpoint/);env.DB=DB;time+=61000;
    assert.equal((await run(crash)).status,'day_complete');assert.equal(crash.calls.length,1);assert.equal((await sql('SELECT count(*) n FROM production_fixture_usage').first()).n,1);
    results.push('D1 finalizer crash: durable evidence survives and recovers without retry');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    await sql("CREATE TRIGGER fixture_abort_receipt BEFORE INSERT ON production_fixture_usage BEGIN SELECT RAISE(ABORT,'injected D1 transaction failure'); END").run();
    const rollback=new FakeProductionPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time}));await assert.rejects(run(rollback));
    assert.equal((await sql('SELECT state FROM production_fixture_jobs').first()).state,'requested');assert.equal((await sql('SELECT state FROM production_fixture_attempts').first()).state,'intent');assert.equal((await sql('SELECT count(*) n FROM production_fixture_outbox').first()).n,0);
    await sql('DROP TRIGGER fixture_abort_receipt').run();time+=61000;assert.equal((await run(rollback)).status,'day_complete');assert.equal(rollback.calls.length,1);
    results.push('Actual D1 failed transaction rolls back receipt/usage/outbox together, preserving durable evidence');
    await assert.rejects(runProductionSimulation(f.env,{publisher:crash,now}),/ISOLATED/);
    assert.equal((await sql('SELECT count(*) n FROM publications').first()).n,0);assert.equal((await sql('SELECT count(*) n FROM notification_outbox').first()).n,0);
    const response=await worker.fetch(new Request(f.origin+'/api/workflow',{headers:{Cookie:f.cookie}}),f.env);assert.equal(response.status,200);const status=await response.json();assert.equal(status.paused,true);assert.equal(status.eligibleToPublish,0);
    assert.equal((await worker.fetch(new Request(f.origin+'/api/workflow'),f.env)).status,401);
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    let queryCount=0;env.DB={prepare(q){queryCount++;return DB.prepare(q);},batch:DB.batch.bind(DB)};
    const bounded=new FakeProductionPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time}));
    assert.equal((await runProductionSimulation(env,{publisher:bounded,now})).status,'confirmed');assert.equal(bounded.calls.length,1);assert.ok(queryCount<=40,'D1 query budget '+queryCount);
    results.push('Native D1 one-request tick: '+queryCount+' SQL statements, below 40-statement core budget');env.DB=DB;
    // CI's standard cloud smoke produces a live Worker bundle: fake harness must be absent.
    if(bundlePath){const bundle=readFileSync(bundlePath,'utf8');assert.equal(bundle.includes('production_fixture_jobs'),false);assert.equal(bundle.includes('class FakeProductionPublisher'),false);}
    results.push('Isolated D1 contract: private preflight; zero live publication/outbox mutations; fake adapter rejected');
    mkdirSync('tmp/step36',{recursive:true});writeFileSync('tmp/step36/d1-results.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'local workerd D1 SQL with Node orchestration, isolated fixture tables, fake publisher',realMetaOutbound:0,realTelegramOutbound:0,fakeRequests:parallel.calls.length+retries.calls.length+lost.calls.length+fresh.calls.length+crash.calls.length+rollback.calls.length+bounded.calls.length,coreQueryCount:queryCount,results},null,2));
    console.log('Production simulation D1 passed: '+results.length+' integration scenarios; no real Facebook/Telegram calls.');
    return results;
  }finally{await f.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await runProductionPublisherSmoke();await nativeProductionPublisher();}
