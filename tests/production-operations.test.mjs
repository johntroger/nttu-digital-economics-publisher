import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {operationsStatus,enqueueProductionTelegramTest,runProductionOperations,monitorAuthorized,productionMonitorStatus,runProductionHttpTick,triggerAuthorized} from '../src/production/operations.ts';
import worker from '../src/production/worker.ts';
import {metaFingerprint} from '../src/cloud/meta.ts';
const now=Date.parse('2026-10-07T04:00:00Z'),chat='1548618770',token='123456789:'+ 't'.repeat(35);
function fixture({runner=false}={}){const db=new DatabaseSync(':memory:');for(const f of productionMigrations('09cdecc7-36a2-4196-950e-ef68b1ecd834',{publisherRunner:runner}))db.exec(f.sql);
 const env={APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:'09cdecc7-36a2-4196-950e-ef68b1ecd834',RELEASE_SHA:'a'.repeat(40),AUTH_ORIGIN:'https://nttu-publisher-production.example.workers.dev',TELEGRAM_ENABLED:'true',TELEGRAM_CHAT_ID:chat,TELEGRAM_BOT_TOKEN:token,PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};return{db,env};}
const cron={cron:'*/5 * * * *',scheduledTime:now};
test('HTTP authorization is separate; invalid method, token, payload and disabled source fail closed',async()=>{const f=fixture();try{
 f.env.PRODUCTION_TRIGGER_TOKEN='d'.repeat(64);const url=f.env.AUTH_ORIGIN+'/api/production/tick',headers={Authorization:'Bearer '+f.env.PRODUCTION_TRIGGER_TOKEN};
 for(const method of ['GET','PUT'])assert.equal((await worker.fetch(new Request(url,{method}),f.env)).status,405);
 for(const bearer of ['',f.env.PRODUCTION_MONITOR_TOKEN,'e'.repeat(64)])assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:'Bearer '+bearer}}),f.env)).status,401);
 assert.equal((await worker.fetch(new Request(url,{method:'POST',headers}),f.env)).status,503);
 assert.equal((await worker.fetch(new Request(url,{method:'POST',headers,body:'{}'}),f.env)).status,422);
 assert.equal((await worker.fetch(new Request(url+'?token=bad',{method:'POST',headers}),f.env)).status,401);
 assert.equal(await triggerAuthorized(new Request(url,{headers:{Authorization:'Bearer '+f.env.PRODUCTION_MONITOR_TOKEN}}),{...f.env,PRODUCTION_TRIGGER_TOKEN:f.env.PRODUCTION_MONITOR_TOKEN}),false);
 assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+'/api/management',{headers}),f.env)).status,401);
 }finally{f.db.close();}});
