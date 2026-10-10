import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {runnerFixture} from './helpers/production-runner-http.mjs';
import {productionState,managementSummary} from '../src/production/management.ts';
import {runProductionPublisher,pauseProductionPublisher} from '../src/production/publisher-live.ts';
import {runStagedProductionPublisher} from '../src/production/publisher-stages.ts';
import worker from '../src/production/worker.ts';
import {runSimulatedActionsRunner} from '../scripts/production-actions-runner.mjs';
import {ProductionMetaPublisher} from '../src/production/publisher-provider.ts';
import runnerWorker from '../src/production/runner-worker.ts';
import {RUNNER_ORIGIN} from '../src/production/runner-boundary.ts';
import {simulatedClient} from '../scripts/production-actions-runner.mjs';
import {scanRunnerStock} from '../scripts/production-runner-stock.mjs';
import {quotaDecision,readRunnerQuota} from '../scripts/production-runner-quota.mjs';
import {runProductionActions,trustedRunnerContext,LIVE_RUNNER_ORIGIN,LIVE_WORKFLOW} from '../scripts/production-runner-live.mjs';
import {closedF6Configuration} from '../scripts/production-f6-config.mjs';
import {monitorRunner} from '../scripts/production-runner-monitor.mjs';
import {readFileSync} from 'node:fs';

