// Actual local D1/R2 bindings; all Graph responses remain injected fixtures.
import assert from 'node:assert/strict';
import {managementFixture} from './cloud-management-smoke.mjs';
import {seedDailyFixture} from '../tests/helpers/cloud-daily-fixture.mjs';
import {runDaily} from '../src/cloud/daily.ts';
import {TRIAL_PAGE} from '../src/cloud/meta-trial.ts';
export async function runDailyD1Smoke(){
 const f=await seedDailyFixture(await managementFixture());let sends=0,caption='';
 const time=Date.parse('2026-10-07T03:00:00Z');
 const transport=async(url,init)=>{
  if(String(url).includes('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,scopes:['pages_read_engagement','pages_manage_posts'],expires_at:0,data_access_expires_at:0}});
  if(String(url).includes('/me?'))return Response.json({id:TRIAL_PAGE,name:'D1 fixture'});
  if(init.method==='POST'){sends++;caption=init.body.get('caption');return Response.json({id:'1234567890',post_id:TRIAL_PAGE+'_1234567890'});}
  return Response.json({id:TRIAL_PAGE+'_1234567890',message:caption,created_time:new Date(time).toISOString()});
 };
 try{
  const run=()=>runDaily(f.env,{now:time,transport,registry:f.registry});
  assert.equal((await run()).state,'prepared');
  await Promise.all([run(),run()]);assert.equal(sends,1);
  assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM publications').first()).n,1);
  await run();await run();assert.equal(sends,1);
  assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM notification_outbox WHERE event_id LIKE \'published:%\'').first()).n,1);
  console.log('Daily publisher D1/R2 passed: concurrent intents, one binary send, atomic history/outbox, same-day dedup. Graph transport is mocked.');
 }finally{await f.dispose();}
}
