import {pathToFileURL} from 'node:url';
import {runRunnerProtocol} from './production-actions-runner.mjs';
import {scanRunnerStock} from './production-runner-stock.mjs';
import {readRunnerQuota,githubJSON,REPOSITORY} from './production-runner-quota.mjs';
import {ProductionMetaPublisher,PRODUCTION_PAGE} from '../src/production/publisher-provider.ts';
export const LIVE_RUNNER_ORIGIN='https://nttu-publisher-runner.nttu-kts-johntroger.workers.dev';
export const LIVE_WORKFLOW='.github/workflows/production-runner.yml';
export function trustedRunnerContext(env){
 return env.PRODUCTION_ACTIONS_ENABLED==='true'&&env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===REPOSITORY&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_WORKFLOW_REF===REPOSITORY+'/'+LIVE_WORKFLOW+'@refs/heads/main'&&/^[a-f0-9]{40}$/.test(env.PRODUCTION_RUNNER_RELEASE??'')&&env.GITHUB_SHA===env.PRODUCTION_RUNNER_RELEASE&&/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID??'');
}
export function liveRunnerClient(env,transport=fetch){
 if(!trustedRunnerContext(env)||! /^[a-f0-9]{64}$/.test(env.PRODUCTION_RUNNER_TOKEN??'')||!env.META_APP_SECRET||!env.META_PAGE_ACCESS_TOKEN)throw Error('LIVE_RUNNER_NOT_CONFIGURED');
 const provider=new ProductionMetaPublisher({APP_ENV:'production',META_PAGE_ID:PRODUCTION_PAGE,META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:env.META_APP_SECRET,META_PAGE_ACCESS_TOKEN:env.META_PAGE_ACCESS_TOKEN},async(input,init)=>{
  const u=new URL(String(input));
  if(u.origin!=='https://graph.facebook.com'||!/^\/v26\.0\/(debug_token|me|817593604765443(?:\/photos|_[1-9][0-9]{4,24})?)$/.test(u.pathname)||!['GET','POST'].includes(init?.method))throw Error('LIVE_GRAPH_ROUTE_DENIED');
  return transport(input,{...init,redirect:'error'});
 });
 return {provider,async call(route,body={},binary=false){
  if(!/^\/runner\/(claim|data|image|proof|intent|authorize|evidence|finalize|status|heartbeat|stock-start|stock-data|stock-finalize)$/.test(route))throw Error('LIVE_API_ROUTE_DENIED');
  const response=await transport(LIVE_RUNNER_ORIGIN+route,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.PRODUCTION_RUNNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const reader=response.body?.getReader(),parts=[];let size=0;
  if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>(binary?5242880:131072)){await reader.cancel();throw Error('LIVE_RESPONSE_LIMIT');}parts.push(p.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{if(!binary||!response.ok)throw Error('LIVE_RESPONSE_INVALID');}
  if(!response.ok)throw Error(typeof value?.error==='string'&&/^[A-Z_]+$/.test(value.error)?value.error:'LIVE_HTTP_FAILED');
  return binary?bytes:value;
 }};
}
export async function runProductionActions(env,{transport=fetch,now=Date.now()}={}){
 // A closed or untrusted context does not even access billing or API credentials.
 if(!trustedRunnerContext(env))return {state:'closed',realPublication:'NOT_RUN'};
 const began=performance.now();let client;
 try{
  const run=await githubJSON('/repos/'+REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID,env.GITHUB_TOKEN,transport);
  if(run.head_sha!==env.PRODUCTION_RUNNER_RELEASE||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!==LIVE_WORKFLOW||run.status!=='in_progress'||String(run.id)!==env.GITHUB_RUN_ID)throw Error('WORKFLOW_IDENTITY_INVALID');
  let policy;try{policy=JSON.parse(env.PRODUCTION_BILLING_POLICY??'');}catch{return {state:'quota_blocked',reason:'budget_unverified',realPublication:'NOT_RUN'};}
  if(policy?.policyVersion===2&&policy.releaseSha!==env.PRODUCTION_RUNNER_RELEASE)return {state:'quota_blocked',reason:'budget_release_changed',realPublication:'NOT_RUN'};
  const quota=await readRunnerQuota({token:env.PRODUCTION_BILLING_READ_TOKEN,policy,transport,now});
  if(!quota.allowed)return {state:'quota_blocked',reason:quota.reason,realPublication:'NOT_RUN'};
  client=liveRunnerClient(env,transport);
  const before=await client.call('/runner/status');if(before.release!==env.PRODUCTION_RUNNER_RELEASE)throw Error('RUNNER_RELEASE_CHANGED');
  await client.call('/runner/heartbeat',{runId:env.GITHUB_RUN_ID,state:'started'});
  // Recovery must precede stock. A failed stock scan never erases intent.
  const result=await runRunnerProtocol(client,{quotaAllowed:true,expectedRelease:env.PRODUCTION_RUNNER_RELEASE,maxMs:Math.max(1,180000-Math.ceil(performance.now()-began))});
  if(performance.now()-began>=180000)throw Error('RUNNER_TIME_BUDGET');
  if(!['needs_reconciliation','unknown','held_or_closed'].includes(result.state))await scanRunnerStock(client,{expectedRelease:env.PRODUCTION_RUNNER_RELEASE,maxMs:Math.max(1,180000-(performance.now()-began))});
  const after=await client.call('/runner/status');if(after.release!==env.PRODUCTION_RUNNER_RELEASE)throw Error('RUNNER_RELEASE_CHANGED');
  const unresolved=['needs_reconciliation','unknown','held_or_closed'].includes(result.state);
  await client.call('/runner/heartbeat',{runId:env.GITHUB_RUN_ID,state:unresolved?'needs_reconciliation':'completed'});
  return {state:result.state,dispatches:result.mockPosts,paused:after.paused,generation:after.generation,runnerMs:Math.ceil(performance.now()-began)};
 }catch{
  if(client)try{await client.call('/runner/heartbeat',{runId:env.GITHUB_RUN_ID,state:'failed'});}catch{}
  return {state:'runner_failed',needsReconciliation:true};
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // The process timeout is below the workflow's five-minute billed reservation.
 const timer=setTimeout(()=>{console.error('RUNNER_PROCESS_TIMEOUT');process.exit(1);},210000);
 try{const r=await runProductionActions(process.env);console.log(JSON.stringify(r));if(['runner_failed','quota_blocked','needs_reconciliation','unknown','held_or_closed'].includes(r.state))process.exitCode=1;}finally{clearTimeout(timer);}
}
