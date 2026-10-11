import {pathToFileURL} from 'node:url';

export const STATE_TITLE='[Operations] Independent staging monitor state';
export const PRODUCTION_STATE_TITLE='[Operations] Independent production monitor state';
export const PRODUCTION_MONITOR_SQL=`SELECT i.environment,a.paused_by_user,c.enabled,o.last_scheduled_at,
 h.enabled http_enabled,h.last_http_at,h.last_complete_at,
 (SELECT count(*) FROM schema_migrations) migration_count,
 (SELECT count(*) FROM publish_jobs) jobs,
 (SELECT count(*) FROM publications) publications
 FROM production_identity i JOIN application_state a ON a.environment=i.environment
 JOIN production_control c ON c.id=i.id JOIN production_operations o ON o.id=i.id JOIN production_http_trigger h ON h.id=i.id WHERE i.id=1`;
export const MONITOR_SQL=`SELECT r.environment,r.last_scheduled_at,a.paused_by_user,c.enabled,c.start_date,c.test_publish_at,
 (SELECT count(*) FROM publications p JOIN publish_jobs j ON j.id=p.job_id WHERE j.page_connection_id=c.page_connection_id AND j.slot_id IS NOT NULL AND p.remote_business_date=?) AS published_today,
 (SELECT count(*) FROM publish_jobs j JOIN schedule_slots s ON s.id=j.slot_id WHERE j.page_connection_id=c.page_connection_id AND s.business_date<=? AND j.state IN ('unknown','publish_requested','evidence_pending')) AS unresolved_today
 FROM cloud_runtime r JOIN application_state a ON a.environment=r.environment JOIN cloud_daily_config c ON c.id=1 WHERE r.id=1`;
