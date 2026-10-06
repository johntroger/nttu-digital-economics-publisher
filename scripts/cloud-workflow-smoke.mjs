import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {managementFixture} from './cloud-management-smoke.mjs';
import {WORKFLOW_FIXTURE_SCHEMA} from '../src/cloud/workflow-fixture-schema.ts';
import {FakeCloudPublisher,runCloudSimulation,reconcileCloudSimulation} from '../src/cloud/workflow-simulation.ts';
import {workflowFixture} from '../tests/helpers/workflow-fixture.mjs';
import {readCatalog} from '../src/storage/catalog.ts';
import {notificationText} from '../src/cloud/telegram.ts';
import worker from '../src/cloud/worker.ts';

export async function runCloudWorkflowSmoke({bundlePath}={}){
  const f=await managementFixture({testOnlyMigration:WORKFLOW_FIXTURE_SCHEMA});
  const env={...f.env,APP_ENV:'test',INTEGRATION_MODE:'fake'},DB=env.DB;
  const sql=(q,...args)=>DB.prepare(q).bind(...args);
  const results=[];
  const reset=async()=>{
    await DB.batch(['fixture_flow_outbox','fixture_flow_stock','fixture_flow_usage','fixture_flow_attempts','fixture_flow_jobs','fixture_flow_slots','fixture_flow_posts','fixture_flow_config'].map(table=>sql('DELETE FROM '+table)));
    await sql("INSERT INTO fixture_flow_config(id,identity,target,start_date,paused) VALUES(1,'isolated-d1-fixture','fixture:d1','2026-10-05',0)").run();
    const local=workflowFixture({mains:2,reserves:2}),posts=readCatalog(local.tx);local.db.close();
    await DB.batch(posts.map(p=>sql('INSERT INTO fixture_flow_posts(id,payload) VALUES (?,?)',p.postId,JSON.stringify(p))));
    await DB.batch([sql("INSERT INTO fixture_flow_slots VALUES('2026-10-05','p1','open')"),sql("INSERT INTO fixture_flow_slots VALUES('2026-10-06','p2','open')")]);
  };
  let time=Date.parse('2026-10-05T03:00:00Z');
  const now=()=>time,run=p=>runCloudSimulation(env,{publisher:p,now});
  try{
    await reset();
    let release,started;const start=new Promise(r=>started=r),barrier=new Promise(r=>release=r);
    const parallel=new FakeCloudPublisher(async r=>{started();await barrier;return{kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time};});
    const first=run(parallel);await start;assert.equal((await run(parallel)).status,'in_flight');release();assert.equal((await first).status,'confirmed');
    assert.equal(parallel.calls.length,1);assert.equal((await sql('SELECT count(*) n FROM fixture_flow_usage').first()).n,1);
    results.push('D1 concurrent ticks: one intent, one send, atomic usage/outbox');
    await reset();
    const retries=new FakeCloudPublisher(async r=>r.postId==='p1'?{kind:'retryable'}:{kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time});
    assert.equal((await run(retries)).status,'retry_wait');time+=299000;await run(retries);assert.equal(retries.calls.length,1);time+=1000;await run(retries);time+=300000;assert.equal((await run(retries)).status,'confirmed');assert.equal(retries.calls.length,4);
    const events=(await sql('SELECT payload_json,event_id FROM fixture_flow_outbox').all()).results;
    for(const event of events)assert.ok(notificationText(event.event_id,JSON.parse(event.payload_json)).includes('NTTU'));
    results.push('D1 retries: 5 minutes / 3 attempts, same-day reserve and valid Telegram templates');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    const lost=new FakeCloudPublisher(async()=>{throw Error('simulated lost response');});assert.equal((await run(lost)).status,'reconciliation_required');
    // A fresh runner instance reads durable state rather than an in-memory flag.
    const fresh=new FakeCloudPublisher(async()=>{throw Error('must not be called');});time+=86400000;
    assert.equal((await run(fresh)).status,'reconciliation_required');assert.equal(fresh.calls.length,0);
    const attempt=(await sql('SELECT id FROM fixture_flow_attempts').first()).id;
    await reconcileCloudSimulation(env,fresh,attempt,{kind:'confirmed',remoteId:'fixture:verified-late',confirmedAt:time},time);
    assert.equal((await run(fresh)).status,'day_complete');assert.equal((await sql('SELECT day FROM fixture_flow_usage').first()).day,'2026-10-06');
    results.push('D1 lost response and fresh runner: no repost; verified late receipt protects actual day');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    let batches=0;const original=DB.batch.bind(DB);env.DB={...DB,prepare:DB.prepare.bind(DB),batch:async statements=>{batches++;if(batches===3)throw Error('receipt failpoint');return original(statements);}};
    const crash=new FakeCloudPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time}));await assert.rejects(run(crash),/receipt failpoint/);env.DB=DB;time+=61000;
    assert.equal((await run(crash)).status,'reconciliation_required');assert.equal(crash.calls.length,1);assert.equal((await sql('SELECT count(*) n FROM fixture_flow_usage').first()).n,0);
    results.push('D1 crash after send: committed intent survives and expires to unknown without retry');
    await reset();time=Date.parse('2026-10-05T03:00:00Z');
    await sql("CREATE TRIGGER fixture_abort_receipt BEFORE INSERT ON fixture_flow_usage BEGIN SELECT RAISE(ABORT,'injected D1 transaction failure'); END").run();
    const rollback=new FakeCloudPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time}));await assert.rejects(run(rollback));
    assert.equal((await sql('SELECT state FROM fixture_flow_jobs').first()).state,'requested');assert.equal((await sql('SELECT state FROM fixture_flow_attempts').first()).state,'intent');assert.equal((await sql('SELECT count(*) n FROM fixture_flow_outbox').first()).n,0);
    await sql('DROP TRIGGER fixture_abort_receipt').run();time+=61000;assert.equal((await run(rollback)).status,'reconciliation_required');assert.equal(rollback.calls.length,1);
    results.push('Actual D1 failed transaction rolls back receipt/usage/outbox together, preserving intent');
    await assert.rejects(runCloudSimulation(f.env,{publisher:crash,now}),/ISOLATED/);
    assert.equal((await sql('SELECT count(*) n FROM publications').first()).n,0);assert.equal((await sql('SELECT count(*) n FROM notification_outbox').first()).n,0);
    const response=await worker.fetch(new Request(f.origin+'/api/workflow',{headers:{Cookie:f.cookie}}),f.env);assert.equal(response.status,200);const status=await response.json();assert.equal(status.paused,true);assert.equal(status.eligibleToPublish,0);
    assert.equal((await worker.fetch(new Request(f.origin+'/api/workflow'),f.env)).status,401);
    // CI's standard cloud smoke produces a live Worker bundle: fake harness must be absent.
    if(bundlePath){const bundle=readFileSync(bundlePath,'utf8');assert.equal(bundle.includes('fixture_flow_jobs'),false);assert.equal(bundle.includes('class FakeCloudPublisher'),false);}
    results.push('Live staging contract: private preflight; zero live publication/outbox mutations; fake adapter rejected');
    mkdirSync('tmp/step-19',{recursive:true});writeFileSync('tmp/step-19/d1-results.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'local workerd D1, isolated fixture tables, fake publisher, no network publication or Telegram',results},null,2));
    console.log('Cloud workflow D1 passed: '+results.length+' integration scenarios; no real Facebook/Telegram calls.');
    return results;
  }finally{await f.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runCloudWorkflowSmoke();
