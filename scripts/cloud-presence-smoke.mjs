import assert from 'node:assert/strict';
import {managementFixture} from './cloud-management-smoke.mjs';
import {seedDailyFixture} from '../tests/helpers/cloud-daily-fixture.mjs';
import {scanPresence,readPresence} from '../src/cloud/presence.ts';
import {TRIAL_PAGE} from '../src/cloud/meta-trial.ts';
export async function runPresenceD1Smoke(){
 const f=await seedDailyFixture(await managementFixture()),now=Date.parse('2026-10-08T01:00:00Z'),run=TRIAL_PAGE+':2026-10-08';let reads=0;
 const transport=async(url,init)=>{assert.equal(init.method,'GET');if(String(url).includes('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,scopes:['pages_read_engagement','pages_manage_posts'],expires_at:0,data_access_expires_at:0}});if(String(url).includes('/me?'))return Response.json({id:TRIAL_PAGE,name:'D1 fixture'});reads++;return Response.json({id:new URL(url).pathname.split('/').pop()});};
 try{
  await f.env.DB.batch([f.env.DB.prepare('UPDATE application_state SET paused_by_user=1'),f.env.DB.prepare('UPDATE cloud_daily_config SET enabled=0'),f.env.DB.prepare('INSERT INTO cloud_presence_runs VALUES(?,?,?,?,NULL,?)').bind(run,TRIAL_PAGE,'2026-10-08',now,'fixture'),...Array.from({length:12},(_,i)=>f.env.DB.prepare('INSERT INTO cloud_presence_items(run_id,remote_id) VALUES(?,?)').bind(run,TRIAL_PAGE+'_'+(90000000+i)))]);
  const scan=()=>scanPresence(f.env,{now,transport});await Promise.all([scan(),scan()]);await scan();assert.equal(reads,12);assert.equal((await readPresence(f.env)).observations.length,12);assert.equal((await scan()).state,'day_complete');
  assert.equal((await f.env.DB.prepare('SELECT enabled FROM cloud_daily_config').first()).enabled,0);
  console.log('Presence D1 passed: concurrent once-daily claims, twelve GET observations, atomic history projection, daily paused. Graph mocked.');
 }finally{await f.dispose();}
}
