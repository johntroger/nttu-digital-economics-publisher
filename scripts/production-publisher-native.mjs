import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {PRODUCTION_FIXTURE_SCHEMA} from '../src/production/publisher-fixture-schema.ts';
import {workflowFixture} from '../tests/helpers/workflow-fixture.mjs';
import {readCatalog} from '../src/storage/catalog.ts';
import {composeCaption} from '../src/domain/footer.ts';
export async function nativeProductionPublisher(){
 const dir=resolve('tmp/step36/native');mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,'wrangler.json'),JSON.stringify({name:'isolated-production-publisher-test',main:relative(dir,resolve('tests/helpers/production-publisher-worker.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07'}));
 const build=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',resolve(dir,'wrangler.json'),'--outdir',resolve(dir,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
 if(build.status!==0)throw Error('Isolated publisher Worker build failed');
 let outbound=0;const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'isolated-production-publisher-test',modules:true,scriptPath:resolve(dir,'bundle',readdirSync(resolve(dir,'bundle')).find(s=>s.endsWith('.js'))),compatibilityDate:'2026-10-07',d1Databases:['DB'],bindings:{APP_ENV:'test',INTEGRATION_MODE:'fake'},outboundService:async()=>{outbound++;throw Error('NETWORK_FORBIDDEN');}}]}));
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(PRODUCTION_FIXTURE_SCHEMA);
 const db=await mf.getD1Database('DB'),sql=(q,...args)=>db.prepare(q).bind(...args);
 const local=workflowFixture({mains:2,reserves:2}),posts=readCatalog(local.tx);local.db.close();
 for(const p of posts)p.productionReceipt={versionId:p.versionId,body:p.body,caption:composeCaption(p.body),imageChecksum:p.asset.checksum};
 let sends=0;const cases=[];
 const call=async(at,outcome='confirmed',extra={})=>{const response=await mf.dispatchFetch('https://isolated-publisher.invalid/run',{method:'POST',body:JSON.stringify({at,outcome,...extra})});const data=await response.json();sends+=data.fakeCalls??0;return {...data,httpStatus:response.status};};
 const reset=async()=>{
  await db.batch(['evidence','outbox','stock','usage','attempts','jobs','slots','posts','config'].map(t=>sql('DELETE FROM production_fixture_'+t)));
  await sql("INSERT INTO production_fixture_config(id,identity,target,start_date,paused,page,database_id,bucket,deployment_gate,owner_gate,connection_gate) VALUES(1,'isolated-d1-fixture','fixture:production','2026-10-05',0,'817593604765443','09cdecc7-36a2-4196-950e-ef68b1ecd834','nttu-publisher-production-assets',1,1,1)").run();
  await db.batch(posts.map(p=>sql('INSERT INTO production_fixture_posts(id,payload) VALUES (?,?)',p.postId,JSON.stringify(p))));
 };
 const now=Date.parse('2026-10-05T03:00:00Z');
 try{
  for(const object of sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await sql(object.sql).run();
  await reset();assert.equal((await call(now-1)).status,'before_publish_time');assert.equal(sends,0);assert.equal((await call(now)).status,'confirmed');assert.equal((await call(now)).status,'day_complete');assert.equal(sends,1);cases.push('Compiled workerd: server Vietnam date, immutable intent and one publication/day');
  await reset();const concurrent=await Promise.all([call(now,'confirmed',{delay:100}),call(now,'confirmed',{delay:100})]);assert.equal(concurrent.reduce((n,r)=>n+r.fakeCalls,0),1);assert.equal((await sql('SELECT count(*) n FROM production_fixture_usage').first()).n,1);cases.push('Compiled workerd: concurrent HTTP requests commit one send');
  await reset();assert.equal((await call(now,'retryable')).status,'retry_wait');assert.equal((await call(now+299999,'retryable')).fakeCalls,0);assert.equal((await call(now+300000,'retryable')).status,'retry_wait');assert.equal((await call(now+600000,'retryable')).status,'budget_exhausted');assert.equal((await call(now+600001,'retryable')).status,'confirmed');cases.push('Compiled workerd: three rejections five minutes apart, reserve on later invocation');
  await reset();assert.equal((await call(now,'throw')).status,'reconciliation_required');assert.equal((await call(now+86400000)).fakeCalls,0);cases.push('Compiled workerd: lost response blocks following day with no repost');
  await reset();await sql("CREATE TRIGGER fail_native_finalizer BEFORE INSERT ON production_fixture_usage BEGIN SELECT RAISE(ABORT,'finalizer rollback'); END").run();const failed=await call(now);assert.equal(failed.httpStatus,500);assert.equal(failed.fakeCalls,1);assert.equal((await sql('SELECT count(*) n FROM production_fixture_evidence').first()).n,1);await sql('DROP TRIGGER fail_native_finalizer').run();assert.equal((await call(now+1)).status,'day_complete');cases.push('Compiled workerd: evidence survives native D1 rollback and finishes without another POST');
  await reset();await sql('UPDATE production_fixture_config SET owner_gate=0').run();assert.equal((await call(now)).fakeCalls,0);assert.equal((await sql('SELECT count(*) n FROM production_fixture_jobs').first()).n,0);cases.push('Compiled workerd: closed approval gate prevents claims');
  await reset();const timeout=await call(now,'confirmed',{delay:11000});assert.equal(timeout.status,'reconciliation_required');assert.equal(timeout.fakeCalls,1);assert.equal((await call(now+86400000)).fakeCalls,0);cases.push('Compiled workerd: provider exceeds ten-second budget, unknown persists without retry');
  assert.equal(outbound,0);const report={runtime:'compiled workerd + native local D1',cases,fakeRequests:sends,realMetaOutbound:outbound,realPublication:'NOT_RUN'};writeFileSync(resolve(dir,'results.json'),JSON.stringify(report,null,2));console.log('Compiled production publisher passed: '+cases.length+' scenarios, '+sends+' fake requests, zero external requests.');return report;
 }finally{sqlite.close();await mf.dispose();}
}