const ORIGIN='https://nttu-publisher-staging.nttu-kts-johntroger.workers.dev';
export function externalTriggerTemplate(){return {
 url:'https://api.github.com/repos/johntroger/nttu-digital-economics-publisher/actions/workflows/monitor.yml/dispatches',
 method:'POST',headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
 body:{ref:'main',inputs:{send_test:'false',trigger_source:'cron-job.org',triggered_at:'%cjo:unixtime%'}}
};}
export function settings(env){
 if(env.MONITOR_TARGET==='production'){
  const origin='https://nttu-publisher-production.nttu-kts-johntroger.workers.dev';
  if(env.PRODUCTION_WORKER_URL?.replace(/\/$/,'')!==origin||env.GITHUB_REPOSITORY!=='johntroger/nttu-digital-economics-publisher'||!/^\d+$/.test(env.MONITOR_STATE_ISSUE??'')||env.MONITOR_TELEGRAM_CHAT_ID!=='1548618770'||!env.GITHUB_TOKEN||!/^\d+:[A-Za-z0-9_-]+$/.test(env.MONITOR_TELEGRAM_BOT_TOKEN??'')||!env.CLOUDFLARE_API_TOKEN||env.CLOUDFLARE_ACCOUNT_ID!=='4d46e32e5c27ff522ee857308a53e729'||env.PRODUCTION_D1_DATABASE_ID!=='09cdecc7-36a2-4196-950e-ef68b1ecd834'||!/^[a-f0-9]{64}$/.test(env.PRODUCTION_MONITOR_TOKEN??''))throw Error('Monitor configuration missing or invalid; secret values suppressed');
  return{...env,origin,target:'production'};
 }
 if(env.STAGING_WORKER_URL?.replace(/\/$/,'')!==ORIGIN||env.GITHUB_REPOSITORY!=='johntroger/nttu-digital-economics-publisher'||!/^\d+$/.test(env.MONITOR_STATE_ISSUE??'')||env.MONITOR_TELEGRAM_CHAT_ID!=='1548618770'||!env.GITHUB_TOKEN||!/^\d+:[A-Za-z0-9_-]+$/.test(env.MONITOR_TELEGRAM_BOT_TOKEN??'')||!env.CLOUDFLARE_API_TOKEN||env.CLOUDFLARE_ACCOUNT_ID!=='4d46e32e5c27ff522ee857308a53e729'||env.STAGING_D1_DATABASE_ID!=='83881fd7-88e6-4835-b616-6f4f8f2d25cd'||!env.STAGING_HEALTH_TOKEN)throw Error('Monitor configuration missing or invalid; secret values suppressed');
 return {...env,origin:ORIGIN};
}
export function businessDay(now){return new Date(now+7*3600000).toISOString().slice(0,10);}
const names={publisher:'Bộ đăng production có trạng thái khác cấu hình cửa đóng đã duyệt.',publisher_budget:'Bộ đăng vượt ngân sách truy vấn/thời gian hoặc lượt chạy bị lỗi.',worker:'Cloud chưa phản hồi hoặc nhận dạng không đúng.',status:'Không đọc được trạng thái riêng của cloud.',database:'Không đọc được dữ liệu vận hành D1.',heartbeat:'Nguồn kích hoạt vận hành chưa ghi heartbeat hoặc hoàn tất lượt xử lý mới trong hơn 20 phút.',config:'Cấu hình lịch và quyền bật lịch không khớp.',late:'Đã quá giờ đăng 20 phút nhưng chưa có bài được xác minh.',unknown:'Kết quả đăng hôm nay chưa rõ; cần đối soát, không đăng lại.',trigger_delay:'Yêu cầu từ lịch bên ngoài mất hơn 10 phút mới bắt đầu kiểm tra.',monitor_gap:'Bộ giám sát có khoảng trống kiểm tra trên 75 phút.',test:'Tin kiểm thử giám sát độc lập. Không thay đổi lịch hoặc đăng Facebook.'};
export function triggerInfo(config,now){
 const source=config.MONITOR_TRIGGER_SOURCE||'manual';if(!['manual','github-schedule','cron-job.org'].includes(source))throw Error('Monitor trigger source invalid');
 const stamp=config.MONITOR_TRIGGER_AT||'';if(source==='cron-job.org'&&!/^\d{10}$/.test(stamp))throw Error('External trigger timestamp required');
 if(stamp&&!/^\d{10}$/.test(stamp))throw Error('Monitor trigger timestamp invalid');
 const requestedAt=stamp?Number(stamp)*1000:null;if(requestedAt!==null&&(requestedAt>now+120000||requestedAt<now-86400000))throw Error('Monitor trigger timestamp out of bounds');
 return {source,requestedAt,startedAt:now,lagSeconds:requestedAt===null?null:Math.max(0,Math.floor((now-requestedAt)/1000))};
}
Object.assign(names,{meta:'Kết nối Meta production cần xác minh lại.',meta_expiring:'Token Trang production còn không quá 3 ngày.',meta_expired:'Token hoặc quyền dữ liệu Meta production đã hết hạn.',telegram:'Kết nối hoặc hàng chờ Telegram production cần xử lý.'});
export function assessProduction({health,status,snapshot},now){
 const codes=[],observed=['worker','status','database'];
 if(!health||health.environment!=='production'||health.phase!=='management'||! /^[a-f0-9]{40}$/.test(health.release??'')||health.publishingEnabled!==false||health.schedulerImplemented!==false||health.operationsSchedulerImplemented!==true)codes.push('worker');
 if(!status||status.environment!=='production'||status.databaseChecked!==true||status.schemaReady!==true||status.publishingEnabled!==false||status.paused!==true)codes.push('status');
 if(!snapshot||snapshot.environment!=='production'||snapshot.enabled!==0||snapshot.paused_by_user!==1||![13,14,15,16].includes(snapshot.migration_count)||![0,1].includes(snapshot.http_enabled)||!Number.isSafeInteger(snapshot.jobs)||!Number.isSafeInteger(snapshot.publications))codes.push('database');
 else{
  observed.push('heartbeat','config');const http=snapshot.http_enabled===1;
  const times=http?[snapshot.last_http_at,snapshot.last_complete_at]:[snapshot.last_scheduled_at];
  if(times.some(t=>!Number.isSafeInteger(t)||t>now+60000||now-t>20*60000))codes.push('heartbeat');
  if(snapshot.jobs!==0||snapshot.publications!==0||status?.triggerSource!==(http?'http':'cron'))codes.push('config');
 }
 if([14,15,16].includes(snapshot?.migration_count)){
  observed.push('publisher','publisher_budget','unknown');const p=status?.publisher;
  // In schema16 httpPublisher reports credential presence, not an open send gate.
  // Deployment/database/owner approval must still be explicitly false.
  const gates=p?.gates,known=['deployment','database','ownerPublicationApproval','httpPublisher'];
  const validGates=gates&&known.every(k=>typeof gates[k]==='boolean')&&Object.keys(gates).every(k=>known.includes(k));
  const open=validGates&&known.some(k=>gates[k]&&(snapshot.migration_count!==16||k!=='httpPublisher'));
  if(!p?.schemaReady||p.state!=='closed'||p.counts?.permits!==0||p.counts?.publications!==0||!validGates||open||(snapshot.migration_count===16&&p.engine!=='runner'))codes.push('publisher');
  if(p?.counts?.unknown>0)codes.push('unknown');
  if(p?.runtime?.last_queries>50||p?.runtime?.last_duration_ms>30000||p?.runtime?.state==='failed')codes.push('publisher_budget');
 }
 if(status&&status.environment==='production'&&status.databaseChecked===true){
  observed.push('meta','meta_expiring','meta_expired','telegram');
  if(status.metaConfigured!==true||status.metaVerified!==true)codes.push('meta');
  const expiry=[status.metaExpiresAt,status.dataAccessExpiresAt].filter(x=>x!==null);
  if(expiry.some(x=>!Number.isSafeInteger(x)||x<=now))codes.push('meta_expired');
  else if(expiry.some(x=>x<=now+3*86400000))codes.push('meta_expiring');
  const dispatch=status.triggerSource==='http'?status.http?.last_dispatch_state:status.runtime?.last_dispatch_state;
  if(status.telegramConfigured!==true||status.notificationsBlocked>0||['needs_action','delivery_unknown','failed'].includes(dispatch))codes.push('telegram');
 }
 return{day:businessDay(now),codes,observed};
}
export function assess({health,status,snapshot},now){
 const day=businessDay(now),codes=[],observed=['worker','status','database'];
 if(!health||health.service!=='nttu-publisher'||health.environment!=='staging'||! /^[a-f0-9]{40}$/.test(health.release??''))codes.push('worker');
 if(!status||status.environment!=='staging'||status.databaseChecked!==true||typeof status.publishingEnabled!=='boolean'||typeof status.paused!=='boolean')codes.push('status');
 if(!snapshot||snapshot.environment!=='staging'||![0,1].includes(snapshot.enabled)||![0,1].includes(snapshot.paused_by_user)||!Number.isSafeInteger(snapshot.published_today)||!Number.isSafeInteger(snapshot.unresolved_today))codes.push('database');
 else {
  observed.push('heartbeat','late','unknown');
  if(!Number.isSafeInteger(snapshot.last_scheduled_at)||snapshot.last_scheduled_at>now+60000||now-snapshot.last_scheduled_at>20*60000)codes.push('heartbeat');
  if(status){observed.push('config');if(status.paused!==(snapshot.paused_by_user===1)||status.publishingEnabled!==(snapshot.enabled===1&&snapshot.paused_by_user===0))codes.push('config');}
  if(snapshot.enabled===1&&snapshot.paused_by_user===0&&snapshot.start_date&&snapshot.start_date<=day){
   const trial=Date.parse(snapshot.test_publish_at??''),due=Number.isFinite(trial)&&businessDay(trial)===day?trial:Date.parse(day+'T10:00:00+07:00');
   if(now>=due+20*60000&&snapshot.published_today===0)codes.push(snapshot.unresolved_today>0?'unknown':'late');
  }
 }
 return {day,codes,observed};
}
export function parseState(body){
 if(typeof body!=='string'||body.length>30000)throw Error('Monitor state invalid');
 const match=body.match(/^Independent monitor checkpoint\. Do not edit while a run is active\.\n```json\n([\s\S]+)\n```\n?$/);if(!match)throw Error('Monitor state invalid');
 const state=JSON.parse(match[1]);if(state.schema!==1||!state.incidents||typeof state.incidents!=='object'||Array.isArray(state.incidents)||Object.keys(state.incidents).length>20)throw Error('Monitor state invalid');
 for(const [code,item] of Object.entries(state.incidents))if(!Object.hasOwn(names,code)||!item||!Number.isSafeInteger(item.firstSeen)||item.firstSeen<0||!Number.isSafeInteger(item.lastSeen)||item.lastSeen<item.firstSeen||!Number.isSafeInteger(item.count)||item.count<1||!['pending','intent','delivered','unknown','rejected'].includes(item.notification))throw Error('Monitor state invalid');
 return state;
}
export function stateBody(state){return 'Independent monitor checkpoint. Do not edit while a run is active.\n```json\n'+JSON.stringify(state,null,2)+'\n```\n';}
export function transition(previous,result,now,{minObservations=2}={}){
 if(![1,2].includes(minObservations))throw Error('Monitor observation policy invalid');
 const state=structuredClone(previous);state.lastCheckedAt=now;
 for(const code of result.observed)if(!result.codes.includes(code))delete state.incidents[code];
 for(const code of result.codes){let item=state.incidents[code];if(!item){item={firstSeen:now,lastSeen:now,count:1,notification:'pending'};state.incidents[code]=item;}else if(now-item.lastSeen>=5*60000){item.count++;item.lastSeen=now;}}
 const ready=Object.keys(state.incidents).filter(code=>result.codes.includes(code)&&state.incidents[code].notification==='pending'&&(state.incidents[code].count>=minObservations||['late','unknown','trigger_delay','monitor_gap','test','meta_expiring','meta_expired'].includes(code)));
 return {state,ready};
}
async function jsonFetch(fetcher,url,options={}){const response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Provider request failed');return response.json();}
export async function probes(config,fetcher=fetch){
 const now=Date.now(),day=businessDay(now);
 const results=await Promise.allSettled([
  jsonFetch(fetcher,config.origin+'/health'),
  jsonFetch(fetcher,config.origin+(config.target==='production'?'/api/production/monitor':'/api/staging/status'),{headers:{Authorization:'Bearer '+(config.target==='production'?config.PRODUCTION_MONITOR_TOKEN:config.STAGING_HEALTH_TOKEN)}}),
  jsonFetch(fetcher,'https://api.cloudflare.com/client/v4/accounts/'+config.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+(config.target==='production'?config.PRODUCTION_D1_DATABASE_ID:config.STAGING_D1_DATABASE_ID)+'/query',{method:'POST',headers:{Authorization:'Bearer '+config.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql:config.target==='production'?PRODUCTION_MONITOR_SQL:MONITOR_SQL,params:config.target==='production'?[]:[day,day]})})
 ]);
 const value=i=>results[i].status==='fulfilled'?results[i].value:null,d1=value(2);
 return {health:value(0),status:value(1),snapshot:d1?.success===true&&d1.result?.[0]?.success===true&&d1.result[0].results?.length===1?d1.result[0].results[0]:null,now};
}
export async function runMonitor(config,{fetcher=fetch,probe=probes,test=false}={}){
 if(![undefined,'daily','half-hourly'].includes(config.MONITOR_CADENCE))throw Error('Monitor cadence invalid');
 const daily=config.MONITOR_CADENCE==='daily';
 const issue='https://api.github.com/repos/'+config.GITHUB_REPOSITORY+'/issues/'+config.MONITOR_STATE_ISSUE;
 const headers={Authorization:'Bearer '+config.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
 const read=await jsonFetch(fetcher,issue,{headers});if(read.title!==(config.target==='production'?PRODUCTION_STATE_TITLE:STATE_TITLE)||read.pull_request)throw Error('Monitor checkpoint identity invalid');
 const previous=parseState(read.body),data=await probe(config,fetcher),result=(config.target==='production'?assessProduction:assess)(data,data.now),trigger=triggerInfo(config,data.now);
 result.observed.push('trigger_delay','monitor_gap');if(trigger.lagSeconds>600)result.codes.push('trigger_delay');
 if(Number.isSafeInteger(previous.lastCheckedAt)&&data.now-previous.lastCheckedAt>(daily?26*60:75)*60000)result.codes.push('monitor_gap');
 if(test){result.codes.push('test');result.observed.push('test');}else{result.observed.push('test');}
 const {state,ready}=transition(previous,result,data.now,{minObservations:daily?1:2});state.lastTrigger=trigger;
 const save=()=>jsonFetch(fetcher,issue,{method:'PATCH',headers,body:JSON.stringify({body:stateBody(state)})});
 // Persist intent before any Telegram send. A crash or missing response cannot trigger an automatic repeat.
 for(const code of ready)state.incidents[code].notification='intent';
 await save();
 let notificationFailed=Object.values(state.incidents).some(item=>['intent','unknown','rejected'].includes(item.notification));
 if(ready.length){
  const text='Ngành Kinh tế số · NTTU [GIÁM SÁT '+(config.target==='production'?'PRODUCTION':'STAGING')+']\n'+(test?'[KIỂM THỬ]\n':'')+ready.map(code=>'• '+(code==='monitor_gap'&&daily?'Bộ giám sát có khoảng trống kiểm tra trên 26 giờ.':names[code])+'\nMã: '+code+':'+state.incidents[code].firstSeen).join('\n')+'\nGiờ Việt Nam: '+new Date(data.now+7*3600000).toISOString().slice(0,19).replace('T',' ')+'\nhttps://github.com/'+config.GITHUB_REPOSITORY+'/actions/workflows/monitor.yml';
  try{
   const response=await fetcher('https://api.telegram.org/bot'+config.MONITOR_TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.MONITOR_TELEGRAM_CHAT_ID,text,disable_web_page_preview:true}),redirect:'error',signal:AbortSignal.timeout(15000)});
   const body=await response.json();const delivered=response.ok&&body.ok===true&&Number.isSafeInteger(body.result?.message_id)&&(config.target!=='production'||(String(body.result?.chat?.id)===config.MONITOR_TELEGRAM_CHAT_ID&&body.result?.chat?.type==='private'));
   for(const code of ready){state.incidents[code].notification=delivered?'delivered':body.ok===false?'rejected':'unknown';if(delivered)state.incidents[code].messageId=body.result.message_id;}
   notificationFailed=!delivered;
  }catch{for(const code of ready)state.incidents[code].notification='unknown';notificationFailed=true;}
  await save();
 }
 // Only fixed codes are logged. Never log provider bodies, error URLs, credentials or captions.
 const summary={checkedAt:new Date(data.now).toISOString(),trigger,issues:result.codes,notified:ready,notificationFailed:notificationFailed||Object.values(state.incidents).some(item=>['intent','unknown','rejected'].includes(item.notification))};
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await runMonitor(settings(process.env),{test:process.env.MONITOR_TEST==='true'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'});console.log(JSON.stringify(result));if(result.issues.some(code=>code!=='test')||result.notificationFailed)process.exitCode=1;}
 catch{console.error('Independent monitor failed; configuration/checkpoint/provider unavailable. Sensitive details suppressed.');process.exitCode=1;}
}
