// F5 simulation only. No process.env secrets, production URL or live Meta path.
import {randomUUID} from 'node:crypto';
import {projectApprovalRows} from '../src/production/preview.ts';
import {ProductionMetaPublisher,PRODUCTION_PAGE,publicationHash} from '../src/production/publisher-provider.ts';
import {validateFile} from '../src/cloud/storage.ts';
export const SIMULATION_META=Object.freeze({APP_ENV:'production',META_PAGE_ID:PRODUCTION_PAGE,META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:'fixture-secret-'+'s'.repeat(30),META_PAGE_ACCESS_TOKEN:'fixture-token-'+'t'.repeat(60)});
function loopback(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('SIMULATION_LOOPBACK_REQUIRED');return u.origin;}
async function limited(response,max){const parts=[];let size=0;const reader=response.body?.getReader();if(reader)while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>max){await reader.cancel();throw Error('SIMULATION_RESPONSE_TOO_LARGE');}parts.push(item.value);}const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
export function simulatedClient({apiOrigin,mockGraphOrigin,token,transport=fetch}){
 const api=loopback(apiOrigin),graph=loopback(mockGraphOrigin);if(!/^[a-f0-9]{64}$/.test(token??''))throw Error('SIMULATION_TOKEN_INVALID');
 const wire=async(input,init)=>{const u=new URL(String(input));if(u.origin!=='https://graph.facebook.com'||!/^\/v26\.0\/(debug_token|me|817593604765443(?:\/photos|_[1-9][0-9]{4,24})?)$/.test(u.pathname)||!['GET','POST'].includes(init?.method))throw Error('SIMULATION_GRAPH_ROUTE_DENIED');return transport(graph+u.pathname+u.search,{...init,redirect:'error'});};
 return {provider:new ProductionMetaPublisher(SIMULATION_META,wire),async call(route,body={},binary=false){
  if(!/^\/runner\/(claim|data|image|proof|intent|authorize|evidence|finalize|status|stock-start|stock-data|stock-finalize)$/.test(route))throw Error('SIMULATION_API_ROUTE_DENIED');
  const response=await transport(api+route,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
  const bytes=await limited(response,binary?5242880:131072);let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{if(!binary||!response.ok)throw Error('SIMULATION_RESPONSE_INVALID');}
  if(!response.ok)throw Error(typeof value?.error==='string'?value.error:'SIMULATION_HTTP_FAILED');return binary?bytes:value;
 }};
}
const descriptor=d=>{if(d.pageId!==PRODUCTION_PAGE||!/^runner-job:[a-f0-9-]{36}$/.test(d.job??'')||!Number.isSafeInteger(d.serverNow)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>5242880||! /^[a-f0-9]{64}$/.test(d.checksum??'')||typeof d.caption!=='string'||!d.caption||! /^[a-f0-9]{40}$/.test(d.release??''))throw Error('SIMULATION_DESCRIPTOR_INVALID');};
// Outcomes are deliberately small and contain no caption, token, response or URL.
export async function runSimulatedActionsRunner(options){
 return runRunnerProtocol(simulatedClient(options),options);
}
// Transport capabilities are injected explicitly. The live wrapper supplies a
// fixed-origin client only after workflow, billing and release verification.
export async function runRunnerProtocol(client,options){
 const start=performance.now(),maxMs=options.maxMs??180000,runner=randomUUID(),hook=options.hook??(()=>{});
 if(!Number.isSafeInteger(maxMs)||maxMs<1||maxMs>180000)throw Error('SIMULATION_BUDGET_INVALID');
 if(options.quotaAllowed!==true)return {state:'quota_blocked',mockPosts:0};
 let posts=0,held,attempt;
 const checkpoint=async(stage)=>{if(performance.now()-start>=maxMs)throw Error('SIMULATION_TIME_BUDGET');await hook(stage,{job:held?.job,attempt:attempt?.attempt,runner});};
 const report=(state,extra={})=>({state,mockPosts:posts,runnerMs:Math.ceil(performance.now()-start),...extra});
 const api=(path,data={})=>client.call(path,{job:held.job,runner,...data});
 async function finish(result){await api('/runner/evidence',{attempt:attempt.attempt,result});await checkpoint('after_evidence');const done=await api('/runner/finalize',{attempt:attempt.attempt});return report(done.state);}
 try{
  await checkpoint('before_claim');held=await client.call('/runner/claim',{runner});
  if(!['held','requested','unknown'].includes(held.state))return report(held.state);
  descriptor(held);
  if(options.expectedRelease!==undefined&&held.release!==options.expectedRelease)throw Error('RUNNER_RELEASE_CHANGED');
  if(held.state!=='held'){
   if(!held.attempt)return report('unknown',{needsReconciliation:true});
   attempt={attempt:held.attempt,sentAt:held.sentAt};
   // Recovery never executes POST, even when a prior send grant was consumed.
   if(!held.remoteId)return await finish({kind:'unknown'});
   await checkpoint('before_reconcile');const proof=await client.provider.reconcile({attemptId:attempt.attempt,pageId:PRODUCTION_PAGE,caption:held.caption,checksum:held.checksum,sentAt:attempt.sentAt},held.remoteId,()=>held.serverNow);
   return await finish(proof);
  }
  const data=[];for(let group=0;group<5;group++){const rows=[];let offset=0;do{await checkpoint('data');const page=await api('/runner/data',{group,offset});if(!Array.isArray(page.rows)||page.rows.length>8||page.next!==null&&page.next!==offset+8)throw Error('SIMULATION_PAGE_INVALID');rows.push(...page.rows);offset=page.next;if(rows.length>128)throw Error('SIMULATION_PAGES_EXCEEDED');}while(offset!==null);data.push(rows);}
  const item=(await projectApprovalRows(held.serverNow,'batch',data))[0];if(!item?.approvalValid||item.versionId!==held.versionId||item.caption!==held.caption||item.imageChecksum!==held.checksum)throw Error('SIMULATION_APPROVAL_INVALID');
  await checkpoint('before_image');const bytes=await client.call('/runner/image',{job:held.job,runner},true);
  validateFile({kind:'image',contentType:'image/png',filename:'approved.png'},bytes);
  if(bytes.length!==held.bytes||await publicationHash(bytes)!==held.checksum)throw Error('SIMULATION_IMAGE_INVALID');
  await checkpoint('before_verify');const proof=await client.provider.verify(held.serverNow);if(!proof.verified)throw Error('SIMULATION_CONNECTION_INVALID');
  await api('/runner/proof',{checksum:held.checksum,bytes:bytes.length,checkVersion:item.checkVersion,connection:{verified:proof.verified,fingerprint:proof.fingerprint,expiresAt:proof.expiresAt??null,dataAccessExpiresAt:proof.dataAccessExpiresAt??null}});
  await checkpoint('before_intent');attempt=await api('/runner/intent');await checkpoint('after_intent');
  const authorizationStarted=performance.now(),grant=await api('/runner/authorize',{attempt:attempt.attempt,grant:attempt.grant});
  if(grant.dispatch!==true)return await finish({kind:'unknown'});
  await checkpoint('after_authorize');
  // Use elapsed monotonic time, never a caller-supplied clock. Include request
  // transit time conservatively; an expired/lost grant can only be reconciled.
  if(!Number.isSafeInteger(attempt.expiresAt)||!Number.isSafeInteger(grant.serverNow)||performance.now()-authorizationStarted>=attempt.expiresAt-grant.serverNow)throw Error('SIMULATION_GRANT_EXPIRED');
  // Checkpoints can simulate a crash; exceptions leave intent durable. No resend.
  const result=await client.provider.dispatch({attemptId:attempt.attempt,pageId:PRODUCTION_PAGE,caption:held.caption,checksum:held.checksum,bytes,sentAt:attempt.sentAt});posts++;
  await checkpoint('after_post');
  await api('/runner/evidence',{attempt:attempt.attempt,result});await checkpoint('after_hint');
  if(result.kind==='unknown'&&result.remoteId){const confirmed=await client.provider.reconcile({attemptId:attempt.attempt,pageId:PRODUCTION_PAGE,caption:held.caption,checksum:held.checksum,sentAt:attempt.sentAt},result.remoteId,()=>grant.serverNow);await checkpoint('after_get');return await finish(confirmed);}
  const done=await api('/runner/finalize',{attempt:attempt.attempt});return report(done.state);
 }catch(error){return report(attempt?'needs_reconciliation':'held_or_closed',{reason:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'SIMULATION_INTERRUPTED',needsReconciliation:Boolean(attempt)});}
}
export async function runSimulatedRunnerMonitor(options){
 const client=simulatedClient(options),before=await client.call('/runner/status'),proof=await client.provider.verify(before.serverNow),after=await client.call('/runner/status');
 return {state:after.state,paused:after.paused,enabled:after.enabled,connectionVerified:proof.verified,revision:after.revision,generation:after.generation,counts:after.counts,realPublication:'NOT_RUN'};
}