test('HTTP concurrent ticks coalesce and process one item while Cron evidence stays separate',async()=>{const f=fixture();try{
 f.db.exec('UPDATE production_http_trigger SET enabled=1');for(let i=0;i<2;i++)await enqueueProductionTelegramTest(f.env,{requestId:crypto.randomUUID()});
 let release,entered,calls=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const transport=async()=>{calls++;entered();await gate;return Response.json({ok:true,result:{message_id:18,chat:{id:Number(chat),type:'private'}}});};
 const first=runProductionHttpTick(f.env,{now,transport});await started;
 assert.equal((await runProductionHttpTick(f.env,{now:now+1,transport})).state,'coalesced');
 assert.equal((await runProductionOperations(cron,f.env,{now,transport})).state,'http_selected');assert.equal(calls,1);
 release();assert.equal((await first).state,'delivered');assert.equal((await runProductionHttpTick(f.env,{now:now+2,transport})).state,'coalesced');
 const s=await operationsStatus(f.env);assert.equal(s.triggerSource,'http');assert.equal(s.http.heartbeat_count,1);assert.equal(s.runtime.heartbeat_count,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE state='pending'").get().n,1);
 for(const table of ['publish_jobs','schedule_slots','publications'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
 }finally{f.db.close();}});
test('HTTP expired lease recovers and lost provider response stays unknown with cooldown',async()=>{const f=fixture();try{
 f.db.exec('UPDATE production_http_trigger SET enabled=1');await enqueueProductionTelegramTest(f.env,{requestId:crypto.randomUUID()});
 assert.equal((await runProductionHttpTick(f.env,{now,transport:async()=>{throw Error(token);}})).state,'delivery_unknown');assert.ok(!JSON.stringify(await operationsStatus(f.env)).includes(token));
 let calls=0;assert.equal((await runProductionHttpTick(f.env,{now:now+1000,transport:async()=>{calls++;throw Error('lost');}})).state,'coalesced');assert.equal(calls,0);
 f.db.prepare('UPDATE production_http_trigger SET lease_id=?,lease_until=?,last_tick_bucket=?').run('crashed',now+120000,Math.floor((now+60000)/60000));
 assert.equal((await runProductionHttpTick(f.env,{now:now+119999})).state,'coalesced');assert.equal((await runProductionHttpTick(f.env,{now:now+120000,transport:async()=>{throw Error('lost');}})).state,'delivery_unknown');
 assert.equal(f.db.prepare('SELECT lease_id FROM production_http_trigger').get().lease_id,null);assert.equal(f.db.prepare('SELECT state FROM notification_outbox').get().state,'delivery_unknown');
 }finally{f.db.close();}});
test('production notification cron sends the fixed owner test once with production label and never publishes',async()=>{const f=fixture();try{const input={requestId:crypto.randomUUID()},event=await enqueueProductionTelegramTest(f.env,input);assert.deepEqual(await enqueueProductionTelegramTest(f.env,input),event);let calls=0;
 const transport=async(url,init)=>{calls++;assert.equal(init.method,'POST');assert.equal(init.redirect,'manual');assert.equal(url,'https://api.telegram.org/bot'+token+'/sendMessage');const p=JSON.parse(init.body);assert.equal(p.chat_id,chat);assert.match(p.text,/\[PRODUCTION\]/);assert.ok(!p.text.includes('STAGING'));return Response.json({ok:true,result:{message_id:17,chat:{id:Number(chat),type:'private'}}});};
 assert.equal((await runProductionOperations(cron,f.env,{now,transport})).state,'delivered');await runProductionOperations(cron,f.env,{now,transport});assert.equal(calls,1);assert.equal(f.db.prepare('SELECT heartbeat_count FROM production_operations').get().heartbeat_count,1);
 for(const table of ['publish_jobs','schedule_slots','publications','page_connections'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);assert.equal((await operationsStatus(f.env)).events[0].message_id,'17');
 }finally{f.db.close();}});
test('production rejects staging payloads and changed recipients; lost Telegram response remains unknown and respects cooldown',async()=>{const f=fixture();try{
 const id=await enqueueProductionTelegramTest(f.env,{requestId:crypto.randomUUID()});let calls=0;const transport=async()=>{calls++;throw Error(token);};assert.equal((await runProductionOperations(cron,f.env,{now,transport})).state,'delivery_unknown');await runProductionOperations({...cron,scheduledTime:now+1000},f.env,{now:now+1000,transport});assert.equal(calls,1);assert.ok(!JSON.stringify(await operationsStatus(f.env)).includes(token));
 assert.equal((await runProductionOperations({...cron,scheduledTime:now+300000},{...f.env,TELEGRAM_CHAT_ID:'99999'},{now:now+300000,transport})).state,'unconfigured');assert.equal(calls,1);
 f.db.prepare('UPDATE notification_outbox SET payload_json=? WHERE event_id=?').run(JSON.stringify({environment:'staging',kind:'connection_test'}),id.eventId);
 assert.equal((await runProductionOperations({...cron,scheduledTime:now+300000},f.env,{now:now+300000,transport})).state,'needs_action');assert.equal(calls,1);
 }finally{f.db.close();}});
test('monitor credential is read-only and cannot obtain owner content or send Telegram; unsafe schedules and unpause fail closed',async()=>{const f=fixture();try{
 const headers={Authorization:'Bearer '+f.env.PRODUCTION_MONITOR_TOKEN};assert.equal(await monitorAuthorized(new Request(f.env.AUTH_ORIGIN,{headers}),f.env),true);
 const response=await worker.fetch(new Request(f.env.AUTH_ORIGIN+'/api/production/monitor',{headers}),f.env);assert.equal(response.status,200);assert.equal((await response.json()).publishingEnabled,false);
 for(const path of ['/api/management','/api/telegram/test','/api/library/files/test'])assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+path,{method:'POST',headers}),f.env)).status,401);
 assert.equal(await monitorAuthorized(new Request(f.env.AUTH_ORIGIN,{headers:{Authorization:'Bearer '+ 'c'.repeat(64)}}),f.env),false);
 await assert.rejects(runProductionOperations({cron:'0 3 * * *',scheduledTime:now},f.env));f.db.exec("UPDATE application_state SET paused_by_user=0");await assert.rejects(productionMonitorStatus(f.env));
 }finally{f.db.close();}});

