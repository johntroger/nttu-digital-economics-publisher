import type {CloudBindings} from './runtime.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';
type Row=Record<string,unknown>;
type Transport=(input:string,init:RequestInit)=>Promise<Response>;
function fail(code:string,status=422):never{throw new CatalogError(code,status);}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const iso=(n:number)=>new Date(n).toISOString();
const rows=async(env:CloudBindings,sql:string,...values:(string|number|null)[]) => (await env.DB!.prepare(sql).bind(...values).all!<Row>()).results;
export function telegramConfigured(env:CloudBindings){return env.TELEGRAM_ENABLED==='true'&&/^\d{5,20}:[A-Za-z0-9_-]{30,100}$/.test(env.TELEGRAM_BOT_TOKEN??'')&&/^[1-9]\d{3,19}$/.test(env.TELEGRAM_CHAT_ID??'');}
export async function discoverTelegram(env:CloudBindings,transport:Transport=fetch){
  await readStatus(env);if(!/^\d{5,20}:[A-Za-z0-9_-]{30,100}$/.test(env.TELEGRAM_BOT_TOKEN??''))fail('TELEGRAM_TOKEN_MISSING',409);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await transport('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/getUpdates',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:10,timeout:0,allowed_updates:['message']}),signal:controller.signal});
    const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();fail('TELEGRAM_DISCOVERY_FAILED',503);}parts.push(part.value);}}
    const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
    const body=JSON.parse(new TextDecoder().decode(bytes)) as {ok?:boolean;result?:{message?:{text?:string;chat?:{id?:number;type?:string}}}[]};
    if(response.status!==200||body.ok!==true||!Array.isArray(body.result))fail('TELEGRAM_DISCOVERY_FAILED',503);
    const ids=[...new Set(body.result.filter(u=>u.message?.chat?.type==='private'&&u.message?.text?.trim()==='/start'&&Number.isSafeInteger(u.message.chat.id)&&u.message.chat.id!>0).map(u=>String(u.message!.chat!.id)))];
    return{chatIds:ids};
  }catch{fail('TELEGRAM_DISCOVERY_FAILED',503);}finally{clearTimeout(timer);}
}
// No payload-supplied recipients, arbitrary text, parse_mode, redirects or raw provider errors.
export function notificationText(eventId:string,payload:unknown):string {
  if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(eventId)||!payload||typeof payload!=='object')fail('TELEGRAM_PAYLOAD_INVALID');
  const p=payload as Row;
  const kinds:Record<string,string>={connection_test:'Tin kiểm thử kết nối Telegram.',published:'Đã đăng bài thành công.',post_failed:'Bài đăng thất bại sau các lần thử đủ điều kiện.',needs_reconciliation:'Cần đối chiếu kết quả đăng bài.',stock_low:'Kho còn không quá 3 bài đủ điều kiện.',stock_empty:'Kho đã hết bài đủ điều kiện.',connection_error:'Kết nối đăng bài cần được xử lý.',reserve_empty:'Không còn bài dự phòng phù hợp.'};
  const kind=String(p.kind);if(!kinds[kind]||p.environment!=='staging')fail('TELEGRAM_PAYLOAD_INVALID');
  const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';
  const lines=['Ngành Kinh tế số · NTTU [STAGING]',kinds[kind]!,'Mã sự kiện: '+eventId];
  for(const [key,label,max] of [['title','Bài',300],['page','Fanpage',100],['time','Thời điểm',80]] as const){const text=clean(p[key],max);if(text)lines.push(label+': '+text);}
  if(typeof p.url==='string'&&p.url.length<500){try{const url=new URL(p.url);if(url.protocol==='https:'&&['www.facebook.com','facebook.com'].includes(url.hostname)&&!url.username&&!url.password&&!url.search&&!url.hash)lines.push(url.href);}catch{}}
  if(kind==='connection_test')lines.push('Lịch đăng Facebook vẫn đang dừng.');
  if(kind==='needs_reconciliation')lines.push('Kiểm tra trong giao diện quản lý; không tự đăng lại khi chưa xác minh.');
  return lines.join('\n');
}
export async function telegramStatus(env:CloudBindings){await readStatus(env);return{configured:telegramConfigured(env),enabled:env.TELEGRAM_ENABLED==='true',personalChatOnly:true,events:await rows(env,'SELECT event_id,state,tries,next_at,message_id,last_error FROM notification_outbox ORDER BY rowid DESC LIMIT 100')};}
export async function enqueueTelegramTest(env:CloudBindings,input:unknown){await readStatus(env);if(!telegramConfigured(env))fail('TELEGRAM_NOT_CONFIGURED',409);const id=(input as {requestId?:unknown}|null)?.requestId;if(!uuid(id))fail('TELEGRAM_REQUEST_INVALID');const eventId='telegram-test:'+id;const payload=JSON.stringify({kind:'connection_test',environment:'staging'});await env.DB!.prepare('INSERT INTO notification_outbox(event_id,payload_json) VALUES(?,?) ON CONFLICT(event_id) DO NOTHING').bind(eventId,payload).run();return{eventId,queued:true};}
export async function retryTelegram(env:CloudBindings,input:unknown){await readStatus(env);if(!telegramConfigured(env))fail('TELEGRAM_NOT_CONFIGURED',409);const p=input as {eventId?:unknown;expectedTries?:unknown}|null;if(typeof p?.eventId!=='string'||!Number.isSafeInteger(p.expectedTries))fail('TELEGRAM_REQUEST_INVALID');await env.DB!.prepare("UPDATE notification_outbox SET state='pending',next_at=NULL,last_error=NULL WHERE event_id=? AND tries=? AND state='needs_action' AND NOT EXISTS(SELECT 1 FROM cloud_telegram_attempts WHERE event_id=? AND state='intent')").bind(p.eventId,p.expectedTries as number,p.eventId).run();return{eventId:p.eventId};}
export async function dispatchTelegram(env:CloudBindings,options:{now?:number;transport?:Transport}={}){
  await readStatus(env);if(!telegramConfigured(env))return{state:'unconfigured'};
  if(!env.DB!.batch)fail('CLOUD_DATABASE_UNAVAILABLE',503);
  const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)fail('TELEGRAM_CLOCK_INVALID');
  const transport=options.transport??fetch;
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN+'|'+env.TELEGRAM_CHAT_ID)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const batch=async(statements:ReturnType<NonNullable<CloudBindings['DB']>['prepare']>[])=>env.DB!.batch!(statements);
  const active=(await rows(env,'SELECT a.* FROM cloud_telegram_runtime r JOIN cloud_telegram_attempts a ON a.id=r.active_attempt WHERE r.id=1'))[0];
  if(active){if(String(active.expires_at)>iso(now))return{state:'busy'};
    // Crash/timeout after intent cannot be called a verified failure; a later notification may duplicate.
    await batch([env.DB!.prepare("UPDATE notification_outbox SET state='delivery_unknown',last_error='TELEGRAM_DELIVERY_UNKNOWN',next_at=? WHERE event_id=? AND EXISTS(SELECT 1 FROM cloud_telegram_attempts WHERE id=? AND state='intent')").bind(iso(now+300000),String(active.event_id),String(active.id)),env.DB!.prepare("UPDATE cloud_telegram_attempts SET state='delivery_unknown',finished_at=?,reason='TELEGRAM_DELIVERY_UNKNOWN' WHERE id=? AND state='intent'").bind(iso(now),String(active.id)),env.DB!.prepare('UPDATE cloud_telegram_runtime SET active_attempt=NULL,next_send_at=? WHERE id=1 AND active_attempt=?').bind(iso(now+300000),String(active.id))]);return{state:'delivery_unknown'};
  }
  const candidates=await rows(env,"SELECT * FROM notification_outbox WHERE state IN ('pending','retry_wait','delivery_unknown') AND (next_at IS NULL OR next_at<=?) ORDER BY rowid LIMIT 1",iso(now));const event=candidates[0];if(!event)return{state:'idle'};
  const eventId=String(event.event_id);let text:string;
  try{text=notificationText(eventId,JSON.parse(String(event.payload_json)));}catch{await env.DB!.prepare("UPDATE notification_outbox SET state='needs_action',last_error='TELEGRAM_PAYLOAD_INVALID' WHERE event_id=? AND tries=? AND state IN ('pending','retry_wait','delivery_unknown')").bind(eventId,Number(event.tries)).run();return{state:'needs_action'};}
  // Do not silently move queued messages to a different bot/chat after credentials change.
  const previous=(await rows(env,'SELECT target_hash FROM cloud_telegram_attempts WHERE event_id=? ORDER BY rowid DESC LIMIT 1',eventId))[0];
  if(previous&&previous.target_hash!==fingerprint){await env.DB!.prepare("UPDATE notification_outbox SET state='needs_action',last_error='TELEGRAM_TARGET_CHANGED' WHERE event_id=? AND state IN ('pending','retry_wait','delivery_unknown')").bind(eventId).run();return{state:'needs_action'};}
  const id=crypto.randomUUID();
  await batch([env.DB!.prepare(`INSERT INTO cloud_telegram_attempts(id,event_id,target_hash,created_at,expires_at,state) SELECT ?,?,?,?,?,'intent' WHERE EXISTS(SELECT 1 FROM cloud_telegram_runtime WHERE id=1 AND active_attempt IS NULL AND (next_send_at IS NULL OR next_send_at<=?)) AND EXISTS(SELECT 1 FROM notification_outbox WHERE event_id=? AND tries=? AND state IN ('pending','retry_wait','delivery_unknown') AND (next_at IS NULL OR next_at<=?))`).bind(id,eventId,fingerprint,iso(now),iso(now+60000),iso(now),eventId,Number(event.tries),iso(now)),env.DB!.prepare("UPDATE notification_outbox SET state='delivery_unknown',tries=tries+1,last_error='TELEGRAM_SEND_INTENT',next_at=? WHERE event_id=? AND EXISTS(SELECT 1 FROM cloud_telegram_attempts WHERE id=? AND state='intent')").bind(iso(now+300000),eventId,id),env.DB!.prepare('UPDATE cloud_telegram_runtime SET active_attempt=?,next_send_at=? WHERE id=1 AND active_attempt IS NULL AND EXISTS(SELECT 1 FROM cloud_telegram_attempts WHERE id=? AND state=\'intent\')').bind(id,iso(now+2000),id)]);
  const claimed=(await rows(env,'SELECT active_attempt FROM cloud_telegram_runtime WHERE id=1'))[0];if(claimed?.active_attempt!==id)return{state:'busy'};
  let state='delivery_unknown',reason='TELEGRAM_DELIVERY_UNKNOWN',messageId:string|null=null,delay=Math.min(3600000,60000*2**Math.min(Number(event.tries),6));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await transport('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text,link_preview_options:{is_disabled:true}}),signal:controller.signal});
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader){while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>32768){await reader.cancel();throw Error('oversized response');}chunks.push(r.value);}}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const body=JSON.parse(new TextDecoder().decode(bytes)) as {ok?:boolean;error_code?:number;parameters?:{retry_after?:number};result?:{message_id?:number;chat?:{id?:number;type?:string}}};
    if(response.status===200&&body.ok===true&&Number.isSafeInteger(body.result?.message_id)&&body.result!.message_id!>0&&String(body.result?.chat?.id)===env.TELEGRAM_CHAT_ID&&body.result?.chat?.type==='private'){state='delivered';reason='';messageId=String(body.result!.message_id);delay=2000;}
    else if(response.status===429&&body.ok===false){state='retry_wait';reason='TELEGRAM_RATE_LIMIT';const seconds=body.parameters?.retry_after;delay=Number.isSafeInteger(seconds)&&seconds!>0&&seconds!<=86400?seconds!*1000:60000;}
    else if([400,401,403,404].includes(response.status)&&body.ok===false){state='needs_action';reason=response.status===401||response.status===404?'TELEGRAM_TOKEN_INVALID':response.status===403?'TELEGRAM_BOT_BLOCKED':'TELEGRAM_CHAT_OR_FORMAT_INVALID';}
  }catch{/* Never persist provider text, token-bearing URL, or transport exception. */}finally{clearTimeout(timer);}
  await batch([env.DB!.prepare('UPDATE notification_outbox SET state=?,next_at=?,message_id=?,last_error=? WHERE event_id=? AND EXISTS(SELECT 1 FROM cloud_telegram_attempts WHERE id=? AND state=\'intent\') AND EXISTS(SELECT 1 FROM cloud_telegram_runtime WHERE id=1 AND active_attempt=?)').bind(state,state==='delivered'||state==='needs_action'?null:iso(now+delay),messageId,reason||null,eventId,id,id),env.DB!.prepare('UPDATE cloud_telegram_attempts SET state=?,finished_at=?,reason=? WHERE id=? AND state=\'intent\' AND EXISTS(SELECT 1 FROM cloud_telegram_runtime WHERE id=1 AND active_attempt=?)').bind(state,iso(now),reason||null,id,id),env.DB!.prepare('UPDATE cloud_telegram_runtime SET active_attempt=NULL,next_send_at=? WHERE id=1 AND active_attempt=?').bind(iso(now+delay),id)]);
  return{state,eventId};
}
