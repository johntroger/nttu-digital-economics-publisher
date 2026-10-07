import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {operationsStatus,enqueueProductionTelegramTest,runProductionOperations,monitorAuthorized,productionMonitorStatus,runProductionHttpTick,triggerAuthorized} from '../src/production/operations.ts';
import worker from '../src/production/worker.ts';
const now=Date.parse('2026-10-07T04:00:00Z'),chat='1548618770',token='123456789:'+ 't'.repeat(35);
function fixture(){const db=new DatabaseSync(':memory:');for(const f of productionMigrations('09cdecc7-36a2-4196-950e-ef68b1ecd834'))db.exec(f.sql);
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