test('bounded monitor counts and runtime match the owner view without returning notification contents',async()=>{const f=fixture();try{
 for(let i=0;i<105;i++)f.db.prepare('INSERT INTO notification_outbox(event_id,payload_json,state,message_id) VALUES(?,?,?,?)').run('monitor-'+i,JSON.stringify({private:'caption '+i}),i%3===0?'delivered':i%3===1?'pending':'needs_action',i%3===0?String(i+1):null);
 const owner=await operationsStatus(f.env),monitor=await productionMonitorStatus(f.env,{now});
 assert.deepEqual(monitor.runtime,{...owner.runtime});assert.deepEqual(monitor.http,{...owner.http});
 assert.equal(monitor.notificationsPending,owner.events.filter(e=>e.state!=='delivered').length);
 assert.equal(monitor.notificationsBlocked,owner.events.filter(e=>['needs_action','delivery_unknown'].includes(e.state)).length);
 assert.equal(monitor.triggerSource,owner.triggerSource);assert.equal(monitor.paused,owner.paused);
 assert.ok(!JSON.stringify(monitor).includes('caption '));assert.equal(monitor.publishingEnabled,false);
 }finally{f.db.close();}});

test('F12 monitor exposes only the configuration fingerprint for Node comparison, never verifies or sends in schema16',async()=>{const f=fixture({runner:true});try{
 Object.assign(f.env,{META_CONNECTION_PURPOSE:'production_verify',META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_APP_SECRET:'private-app-fixture-123456789',META_PAGE_ACCESS_TOKEN:'private-page-fixture-123456789'});
 const before=f.db.prepare('SELECT count(*) n FROM cloud_meta_checks').get().n;
 const status=await productionMonitorStatus(f.env,{now,transport:async()=>assert.fail('No provider call authorized')});
 assert.equal(status.release,f.env.RELEASE_SHA);assert.equal(status.metaConfigurationHash,await metaFingerprint(f.env));assert.equal(status.metaVerified,false);assert.equal(status.metaVerificationSource,'node_required');
 assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_meta_checks').get().n,before);
 const rotated=await productionMonitorStatus({...f.env,META_PAGE_ACCESS_TOKEN:'rotated-page-fixture-123456789'},{now,transport:async()=>assert.fail()});assert.notEqual(rotated.metaConfigurationHash,status.metaConfigurationHash);
 for(const secret of [f.env.META_APP_SECRET,f.env.META_PAGE_ACCESS_TOKEN])assert.ok(!JSON.stringify(status).includes(secret));
 }finally{f.db.close();}});

