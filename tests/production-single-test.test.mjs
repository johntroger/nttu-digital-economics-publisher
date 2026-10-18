import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSingleTest,singleTestCommand,SINGLE_TEST,cloudBindings} from '../scripts/production-single-test.mjs';
import {runnerFixture} from './helpers/production-runner-http.mjs';
import {runSimulatedActionsRunner} from '../scripts/production-actions-runner.mjs';
import {publicationHash} from '../src/production/publisher-provider.ts';
import {LIVE_TEST_TIME} from './helpers/production-live-fixture.mjs';
const count=(f,t)=>f.db.prepare('SELECT count(*) n FROM '+t).get().n;
async function scenario(){const f=await runnerFixture({open:false});const approval={...SINGLE_TEST,approved:true,releaseSha:f.env.RELEASE_SHA,maxPosts:1,expiresAt:LIVE_TEST_TIME+1800000,versionId:f.item.versionId,captionHash:await publicationHash(f.item.caption),imageChecksum:f.item.imageChecksum};let gets=0;const transport=async(input,options)=>{assert.equal(options.method,'GET');gets++;const u=new URL(input);return fetch(f.options.mockGraphOrigin+u.pathname+u.search,options);};return {f,approval,transport,gets:()=>gets};}
test('F13 verifies actual image and approval, grants only one test, confirms once and pauses automatically',async()=>{
 const {f,approval,transport,gets}=await scenario();try{
  const prepared=await prepareSingleTest(f.env,approval,{transport,clock:f.now});assert.equal(gets(),2);assert.equal(f.postCount(),0);assert.equal(count(f,'production_send_permits'),1);
  assert.equal(f.db.prepare('SELECT mode FROM production_send_permits').get().mode,'test');
  f.setTime(prepared.dueAt);const result=await runSimulatedActionsRunner({...f.options,expectedRelease:f.env.RELEASE_SHA});assert.equal(result.state,'confirmed');assert.equal(f.postCount(),1);
  assert.equal(f.db.prepare('SELECT enabled FROM production_publisher_config').get().enabled,0);assert.equal(f.db.prepare("SELECT paused_by_user FROM application_state WHERE environment='production'").get().paused_by_user,1);
  await runSimulatedActionsRunner(f.options);assert.equal(f.postCount(),1);
 }finally{await f.dispose();}
});
test('F13 rejects absent, expired, another release or multi-post approval before provider access',async()=>{
 for(const patch of [{approved:false},{expiresAt:LIVE_TEST_TIME},{releaseSha:'b'.repeat(40)},{maxPosts:2}]){const {f,approval,transport,gets}=await scenario();try{await assert.rejects(prepareSingleTest(f.env,{...approval,...patch},{transport,clock:f.now}));assert.equal(gets(),0);assert.equal(count(f,'production_send_permits'),0);}finally{await f.dispose();}}
});
test('F13 refuses a changed caption or image approval without activating publication',async()=>{
 for(const key of ['captionHash','imageChecksum']){const {f,approval,transport}=await scenario();try{await assert.rejects(prepareSingleTest(f.env,{...approval,[key]:'b'.repeat(64)},{transport,clock:f.now}));assert.equal(count(f,'production_send_permits'),0);assert.equal(f.db.prepare('SELECT enabled FROM production_publisher_config').get().enabled,0);}finally{await f.dispose();}}
});
test('F13 corrupted R2 bytes stop preparation before Meta or permit creation',async()=>{
 const {f,approval,transport,gets}=await scenario();try{const e={...f.env,MEDIA:{get:async()=>({size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer})}};await assert.rejects(prepareSingleTest(e,approval,{transport,clock:f.now}));assert.equal(gets(),0);assert.equal(count(f,'production_send_permits'),0);}finally{await f.dispose();}
});
test('F13 source change during GET blocks the immutable review before a permit',async()=>{
 const {f,approval,transport}=await scenario();try{const wire=async(input,opts)=>{const result=await transport(input,opts);if(new URL(input).pathname.endsWith('/me'))f.db.exec("UPDATE sources SET status='blocked'");return result;};await assert.rejects(prepareSingleTest(f.env,approval,{transport:wire,clock:f.now}));assert.equal(count(f,'production_send_permits'),0);assert.equal(f.postCount(),0);}finally{await f.dispose();}
});
test('F13 untrusted invocation cannot use D1, Meta, quota or cleanup',async()=>{let calls=0;for(const mode of ['prepare','close'])await assert.rejects(singleTestCommand({PRODUCTION_ACTIONS_ENABLED:'false'},mode,{transport:async()=>{calls++;throw Error('forbidden');}}));assert.equal(calls,0);});
test('F13 Cloudflare adapter uses documented batch and preserves parameter binding',async()=>{
 const seen=[];const e=cloudBindings({CLOUDFLARE_API_TOKEN:'fixture-only',GITHUB_SHA:'a'.repeat(40)},async(input,options)=>{seen.push({input,body:JSON.parse(options.body)});return Response.json({success:true,result:[{success:true,results:[{n:1}]}]});});
 assert.deepEqual(await e.DB.prepare('SELECT ? n').bind(1).first(),{n:1});assert.deepEqual(seen[0].body,{batch:[{sql:'SELECT ? n',params:[1]}]});assert.ok(seen[0].input.endsWith('/09cdecc7-36a2-4196-950e-ef68b1ecd834/query'));
});
