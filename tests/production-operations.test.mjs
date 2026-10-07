import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {operationsStatus,enqueueProductionTelegramTest,runProductionOperations,monitorAuthorized,productionMonitorStatus} from '../src/production/operations.ts';
import worker from '../src/production/worker.ts';
const now=Date.parse('2026-10-07T04:00:00Z'),chat='1548618770',token='123456789:'+ 't'.repeat(35);
function fixture(){const db=new DatabaseSync(':memory:');for(const f of productionMigrations('09cdecc7-36a2-4196-950e-ef68b1ecd834'))db.exec(f.sql);
 const env={APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:'09cdecc7-36a2-4196-950e-ef68b1ecd834',RELEASE_SHA:'a'.repeat(40),AUTH_ORIGIN:'https://nttu-publisher-production.example.workers.dev',TELEGRAM_ENABLED:'true',TELEGRAM_CHAT_ID:chat,TELEGRAM_BOT_TOKEN:token,PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};return{db,env};}
const cron={cron:'*/5 * * * *',scheduledTime:now};
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

