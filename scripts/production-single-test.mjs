// Owner-approved one-time preparation. Publishing stays in the existing fenced runner.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {productionSendPreflight,issueSingleTestPermit,activateSingleTestPermit} from '../src/production/send-preflight.ts';
import {pauseProductionPublisher} from '../src/production/publisher-live.ts';
import {trustedRunnerContext} from './production-runner-live.mjs';
import {readRunnerQuota,githubJSON,REPOSITORY} from './production-runner-quota.mjs';
export const SINGLE_TEST={pageId:'817593604765443',versionId:'production-approved-batch-2026-v1:P01:v1',captionHash:'6ee55f3f8b556298f1da92a276b421e3064a27a8e95fa410495dcd53d4c59cc2',imageChecksum:'768a2322450779c9d3629213442f9ff344ee13bb30f11a6978e68c8cc0ccb251',actor:'tranthanhtung37@gmail.com'};
const ACCOUNT='4d46e32e5c27ff522ee857308a53e729',DB='09cdecc7-36a2-4196-950e-ef68b1ecd834',BUCKET='nttu-publisher-production-assets';
export async function prepareSingleTest(e,approval,{transport=fetch,clock=Date.now}={}){
 const now=clock();assert(approval?.approved===true&&approval.releaseSha===e.RELEASE_SHA&&approval.pageId===SINGLE_TEST.pageId&&approval.actor===SINGLE_TEST.actor&&approval.maxPosts===1&&approval.expiresAt>now&&approval.expiresAt<=now+3600000,'SINGLE_TEST_APPROVAL_REQUIRED');
 assert.equal(e.PRODUCTION_RUNNER_ENABLED,'true');assert.equal(e.PRODUCTION_PUBLISHER_ENABLED,'false');
 const review=await productionSendPreflight(e,{versionId:approval.versionId},transport,clock);
 assert.equal(review.dossier.versionId,approval.versionId);assert.equal(review.dossier.captionHash,approval.captionHash);assert.equal(review.dossier.imageChecksum,approval.imageChecksum);
 assert(review.dossier.expiresAt<=approval.expiresAt,'SINGLE_TEST_WINDOW_TOO_SHORT');
 // These existing functions recheck the complete approval and SQL fences.
 // The local admin binding permits this operation, never the legacy Worker transport.
 const admin={...e,PRODUCTION_PUBLISHER_ENABLED:'true'};
 const permit=await issueSingleTestPermit(admin,review,{actor:approval.actor,dossierHash:review.dossierHash},clock);
 await activateSingleTestPermit(admin,permit.permitId,approval.actor,clock);
 return {permitId:permit.permitId,dueAt:review.dossier.dueAt,expiresAt:review.dossier.expiresAt,versionId:approval.versionId,pageId:approval.pageId,captionHash:approval.captionHash,imageChecksum:approval.imageChecksum,preparationVerified:true,facebookPosts:0};
}
export function cloudBindings(env,transport=fetch){
 assert(env.CLOUDFLARE_API_TOKEN,'SINGLE_TEST_CLOUDFLARE_REQUIRED');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
 async function query(batch){
  const r=await transport(endpoint+'/d1/database/'+DB+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({batch}),redirect:'error',signal:AbortSignal.timeout(20000)});
  const j=await r.json();assert(r.ok&&j.success&&j.result.length===batch.length&&j.result.every(r=>r.success),'SINGLE_TEST_D1_UNAVAILABLE');return j.result;
 }
 const db={prepare(sql){let params=[];return {bind(...p){params=p;return this;},spec(){return {sql,params};},async first(){return (await query([this.spec()]))[0].results[0]??null;},async all(){return (await query([this.spec()]))[0];},async run(){return (await query([this.spec()]))[0];}};},batch(statements){return query(statements.map(s=>s.spec()));}};
 const media={async get(key){
  assert(typeof key==='string'&&key.length<512&&!key.includes('..'),'SINGLE_TEST_IMAGE_KEY_INVALID');
  const r=await transport(endpoint+'/r2/buckets/'+BUCKET+'/objects/'+encodeURIComponent(key),{headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
  assert(r.ok,'SINGLE_TEST_R2_UNAVAILABLE');let size=0,parts=[];const reader=r.body.getReader();
  while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>5242880){await reader.cancel();throw Error('SINGLE_TEST_IMAGE_LIMIT');}parts.push(p.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  return {size,arrayBuffer:async()=>bytes.buffer};
 }};
 return {APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:env.GITHUB_SHA,PRODUCTION_DATABASE_ID:DB,PRODUCTION_ASSET_BUCKET:BUCKET,PRODUCTION_RUNNER_ENABLED:'true',PRODUCTION_PUBLISHER_ENABLED:'false',META_PAGE_ID:SINGLE_TEST.pageId,META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:env.META_APP_SECRET,META_PAGE_ACCESS_TOKEN:env.META_PAGE_ACCESS_TOKEN,DB:db,MEDIA:media};
}
export async function singleTestCommand(env,mode,{transport=fetch,clock=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 assert(trustedRunnerContext(env),'SINGLE_TEST_CONTEXT_INVALID');
 const run=await githubJSON('/repos/'+REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID,env.GITHUB_TOKEN,transport);
 assert(run.head_sha===env.GITHUB_SHA&&run.head_branch==='main'&&run.event==='workflow_dispatch'&&run.path==='.github/workflows/production-runner.yml'&&run.status==='in_progress','SINGLE_TEST_RUN_INVALID');
 const e=cloudBindings(env,transport);
 if(mode==='close'){await pauseProductionPublisher(e,SINGLE_TEST.actor,clock());return {state:'closed',facebookPosts:0};}
 assert.equal(mode,'prepare');
 const policy=JSON.parse(env.PRODUCTION_BILLING_POLICY??'null');assert.equal(policy?.releaseSha,env.GITHUB_SHA);
 const quota=await readRunnerQuota({token:env.PRODUCTION_BILLING_READ_TOKEN,policy,transport,now:clock()});assert(quota.allowed,'SINGLE_TEST_QUOTA_BLOCKED');
 const approval=JSON.parse(env.PRODUCTION_SINGLE_TEST_APPROVAL??'null');
 for(const [key,value] of Object.entries(SINGLE_TEST))assert.equal(approval?.[key],value,'SINGLE_TEST_FIXED_CONTENT_REQUIRED');
 const prepared=await prepareSingleTest(e,approval,{transport,clock});
 const delay=prepared.dueAt-clock();assert(delay>0&&delay<=180000,'SINGLE_TEST_TIME_INVALID');await wait(delay);
 assert(clock()<prepared.expiresAt,'SINGLE_TEST_EXPIRED');return {...prepared,state:'due'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('PRODUCTION_SINGLE_TEST '+JSON.stringify(await singleTestCommand(process.env,process.argv[2])));}catch{console.error('SINGLE_TEST_PREPARATION_OR_CLEANUP_FAILED');process.exitCode=1;}
}
