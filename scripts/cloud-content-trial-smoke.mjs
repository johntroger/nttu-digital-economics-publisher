import assert from 'node:assert/strict';
import {managementFixture} from './cloud-management-smoke.mjs';
import {seedDailyFixture} from '../tests/helpers/cloud-daily-fixture.mjs';
import {cloudCatalog} from '../src/cloud/catalog.ts';
import {prepareContentTrial,sendContentTrial} from '../src/cloud/content-trial.ts';
import {POLICY} from '../src/domain/policy.ts';
import {TRIAL_PAGE} from '../src/cloud/meta-trial.ts';
export async function runContentTrialD1Smoke(){
 const f=await seedDailyFixture(await managementFixture()),owner={email:POLICY.ownerEmail,sub:'fixture',csrf:''},now=Date.parse('2026-10-07T03:00:00Z');let sends=0,caption='';
 try{
  await f.env.DB.batch([f.env.DB.prepare('UPDATE application_state SET paused_by_user=1'),f.env.DB.prepare('UPDATE cloud_daily_config SET enabled=0'),f.env.DB.prepare('DELETE FROM schedule_slots')]);
  const post=(await cloudCatalog(f.env)).posts.find(p=>p.key==='P01'),requestId=crypto.randomUUID(),options={now,registry:f.registry,transport:async(url,init)=>{
   if(String(url).includes('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,scopes:['pages_read_engagement','pages_manage_posts'],expires_at:0,data_access_expires_at:0}});
   if(String(url).includes('/me?'))return Response.json({id:TRIAL_PAGE,name:'D1 fixture'});
   if(init.method==='POST'){sends++;caption=init.body.get('caption');return Response.json({id:'1234567890',post_id:TRIAL_PAGE+'_1234567890'});}
   return Response.json({id:TRIAL_PAGE+'_1234567890',message:caption,created_time:new Date(now).toISOString()});
  }};
  await prepareContentTrial(f.env,owner,{requestId,expectedVersion:post.versionId},options);
  const send=()=>sendContentTrial(f.env,owner,{requestId,confirmPageId:TRIAL_PAGE,approveCaption:true,approveImage:true},options);
  await Promise.all([send(),send()]);assert.equal((await send()).state,'published');assert.equal(sends,1);
  assert.equal((await cloudCatalog(f.env)).publications.length,1);
  for(const table of ['publish_jobs','schedule_slots','publications'])assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM '+table).first()).n,0);
  assert.equal((await f.env.DB.prepare('SELECT paused_by_user FROM application_state').first()).paused_by_user,1);
  console.log('Content P01 trial D1/R2 passed: one concurrent binary send, immutable receipt, history/outbox, daily paused. Graph mocked.');
 }finally{await f.dispose();}
}
