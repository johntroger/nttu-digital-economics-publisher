import type {ManagementBindings} from './management.ts';
import {productionState} from './management.ts';
import {productionMetaStatus} from './meta.ts';
import {telegramConfigured,dispatchTelegramQueue} from '../cloud/telegram.ts';
import {inspectMetaConnection} from '../cloud/meta.ts';

export async function operationsSchema(env:ManagementBindings){return Boolean(await env.DB!.prepare("SELECT 1 FROM schema_migrations WHERE name='0012_production_operations.sql'").first());}
export async function operationsStatus(env:ManagementBindings){
 await productionState(env);const schemaReady=await operationsSchema(env);
 const runtime=schemaReady?await env.DB!.prepare('SELECT last_scheduled_at,heartbeat_count,last_dispatch_state FROM production_operations WHERE id=1').first():null;
 const events=(await env.DB!.prepare('SELECT event_id,state,tries,next_at,message_id,last_error FROM notification_outbox ORDER BY rowid DESC LIMIT 100').all!()).results;
 return{environment:'production',configured:telegramConfigured(env)&&env.TELEGRAM_CHAT_ID==='1548618770',schemaReady,runtime,events,publishingEnabled:false};
}
export async function enqueueProductionTelegramTest(env:ManagementBindings,input:unknown){
 const status=await operationsStatus(env);if(!status.schemaReady||!status.configured)throw Error('TELEGRAM_NOT_CONFIGURED');
 const request=(input as {requestId?:unknown}|null)?.requestId;
 if(typeof request!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request))throw Error('TELEGRAM_REQUEST_INVALID');
 const eventId='production-telegram-test:'+request;
 await env.DB!.prepare('INSERT INTO notification_outbox(event_id,payload_json) VALUES(?,?) ON CONFLICT(event_id) DO NOTHING').bind(eventId,JSON.stringify({kind:'connection_test',environment:'production',page:'Ngành Kinh tế số - NTTU'})).run();
 return{eventId,queued:true};
}
export async function runProductionOperations(event:{cron:string;scheduledTime:number},env:ManagementBindings,options:Parameters<typeof dispatchTelegramQueue>[2]={}){
 await productionState(env);if(!await operationsSchema(env))return{state:'schema_pending'};
 if(event.cron!=='*/5 * * * *'||!Number.isSafeInteger(event.scheduledTime)||event.scheduledTime<0)throw Error('OPERATIONS_SCHEDULE_INVALID');
 await env.DB!.prepare(`UPDATE production_operations SET last_scheduled_at=?,heartbeat_count=heartbeat_count+1 WHERE id=1 AND (last_scheduled_at IS NULL OR last_scheduled_at<?)`).bind(event.scheduledTime,event.scheduledTime).run();
 if(env.TELEGRAM_CHAT_ID!=='1548618770')return{state:'unconfigured'};
 const result=await dispatchTelegramQueue(env,'production',options);
 await env.DB!.prepare('UPDATE production_operations SET last_dispatch_state=? WHERE id=1').bind(result.state).run();return result;
}
export async function monitorAuthorized(request:Request,env:ManagementBindings){
 const token=env.PRODUCTION_MONITOR_TOKEN,received=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token??'')||!received||!/^Bearer /.test(request.headers.get('Authorization')??'')||received.length!==64)return false;
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await hash(token!),b=await hash(received);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]!^b[i]!;return difference===0;
}
export async function productionMonitorStatus(env:ManagementBindings){
 const ops=await operationsStatus(env),meta=await productionMetaStatus(env);
 const live=meta.configured?await inspectMetaConnection(env):null;
 return{environment:'production',databaseChecked:true,publishingEnabled:false,paused:true,schemaReady:ops.schemaReady,telegramConfigured:ops.configured,runtime:ops.runtime,
  metaConfigured:meta.configured,metaVerified:live?.state==='verified_read_only',metaExpiresAt:live?.expires??null,
  dataAccessExpiresAt:live?.dataExpires??null,
  notificationsPending:ops.events.filter((e:any)=>!['delivered'].includes(e.state)).length};
}