test('F6 schema16 summary, health and both legacy entrypoints respect the runner gate',async()=>{
 const f=await runnerFixture();try{
  assert.equal((await productionState(f.env)).migration_count,16);
  const s=await managementSummary(f.env);assert.equal(s.schema,16);assert.equal(s.publisherEngine,'runner');assert.equal(s.publishingEnabled,true);
  assert.equal((await (await worker.fetch(new Request(f.env.AUTH_ORIGIN+'/health'),f.env)).json()).publisherEngine,'runner');
  const provider=new ProductionMetaPublisher(f.env,()=>{throw Error('LEGACY_SEND');});
  for(const env of [f.env,{...f.env,PRODUCTION_PUBLISHER_ENABLED:'true'}]){
   assert.equal((await runProductionPublisher(env,provider)).state,'runner_selected');
   assert.equal((await runStagedProductionPublisher(env,provider)).state,'runner_selected');
  }
  assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_jobs').get().n,0);assert.equal(f.postCount(),0);
  assert.equal((await managementSummary({...f.env,PRODUCTION_RUNNER_TOKEN:f.env.PRODUCTION_MONITOR_TOKEN})).publishingEnabled,false);
 }finally{await f.dispose();}
});
test('F6 owner pause preserves an unresolved intent and GET-only recovery',async()=>{
 const f=await runnerFixture();try{
  await runSimulatedActionsRunner({...f.options,hook:p=>{if(p==='after_hint')throw Error('CRASH');}});
  await assert.rejects(pauseProductionPublisher(f.env,'other@example.com'));
  await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com');
  assert.equal((await managementSummary(f.env)).paused,true);
  assert.equal(f.db.prepare('SELECT revoked FROM production_send_permits').get().revoked,1);
  assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_attempts').get().n,1);
  assert.equal((await runSimulatedActionsRunner(f.options)).state,'confirmed');assert.equal(f.postCount(),1);
 }finally{await f.dispose();}
});
test('F6 owner HTTP pause requires same-origin CSRF and an empty JSON object',async()=>{
 const f=await runnerFixture();try{
  f.env.GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com';f.env.GOOGLE_CLIENT_SECRET='fixture-secret';
  const origin=f.env.AUTH_ORIGIN,csrf='c'.repeat(64);
  const cookie='__Host-nttu_session='+await new SignJWT({email:'tranthanhtung37@gmail.com',csrf}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setSubject('owner').setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
  const call=(body,extra={})=>worker.fetch(new Request(origin+'/api/production/pause',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':csrf,...extra},body}),f.env);
  assert.equal((await call('{}',{Origin:'https://other.invalid'})).status,403);
  assert.equal((await call('{}',{'X-CSRF-Token':'d'.repeat(64)})).status,403);
  assert.equal((await call('{"enable":true}')).status,422);
  assert.equal((await call('{}')).status,200);assert.equal((await managementSummary(f.env)).publishingEnabled,false);assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
test('F6 dedicated entrypoint denies foreign origins and owner UI routes',async()=>{
 const f=await runnerFixture();try{
  const env={...f.env,RUNNER_ORIGIN},request=path=>new Request(RUNNER_ORIGIN+path,{method:'POST',headers:{Authorization:'Bearer '+env.PRODUCTION_RUNNER_TOKEN},body:'{}'});
  assert.equal((await runnerWorker.fetch(request('/runner/status'),env)).status,200);
  assert.equal((await runnerWorker.fetch(request('/api/management'),env)).status,404);
  assert.equal((await runnerWorker.fetch(new Request('https://other.invalid/runner/status'),env)).status,403);
  assert.equal((await runnerWorker.fetch(request('/runner/status'),{...env,PRODUCTION_PUBLISHER_ENABLED:'true'})).status,503);
 }finally{await f.dispose();}
});
test('F6 Node stock pagination counts approved main/reserve and commits a fresh snapshot',async()=>{
 const f=await runnerFixture();try{
  const result=await scanRunnerStock(simulatedClient(f.options),{expectedRelease:f.env.RELEASE_SHA});
  assert.equal(result.state,'stock_confirmed');assert.equal(result.remaining,40);assert.equal(result.main,30);assert.equal(result.reserve,10);
  assert.equal(f.db.prepare('SELECT stock_pending FROM production_publisher_config').get().stock_pending,0);assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
test('F6 stock rejects mutation at final write, partial traversal, replay and changed release',async()=>{
 for(const mode of ['source','pause','config','expiry','release','during-write']){
  const f=await runnerFixture();try{
   f.db.exec('UPDATE production_publisher_config SET stock_pending=1');
   const client=simulatedClient(f.options),original=client.call.bind(client);
   client.call=async(route,body)=>{
    if(route==='/runner/stock-finalize'){
     const mutate=()=>{if(mode==='source'||mode==='during-write')f.db.exec("UPDATE sources SET status='blocked'");if(mode==='pause')f.db.exec("UPDATE application_state SET paused_by_user=1");if(mode==='config')f.db.exec('UPDATE production_publisher_config SET revision=revision+1');if(mode==='expiry')f.setTime(Date.parse('2026-10-08T03:05:00Z'));if(mode==='release')f.env.RELEASE_SHA='f'.repeat(40);};
     if(mode==='during-write'){const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async s=>{mutate();return batch(s);};}else mutate();
    }return original(route,body);
   };
   await assert.rejects(scanRunnerStock(client,{expectedRelease:f.env.RELEASE_SHA}),/STOCK_/);assert.equal(f.db.prepare('SELECT stock_pending FROM production_publisher_config').get().stock_pending,1);assert.equal(f.postCount(),0);
  }finally{await f.dispose();}
 }
 const f=await runnerFixture();try{
  const s=await (await f.request('/runner/stock-start')).json();const body={scan:s.scan,remaining:40,main:30,reserve:10,ready:40};
  assert.equal((await f.request('/runner/stock-finalize',body)).status,409);
  const result=await scanRunnerStock(simulatedClient(f.options),{expectedRelease:f.env.RELEASE_SHA});assert.equal(result.remaining,40);
  const scan=f.db.prepare('SELECT revision FROM production_publisher_stock_scan').get().revision;
  assert.equal((await f.request('/runner/stock-finalize',{...body,scan})).status,409);
 }finally{await f.dispose();}
});
const quotaNow=Date.parse('2026-10-10T04:00:00Z');
const billingPolicy={account:'johntroger',scope:'account',product:'Actions',plan:'free',budgetUSD:0,stopUsage:true,verifiedAt:quotaNow,includedMinutes:2000,reserveMinutes:400,cycleMinutes:5};
const usageRow={date:'2026-10-10',product:'Actions',sku:'Actions Linux',quantity:100,unitType:'minutes',netAmount:0,repositoryName:'other-repository'};
test('F6 account quota includes other repositories, weighted usage and the CI/monitor reserve',()=>{
 const q=quotaDecision({usageItems:[usageRow,{...usageRow,sku:'Actions Windows',quantity:50},{...usageRow,sku:'Actions macOS',quantity:10}]},billingPolicy,quotaNow);
 assert.equal(q.usedMinutes,300);assert.equal(q.remainingMinutes,1300);assert.equal(q.allowed,true);
 assert.equal(quotaDecision({usageItems:[{...usageRow,quantity:1596}]},billingPolicy,quotaNow).allowed,false);
 for(const p of [undefined,{...billingPolicy,stopUsage:false},{...billingPolicy,budgetUSD:5},{...billingPolicy,scope:'repository'},{...billingPolicy,verifiedAt:quotaNow-86400001},{...billingPolicy,reserveMinutes:0}])assert.equal(quotaDecision({usageItems:[]},p,quotaNow).allowed,false);
 for(const r of [{},{...usageRow,sku:'unknown'},{...usageRow,netAmount:1},{...usageRow,quantity:-1},{...usageRow,date:'2026-09-30'}])assert.equal(quotaDecision({usageItems:[r]},billingPolicy,quotaNow).allowed,false);
});
test('F6 quota adapter reads current account month and fails closed on 403, redirects or unreadable usage',async()=>{
 let calls=0;
 const transport=async(url,init)=>{calls++;assert.match(url,/\/users\/johntroger\/settings\/billing\/usage\?year=2026&month=10$/);assert.ok(!url.includes('repository'));assert.equal(init.redirect,'error');return Response.json({usageItems:[usageRow]});};
 assert.equal((await readRunnerQuota({token:'fixture',policy:billingPolicy,now:quotaNow,transport})).allowed,true);assert.equal(calls,1);
 assert.equal((await readRunnerQuota({token:'fixture',policy:{...billingPolicy,budgetUSD:2},now:quotaNow,transport})).allowed,false);assert.equal(calls,1);
 for(const response of [new Response('',{status:403}),Response.json({}),Response.json({usageItems:[]}),Response.json({usageItems:[{...usageRow,product:'actions'}]}),Response.json({usageItems:[]},{headers:{Link:'next-page'}})])assert.equal((await readRunnerQuota({token:'fixture',policy:billingPolicy,now:quotaNow,transport:async()=>response})).allowed,false);
});
function trustedEnv(f){return {...f.env,PRODUCTION_ACTIONS_ENABLED:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'johntroger/nttu-digital-economics-publisher',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:'johntroger/nttu-digital-economics-publisher/'+LIVE_WORKFLOW+'@refs/heads/main',GITHUB_SHA:f.env.RELEASE_SHA,PRODUCTION_RUNNER_RELEASE:f.env.RELEASE_SHA,GITHUB_RUN_ID:'12345',GITHUB_TOKEN:'fixture',PRODUCTION_BILLING_READ_TOKEN:'fixture',PRODUCTION_BILLING_POLICY:JSON.stringify(billingPolicy)};}
function liveMock(f,{usage={usageItems:[usageRow]},run={},hook}={}){
 return async(input,init)=>{
  const u=new URL(String(input));await hook?.(u,init);
  if(u.origin==='https://api.github.com')return Response.json(u.pathname.includes('/billing/')?usage:{id:12345,event:'workflow_dispatch',head_sha:f.env.RELEASE_SHA,head_branch:'main',path:LIVE_WORKFLOW,status:'in_progress',...run});
  if(u.origin===LIVE_RUNNER_ORIGIN)return fetch(f.options.apiOrigin+u.pathname+u.search,init);
  if(u.origin==='https://graph.facebook.com')return fetch(f.options.mockGraphOrigin+u.pathname+u.search,init);
  assert.fail('Unexpected outbound origin');
 };
}
test('F6 live wrapper is closed for untrusted ref, event, repository or release before any transport',async()=>{
 const f=await runnerFixture();try{
  const env=trustedEnv(f);assert.equal(trustedRunnerContext(env),true);
  for(const changed of [{PRODUCTION_ACTIONS_ENABLED:'false'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/topic'},{GITHUB_WORKFLOW_REF:'other'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY:'other/project'}]){
   assert.equal((await runProductionActions({...env,...changed},{transport:()=>assert.fail('Closed workflow made request')})).state,'closed');
  }
  assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
test('F6 fixed-origin live wrapper completes a mock publication, stock and heartbeat with no arbitrary URLs',async()=>{
 const f=await runnerFixture();try{
  const result=await runProductionActions(trustedEnv(f),{transport:liveMock(f),now:quotaNow});assert.equal(result.state,'confirmed',JSON.stringify(result));assert.equal(result.dispatches,1);assert.equal(f.postCount(),1);
  assert.equal(f.db.prepare('SELECT state FROM production_publisher_runtime').get().state,'runner_completed');
  assert.equal(f.db.prepare('SELECT remaining FROM production_publisher_stock_scan').get().remaining,39);
  assert.equal((await runProductionActions(trustedEnv(f),{transport:liveMock(f),now:quotaNow})).state,'day_complete');assert.equal(f.postCount(),1);
 }finally{await f.dispose();}
});
test('F6 workflow proof, quota and server release failures never claim or POST',async()=>{
 for(const mode of ['quota','release','workflow']){
  const f=await runnerFixture();try{
   const env=trustedEnv(f);
   if(mode==='release')env.PRODUCTION_RUNNER_RELEASE=env.GITHUB_SHA='e'.repeat(40);
   const transport=liveMock(f,mode==='quota'?{usage:{usageItems:[{...usageRow,quantity:2000}]}}:mode==='workflow'?{run:{event:'push'}}:{});
   const r=await runProductionActions(env,{transport,now:quotaNow});assert.ok(['quota_blocked','runner_failed'].includes(r.state),JSON.stringify(r));assert.equal(f.postCount(),0);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_jobs').get().n,0);
  }finally{await f.dispose();}
 }
});
test('F6 independent watchdog distinguishes HTTP dispatch acceptance from an actual completed runner',async()=>{
 const f=await runnerFixture();try{
  assert.equal((await f.request('/runner/watchdog',{},'b'.repeat(64))).status,503);
  assert.equal((await f.request('/runner/heartbeat',{runId:'12345',state:'started'},'b'.repeat(64))).status,401);
  assert.equal((await f.request('/runner/heartbeat',{runId:'12345',state:'started'})).status,200);
  f.setTime(Date.parse('2026-10-08T03:11:00Z'));assert.equal((await f.request('/runner/watchdog',{},'b'.repeat(64))).status,503);
  await f.request('/runner/heartbeat',{runId:'12345',state:'completed'});assert.equal((await f.request('/runner/watchdog',{},'b'.repeat(64))).status,200);
  f.setTime(Date.parse('2026-10-10T03:11:00Z'));assert.equal((await f.request('/runner/watchdog',{},'b'.repeat(64))).status,503);assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
test('F6 rollout proposal and workflow cannot deploy, schedule or open either sender by default',()=>{
 const c=closedF6Configuration('a'.repeat(40));
 for(const worker of [c.runner,c.management]){assert.equal(worker.vars.PRODUCTION_RUNNER_ENABLED,'false');assert.equal(worker.vars.PRODUCTION_PUBLISHER_ENABLED,'false');assert.deepEqual(worker.triggers.crons,[]);}
 assert.equal(c.githubVariables.PRODUCTION_ACTIONS_ENABLED,'false');assert.equal(c.rolloutApproved,false);assert.equal(c.postingApproved,false);assert.equal(c.migrations.length,2);
 assert.ok(!c.credentials.runner.some(x=>x.startsWith('META_')||x.startsWith('GOOGLE_')));
 const workflow=readFileSync('.github/workflows/production-runner.yml','utf8');assert.ok(!workflow.includes('schedule:'));assert.ok(!workflow.includes('inputs:'));assert.match(workflow,/vars.PRODUCTION_RUNNER_RELEASE == github.sha/);assert.match(workflow,/environment: production-runner/);assert.match(workflow,/timeout-minutes: 5/);
});
test('F6 Node monitor uses only status and Meta GET, and reports the fresh state after verification',async()=>{
 const f=await runnerFixture({graphHook:async(url,req,{db})=>{assert.equal(req.method,'GET');if(url.pathname.endsWith('/me'))db.exec("UPDATE application_state SET paused_by_user=1,operation_generation=operation_generation+1");}});try{
  const client=simulatedClient({...f.options,token:'b'.repeat(64)}),original=client.call.bind(client);client.call=(route,...args)=>{assert.equal(route,'/runner/status');return original(route,...args);};
  const r=await monitorRunner(client,{expectedRelease:f.env.RELEASE_SHA,now:Date.parse('2026-10-08T03:00:00Z')});assert.equal(r.paused,true);assert.equal(r.enabled,false);assert.equal(r.connectionVerified,true);assert.ok(r.codes.includes('state_changed'));assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
