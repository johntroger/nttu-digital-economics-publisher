import type {ManagementBindings} from './management.ts';
import {productionState} from './management.ts';
import {productionMetaStatus} from './meta.ts';
import {telegramConfigured,dispatchTelegramQueue} from '../cloud/telegram.ts';
import {inspectMetaConnection} from '../cloud/meta.ts';

export async function operationsSchema(env:ManagementBindings){return Boolean(await env.DB!.prepare("SELECT 1 FROM schema_migrations WHERE name='0012_production_operations.sql'").first());}
export async function httpTriggerStatus(env:ManagementBindings){
 const ready=await env.DB!.prepare("SELECT 1 FROM schema_migrations WHERE name='0013_production_http_trigger.sql'").first();
 return ready?env.DB!.prepare('SELECT enabled,last_http_at,heartbeat_count,last_complete_at,last_dispatch_state FROM production_http_trigger WHERE id=1').first<Record<string,unknown>>():null;
}
export async function operationsStatus(env:ManagementBindings){
 await productionState(env);const schemaReady=await operationsSchema(env);
 const runtime=schemaReady?await env.DB!.prepare('SELECT last_scheduled_at,heartbeat_count,last_dispatch_state FROM production_operations WHERE id=1').first():null;
 const events=(await env.DB!.prepare('SELECT event_id,state,tries,next_at,message_id,last_error FROM notification_outbox ORDER BY rowid DESC LIMIT 100').all!()).results;
 const http=await httpTriggerStatus(env);
 return{environment:'production',configured:telegramConfigured(env)&&env.TELEGRAM_CHAT_ID==='1548618770',schemaReady,runtime,http,triggerSource:http?.enabled===1?'http':'cron',events,publishingEnabled:false};
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
 if((await httpTriggerStatus(env))?.enabled===1)return{state:'http_selected'};
 if(env.TELEGRAM_CHAT_ID!=='1548618770')return{state:'unconfigured'};
 const result=await dispatchTelegramQueue(env,'production',options);
 await env.DB!.prepare('UPDATE production_operations SET last_dispatch_state=? WHERE id=1').bind(result.state).run();return result;
}
async function bearerAuthorized(request:Request,token:string|undefined){
 const received=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token??'')||!received||!/^Bearer /.test(request.headers.get('Authorization')??'')||received.length!==64)return false;
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const a=await hash(token!),b=await hash(received);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]!^b[i]!;return difference===0;
}
export function monitorAuthorized(request:Request,env:ManagementBindings){return bearerAuthorized(request,env.PRODUCTION_MONITOR_TOKEN);}
export function triggerAuthorized(request:Request,env:ManagementBindings){
 if(env.PRODUCTION_TRIGGER_TOKEN===env.PRODUCTION_MONITOR_TOKEN)return Promise.resolve(false);
 return bearerAuthorized(request,env.PRODUCTION_TRIGGER_TOKEN);
}
// One bounded queue item per server minute. D1's atomic claim fences concurrent HTTP ticks.
// Queue intent/lease survives a killed request; a later tick recovers it without claiming success.
export async function runProductionHttpTick(env:ManagementBindings,options:Parameters<typeof dispatchTelegramQueue>[2]={}){
 await productionState(env);const http=await httpTriggerStatus(env);
 if(!await operationsSchema(env)||http?.enabled!==1)throw Error('HTTP_TRIGGER_DISABLED');
 const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)throw Error('HTTP_TRIGGER_CLOCK_INVALID');
 const bucket=Math.floor(now/60000),lease=crypto.randomUUID();
 const claim=await env.DB!.prepare(`UPDATE production_http_trigger SET lease_id=?,lease_until=?,last_http_at=?,heartbeat_count=heartbeat_count+1,last_tick_bucket=?
 WHERE id=1 AND enabled=1 AND (lease_until IS NULL OR lease_until<=?) AND (last_tick_bucket IS NULL OR last_tick_bucket<?) RETURNING id`).bind(lease,now+60000,now,bucket,now,bucket).first();
 if(!claim)return{state:'coalesced'};
 try{
  const result=env.TELEGRAM_CHAT_ID==='1548618770'?await dispatchTelegramQueue(env,'production',{...options,now}):{state:'unconfigured'};
  await env.DB!.prepare('UPDATE production_http_trigger SET last_complete_at=?,last_dispatch_state=?,lease_id=NULL,lease_until=NULL WHERE id=1 AND lease_id=?').bind(options.now??Date.now(),result.state,lease).run();
  return{state:result.state};
 }catch{
  await env.DB!.prepare("UPDATE production_http_trigger SET last_dispatch_state='failed',lease_id=NULL,lease_until=NULL WHERE id=1 AND lease_id=?").bind(lease).run();
  throw Error('HTTP_TRIGGER_UNAVAILABLE');
 }
}
export async function productionMonitorStatus(env:ManagementBindings){
 const ops=await operationsStatus(env),meta=await productionMetaStatus(env);
 const live=meta.configured?await inspectMetaConnection(env):null;
 return{environment:'production',databaseChecked:true,publishingEnabled:false,paused:true,schemaReady:ops.schemaReady,telegramConfigured:ops.configured,runtime:ops.runtime,http:ops.http,triggerSource:ops.triggerSource,
  metaConfigured:meta.configured,metaVerified:live?.state==='verified_read_only',metaExpiresAt:live?.expires??null,
  dataAccessExpiresAt:live?.dataExpires??null,
  notificationsPending:ops.events.filter((e:any)=>!['delivered'].includes(e.state)).length,
  notificationsBlocked:ops.events.filter((e:any)=>['needs_action','delivery_unknown'].includes(e.state)).length};
}
