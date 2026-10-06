import type {CloudBindings,Statement} from './runtime.ts';
import {readStatus} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {CatalogError} from './catalog.ts';
import {createCloudReview} from './review.ts';
import {metaConfigured,metaFingerprint,checkMeta} from './meta.ts';
import {verifiedBytes} from './storage.ts';
import {composeCaption,FOOTER_VERSION} from '../domain/footer.ts';
import {normalizedBody} from '../domain/content.ts';
import {businessDate,scheduledInstant,POLICY} from '../domain/policy.ts';
import {TRIAL_PAGE} from './meta-trial.ts';
import {sendDailyMeta,verifyDailyMeta,validDailyPost} from './daily-meta.ts';
import type {DailyResult} from './daily-meta.ts';
import type {SourceDefinition} from './source-registry.ts';
type Row=Record<string,unknown>;type Value=string|number|null;
const active="('held','publish_requested','evidence_pending','retry_wait','unknown')";
const stamp=(n:number)=>new Date(n).toISOString();
const statement=(env:CloudBindings,q:string,...v:Value[]):Statement=>env.DB!.prepare(q).bind(...v);
async function rows(env:CloudBindings,q:string,...v:Value[]){return (await statement(env,q,...v).all!<Row>()).results;}
async function one(env:CloudBindings,q:string,...v:Value[]){return (await rows(env,q,...v))[0];}
async function batch(env:CloudBindings,s:Statement[]){if(!env.DB?.batch)throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);await env.DB.batch(s);}
function fail(code:string):never{throw new CatalogError(code,409);}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function dailyDue(c:Row,today:string){if(c.test_publish_at&&businessDate(new Date(String(c.test_publish_at)))===today)return Date.parse(String(c.test_publish_at));return scheduledInstant(today).getTime();}
async function config(env:CloudBindings){await readStatus(env);return (await one(env,'SELECT * FROM cloud_daily_config WHERE id=1'))!;}
const configGuard="EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=0 AND maintenance_owner IS NULL AND blocked_reasons='[]') AND EXISTS(SELECT 1 FROM cloud_daily_config WHERE id=1 AND enabled=1 AND revision=?)";
// Rechecked in the same transaction as the send intent, after all network reads.
export function versionGuard(version:string,now:number){const time=stamp(now);return `EXISTS(SELECT 1 FROM post_versions v JOIN content_entries e ON e.active_version_id=v.id JOIN cloud_reviews r ON r.version_id=v.id JOIN assets a ON a.id=v.asset_id JOIN asset_bindings b ON b.version_id=v.id WHERE v.id=__VERSION__ AND v.status!='quarantined' AND e.stage='caption' AND (v.review_due_at IS NULL OR julianday(v.review_due_at)>julianday('${time}')) AND r.check_version=v.check_version AND r.body_snapshot=v.body AND r.asset_checksum=a.checksum AND a.status='complete' AND b.asset_id=a.id AND b.checksum=a.checksum AND b.check_version=v.check_version AND r.footer_version='${FOOTER_VERSION}' AND NOT EXISTS(SELECT 1 FROM version_sources x JOIN sources s ON s.id=x.source_id WHERE x.version_id=v.id AND (s.status!='verified' OR julianday(s.reviewed_at) IS NULL OR julianday(s.reviewed_at)>julianday('${time}') OR julianday(s.reviewed_at)>julianday(r.checked_at) OR (s.review_due_at IS NOT NULL AND (julianday(s.review_due_at) IS NULL OR julianday(s.review_due_at)<=julianday('${time}'))))) AND NOT EXISTS(SELECT 1 FROM version_facts x JOIN facts f ON f.id=x.fact_id JOIN sources s ON s.id=f.source_id WHERE x.version_id=v.id AND (f.status!='verified' OR s.status!='verified' OR (f.cohort IS NOT NULL AND f.cohort!=2026) OR (f.fact_key='training_duration_years' AND f.value_json!='3.5') OR (f.fact_key='cohort' AND f.value_json!='2026') OR (f.review_due_at IS NOT NULL AND (julianday(f.review_due_at) IS NULL OR julianday(f.review_due_at)<=julianday('${time}'))) OR julianday(s.reviewed_at) IS NULL OR julianday(s.reviewed_at)>julianday(r.checked_at) OR (s.review_due_at IS NOT NULL AND (julianday(s.review_due_at) IS NULL OR julianday(s.review_due_at)<=julianday('${time}'))))) AND NOT EXISTS(SELECT 1 FROM posts program WHERE program.id=v.post_id AND program.topic_group='I' AND (NOT EXISTS(SELECT 1 FROM version_facts vf JOIN facts pf ON pf.id=vf.fact_id WHERE vf.version_id=v.id AND pf.fact_key='training_duration_years') OR NOT EXISTS(SELECT 1 FROM version_facts vf JOIN facts pf ON pf.id=vf.fact_id WHERE vf.version_id=v.id AND pf.fact_key='cohort'))) AND NOT EXISTS(SELECT 1 FROM post_prerequisites q WHERE q.post_id=v.post_id AND NOT EXISTS(SELECT 1 FROM publications h JOIN publish_jobs j ON j.id=h.job_id JOIN post_versions old ON old.id=j.post_version_id WHERE old.post_id=q.prerequisite_id)))`.replace(/\bv\b/g,'dv').replace('__VERSION__',version);}
function event(env:CloudBindings,id:string,kind:string,detail:Row={},guard='1',args:Value[]=[]){return statement(env,`INSERT INTO notification_outbox(event_id,payload_json) SELECT ?,? WHERE ${guard} ON CONFLICT(event_id) DO NOTHING`,id,JSON.stringify({kind,environment:'staging',...detail}),...args);}
export async function dailyStatus(env:CloudBindings){const c=await config(env),s=await readStatus(env);const jobs=await rows(env,"SELECT j.id,j.state,j.attempt_count,j.next_attempt_at,j.slot_id,v.caption_title title FROM publish_jobs j JOIN post_versions v ON v.id=j.post_version_id JOIN page_connections p ON p.id=j.page_connection_id WHERE p.environment='staging' AND j.slot_id IS NOT NULL ORDER BY j.rowid DESC LIMIT 100");return {implemented:true,environment:'staging',testPageOnly:true,enabled:c.enabled===1&&env.DAILY_PUBLISHING_ENABLED==='true'&&s.paused_by_user===0,paused:s.paused_by_user===1,deploymentGate:env.DAILY_PUBLISHING_ENABLED==='true',startDate:c.start_date,pageId:env.META_PAGE_ID??null,publishTime:POLICY.publishTime,testPublishAt:c.test_publish_at??null,timeZone:POLICY.timeZone,jobs};}
export async function configureDaily(env:CloudBindings,owner:OwnerSession,input:unknown,now=Date.now()){
 const c=await config(env),p=input as Row|null;
 if(!p||!uuid(p.requestId)||typeof p.startDate!=='string'||p.confirmPageId!==TRIAL_PAGE||env.META_PAGE_ID!==TRIAL_PAGE||!metaConfigured(env))fail('DAILY_CONFIG_INVALID');
 try{scheduledInstant(p.startDate);}catch{fail('DAILY_CONFIG_INVALID');}
 if(!c.start_date&&p.startDate<businessDate(new Date(now)))fail('DAILY_START_IN_PAST');
 if(c.start_date&&c.start_date!==p.startDate)fail('DAILY_START_ALREADY_SET');
 let testAt:string|null=null;
 if(p.testPublishAt!=null){const time=typeof p.testPublishAt==='string'?Date.parse(p.testPublishAt):NaN;if(c.start_date||!Number.isFinite(time)||time<now+600000||time>now+86400000||time%300000!==0||businessDate(new Date(time))!==p.startDate)fail('DAILY_TEST_TIME_INVALID');testAt=new Date(time).toISOString();}
 const audit=await createCloudReview(env).warehouseAudit();if(c.start_date?!audit.posts.some(p=>p.reviewed):audit.reviewed!==40||audit.posts.some(p=>p.issues.length))fail('DAILY_WAREHOUSE_REQUIRES_REVIEW');
 const page=(await one(env,"SELECT id FROM page_connections WHERE environment='staging' AND page_id=?",TRIAL_PAGE))?.id??'daily-staging-'+TRIAL_PAGE;
 const hash=await metaFingerprint(env),posts=c.start_date?[]:await rows(env,"SELECT p.id FROM posts p JOIN content_entries e ON e.post_id=p.id WHERE p.pool='scheduled' ORDER BY e.stable_order,p.id");if(!c.start_date&&posts.length!==30)fail('DAILY_MAIN_COUNT');
 const guard="NOT EXISTS(SELECT 1 FROM cloud_meta_trial WHERE state IN ('intent','unknown')) AND NOT EXISTS(SELECT 1 FROM cloud_content_trial WHERE state IN ('intent','unknown')) AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL) AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE state IN "+active+')';
 await batch(env,[statement(env,`UPDATE cloud_daily_config SET revision=CASE WHEN ${guard} AND revision=? THEN revision+1 ELSE NULL END WHERE id=1`,Number(c.revision)),
 statement(env,"INSERT INTO page_connections VALUES (?,'staging',?,'Tập Viết') ON CONFLICT(environment,page_id) DO NOTHING",String(page),TRIAL_PAGE),
 statement(env,'INSERT INTO page_publish_gates(page_connection_id) VALUES (?) ON CONFLICT DO NOTHING',String(page)),
 statement(env,'UPDATE cloud_daily_config SET page_connection_id=?,start_date=?,enabled=0,config_hash=?,configured_at=?,actor=?,test_publish_at=COALESCE(test_publish_at,?) WHERE id=1',String(page),p.startDate,hash,stamp(now),owner.email,testAt),
 ...posts.map((post,i)=>{const date=new Date(Date.parse(p.startDate+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);return statement(env,"INSERT INTO schedule_slots(id,page_connection_id,business_date,planned_post_id) VALUES(?,?,?,?) ON CONFLICT(page_connection_id,business_date) DO NOTHING",'daily:'+page+':'+date,String(page),date,String(post.id));})]);
 return dailyStatus(env);
}
export async function activateDaily(env:CloudBindings,owner:OwnerSession,input:unknown,options:{now?:number;transport?:typeof fetch}={}){
 const c=await config(env),p=input as Row|null,now=options.now??Date.now();
 if(env.DAILY_PUBLISHING_ENABLED!=='true')fail('DAILY_DEPLOYMENT_GATE_CLOSED');
 if(!p||p.approveDailyPublication!==true||p.confirmPageId!==TRIAL_PAGE||env.META_PAGE_ID!==TRIAL_PAGE||!c.start_date||!c.page_connection_id)fail('DAILY_ACTIVATION_APPROVAL_REQUIRED');
 if(c.config_hash!==await metaFingerprint(env))fail('DAILY_CONNECTION_CHANGED');
 const proof=await checkMeta(env,owner,{requestId:crypto.randomUUID()},{now,transport:options.transport??fetch});if(!proof.verifiedReadOnly)fail('DAILY_META_NOT_VERIFIED');
 const audit=await createCloudReview(env).warehouseAudit();if(!audit.posts.some(p=>p.reviewed))fail('DAILY_WAREHOUSE_REQUIRES_REVIEW');
 await batch(env,[statement(env,`UPDATE cloud_daily_config SET enabled=1,revision=revision+1 WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL AND blocked_reasons='[]') AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE state IN ${active}) AND NOT EXISTS(SELECT 1 FROM cloud_meta_trial WHERE state IN ('intent','unknown')) AND NOT EXISTS(SELECT 1 FROM cloud_content_trial WHERE state IN ('intent','unknown'))`,Number(c.revision)),
 statement(env,"UPDATE application_state SET paused_by_user=0 WHERE environment='staging' AND EXISTS(SELECT 1 FROM cloud_daily_config WHERE id=1 AND enabled=1 AND revision=?)",Number(c.revision)+1)]);
 return dailyStatus(env);
}
export async function pauseDaily(env:CloudBindings){await config(env);await batch(env,[statement(env,'UPDATE cloud_daily_config SET enabled=0,revision=revision+1 WHERE id=1'),statement(env,"UPDATE application_state SET paused_by_user=1 WHERE environment='staging'"),
 statement(env,`UPDATE publish_jobs SET state='cancelled',next_attempt_at=NULL WHERE state IN ('held','retry_wait') AND page_connection_id IN (SELECT page_connection_id FROM cloud_daily_config WHERE id=1) AND (state='held' AND attempt_count=0 OR state='retry_wait' AND EXISTS(SELECT 1 FROM attempts a WHERE a.job_id=publish_jobs.id AND a.ordinal=publish_jobs.attempt_count AND a.outcome='verified_failed_retryable'))`),
 statement(env,"UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE active_job_id IN (SELECT id FROM publish_jobs WHERE state='cancelled')")]);return dailyStatus(env);}
async function enabled(env:CloudBindings,c:Row){const s=await readStatus(env);return env.DAILY_PUBLISHING_ENABLED==='true'&&c.enabled===1&&s.paused_by_user===0&&env.META_PAGE_ID===TRIAL_PAGE&&metaConfigured(env)&&s.environment==='staging'&&c.config_hash===await metaFingerprint(env);}
async function selection(env:CloudBindings,page:string,planned:string|undefined,now:number,registry?:readonly SourceDefinition[]){
 const audit=await createCloudReview(env,registry).warehouseAudit(),all=await rows(env,`SELECT p.id,p.topic_group,p.pool,e.stable_order,v.id version_id,v.body,v.caption_title,v.check_version,v.asset_id FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id WHERE ${versionGuard('v.id',now)} ORDER BY e.stable_order,p.id`);
 const used=await rows(env,"SELECT v.post_id,j.caption_snapshot FROM publications p JOIN publish_jobs j ON j.id=p.job_id JOIN post_versions v ON v.id=j.post_version_id WHERE j.page_connection_id=? UNION ALL SELECT v.post_id,t.caption FROM cloud_content_trial t JOIN post_versions v ON v.id=t.version_id WHERE t.state='published' AND t.remote_id LIKE ?",page,TRIAL_PAGE+'_%');
 const failed=await rows(env,"SELECT post_version_id FROM publish_jobs WHERE page_connection_id=? AND state='failed'",page);
 const candidates=all.filter(p=>audit.posts.some(a=>a.postId===p.id&&a.reviewed&&a.issues.length===0)&&!used.some(u=>u.post_id===p.id||normalizedBody(String(u.caption_snapshot))===normalizedBody(String(p.body)))&&!failed.some(f=>f.post_version_id===p.version_id));
 const main=candidates.find(p=>p.id===planned);if(main)return main;
 const topic=planned?(await one(env,'SELECT topic_group FROM posts WHERE id=?',planned))?.topic_group:undefined;
 return candidates.filter(p=>p.pool==='reserve').sort((a,b)=>Number(b.topic_group===topic)-Number(a.topic_group===topic)||Number(a.stable_order)-Number(b.stable_order))[0];
}
async function claim(env:CloudBindings,c:Row,slot:Row,p:Row,now:number){
 const id='daily-job-'+crypto.randomUUID(),token=crypto.randomUUID(),page=String(c.page_connection_id),deadline=stamp(now+90000),revision=Number(c.revision);
 const gate=`${configGuard} AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE page_connection_id=? AND state IN ${active}) AND NOT EXISTS(SELECT 1 FROM publications pub JOIN publish_jobs old ON old.id=pub.job_id WHERE old.page_connection_id=? AND pub.remote_business_date=?) AND EXISTS(SELECT 1 FROM content_entries e JOIN post_versions v ON v.id=e.active_version_id JOIN cloud_reviews r ON r.version_id=v.id WHERE e.post_id=? AND v.id=? AND v.check_version=? AND r.check_version=v.check_version AND r.body_snapshot=v.body AND r.asset_checksum=? AND r.footer_version=? AND ${versionGuard('v.id',now)})`;
 const file=await one(env,"SELECT l.* FROM cloud_library l JOIN assets a ON a.id='library-'||l.id WHERE a.id=? AND a.status='complete' AND l.state='complete'",String(p.asset_id));if(!file)return null;
 await batch(env,[statement(env,`INSERT INTO publish_jobs(id,page_connection_id,slot_id,post_version_id,caption_snapshot,asset_checksum,footer_version,state,owner_token,generation,lease_until) SELECT ?,?,?,?,?,?,?,'held',?,1,? WHERE ${gate}`,id,page,String(slot.id),String(p.version_id),composeCaption(String(p.body)),String(file.checksum),FOOTER_VERSION,token,deadline,revision,page,page,String(slot.business_date),String(p.id),String(p.version_id),Number(p.check_version),String(file.checksum),FOOTER_VERSION),
 statement(env,"INSERT INTO job_claims SELECT j.id,v.check_version,v.asset_id,a.storage_key,a.size_bytes,s.operation_generation,? FROM publish_jobs j JOIN post_versions v ON v.id=j.post_version_id JOIN assets a ON a.id=v.asset_id JOIN application_state s ON s.environment='staging' WHERE j.id=?",stamp(now),id),
 statement(env,"UPDATE page_publish_gates SET active_job_id=?,generation=generation+1,lease_until=? WHERE page_connection_id=? AND active_job_id IS NULL AND EXISTS(SELECT 1 FROM publish_jobs WHERE id=?)",id,deadline,page,id),
 statement(env,"UPDATE schedule_slots SET status='held' WHERE id=? AND EXISTS(SELECT 1 FROM publish_jobs WHERE id=?)",String(slot.id),id)]);
 return (await one(env,'SELECT * FROM publish_jobs WHERE id=?',id))??null;
}
async function recordObservation(env:CloudBindings,j:Row,attempt:Row,result:DailyResult,now:number){
 const outcome=result.kind==='confirmed'?'confirmed':result.kind==='retryable'?'verified_failed_retryable':['policy','global'].includes(result.kind)?'verified_failed_final':'unknown';
 const details={page:j.page_connection_id,remotePublishedAt:result.kind==='confirmed'?stamp(result.publishedAt):null,remoteLink:result.kind==='confirmed'?'https://www.facebook.com/'+result.remoteId:null,failureKind:['retryable','policy','global'].includes(result.kind)?result.kind:null,retryAt:result.kind==='retryable'?stamp(now+300000):null,photoId:result.photoId??null};
 const eventKey='daily:'+attempt.id+':'+outcome+(result.remoteId?':'+result.remoteId:'');
 await statement(env,"INSERT INTO publish_evidence(id,attempt_id,event_key,outcome,remote_id,observed_at,normalized_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING",crypto.randomUUID(),String(attempt.id),eventKey,outcome,result.remoteId??null,stamp(now),JSON.stringify(details)).run();
 return (await one(env,'SELECT * FROM publish_evidence WHERE event_key=?',eventKey))!;
}
async function finalize(env:CloudBindings,j:Row,attempt:Row,e:Row,now:number){
 const d=JSON.parse(String(e.normalized_json)) as Row,page=String(j.page_connection_id),job=String(j.id);
 if(e.outcome==='confirmed'){
  const when=String(d.remotePublishedAt),date=businessDate(new Date(when)),id='daily-publication:'+job;
  await batch(env,[statement(env,"INSERT INTO publications SELECT ?,j.id,?,?,?,?,?,?,?,? FROM publish_jobs j WHERE j.id=? AND EXISTS(SELECT 1 FROM publish_evidence WHERE id=? AND outcome='confirmed') ON CONFLICT(job_id,remote_id) DO NOTHING",id,String(e.remote_id),'https://www.facebook.com/'+e.remote_id,String(j.caption_snapshot),String(j.asset_checksum),String(j.footer_version),stamp(now),when,date,job,String(e.id)),
   statement(env,"UPDATE attempts SET outcome='confirmed' WHERE id=? AND EXISTS(SELECT 1 FROM publications WHERE id=?)",String(attempt.id),id),
   statement(env,"UPDATE publish_jobs SET state='confirmed',next_attempt_at=NULL WHERE id=? AND EXISTS(SELECT 1 FROM publications WHERE id=?)",job,id),
   statement(env,'UPDATE cloud_daily_config SET stock_pending=1,test_publish_at=NULL WHERE id=1 AND EXISTS(SELECT 1 FROM publications WHERE id=?)',id),
   statement(env,"INSERT INTO schedule_slots(id,page_connection_id,business_date,status) SELECT ?,?,?,'confirmed' WHERE EXISTS(SELECT 1 FROM publications WHERE id=?) ON CONFLICT(page_connection_id,business_date) DO NOTHING",'daily:'+page+':'+date,page,date,id),
   statement(env,"UPDATE schedule_slots SET status=CASE WHEN business_date=? THEN 'confirmed' ELSE 'replaced_by_late_publication' END WHERE page_connection_id=? AND (id=? OR business_date=?) AND EXISTS(SELECT 1 FROM publications WHERE id=?)",date,page,String(j.slot_id),date,id),
   event(env,'published:'+job,'published',{title:String((await one(env,'SELECT caption_title FROM post_versions WHERE id=?',String(j.post_version_id)))!.caption_title),page:'Tập Viết',url:'https://www.facebook.com/'+e.remote_id,time:when},'EXISTS(SELECT 1 FROM publications WHERE id=?)',[id]),
   statement(env,"UPDATE publish_evidence SET state='applied' WHERE id=? AND EXISTS(SELECT 1 FROM publications WHERE id=?)",String(e.id),id),
   statement(env,"UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=? AND EXISTS(SELECT 1 FROM publications WHERE id=?)",page,job,id)]);
  return 'confirmed';
 }
 const retry=e.outcome==='verified_failed_retryable'&&Number(attempt.ordinal)<3,state=retry?'retry_wait':e.outcome==='unknown'?'unknown':'failed';
 await batch(env,[statement(env,'UPDATE attempts SET outcome=? WHERE id=?',String(e.outcome),String(attempt.id)),statement(env,'UPDATE publish_jobs SET state=?,next_attempt_at=? WHERE id=? AND state!=\'confirmed\'',state,retry?String(d.retryAt):null,job),statement(env,"UPDATE publish_evidence SET state='applied' WHERE id=?",String(e.id)),
 ...(state==='unknown'?[event(env,'unknown:'+job,'needs_reconciliation',{title:'Chưa xác định kết quả đăng bài'})]:state==='failed'?[event(env,'failed:'+job,'post_failed',{title:'Bài cần xử lý; sẽ tìm bài dự phòng'})]:[]),
 ...(state==='failed'?[statement(env,'UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=?',page,job)]:[]),
 ...(d.failureKind==='global'?[statement(env,'UPDATE cloud_daily_config SET enabled=0,revision=revision+1 WHERE id=1'),statement(env,"UPDATE application_state SET paused_by_user=1 WHERE environment='staging'"),event(env,'connection:'+job,'connection_error')]:[])]);
 return state;
}
async function monitorStock(env:CloudBindings,page:string,now:number,registry?:readonly SourceDefinition[]){
 const audit=await createCloudReview(env,registry).warehouseAudit();
 const available=await rows(env,`SELECT v.post_id FROM post_versions v JOIN content_entries e ON e.active_version_id=v.id WHERE ${versionGuard('v.id',now)} AND NOT EXISTS(SELECT 1 FROM publish_jobs j WHERE j.page_connection_id=? AND j.post_version_id=v.id AND j.state IN ('failed','confirmed'))`,page);
 const count=available.filter(v=>audit.posts.some(a=>a.postId===v.post_id&&a.reviewed)).length,level=count===0?'empty':count<=3?'low':'normal';
 await batch(env,[statement(env,"INSERT INTO stock_alert_state VALUES(?,?,1,?) ON CONFLICT(page_connection_id) DO UPDATE SET level=excluded.level,eligible_count=excluded.eligible_count,episode=stock_alert_state.episode+CASE WHEN stock_alert_state.level<>excluded.level THEN 1 ELSE 0 END",page,level,count),
 statement(env,"INSERT INTO notification_outbox(event_id,payload_json) SELECT 'daily-stock:'||page_connection_id||':'||episode,? FROM stock_alert_state WHERE page_connection_id=? AND level IN ('low','empty') ON CONFLICT(event_id) DO NOTHING",JSON.stringify({kind:level==='empty'?'stock_empty':'stock_low',environment:'staging',title:'Còn '+count+' bài đủ điều kiện'}),page)]);
}
async function reconcileJob(env:CloudBindings,j:Row,transport:typeof fetch,now:number,remoteId?:string){
 const attempt=(await one(env,'SELECT * FROM attempts WHERE job_id=? ORDER BY ordinal DESC LIMIT 1',String(j.id)));if(!attempt)return 'held';
 const pending=await one(env,"SELECT * FROM publish_evidence WHERE attempt_id=? AND state='pending' ORDER BY rowid DESC LIMIT 1",String(attempt.id));if(pending)return finalize(env,j,attempt,pending,now);
 const hint=await one(env,"SELECT * FROM publish_evidence WHERE attempt_id=? AND outcome='unknown' ORDER BY rowid DESC LIMIT 1",String(attempt.id));
 const id=remoteId??hint?.remote_id;
 if(typeof id==='string'&&env.META_PAGE_ID===TRIAL_PAGE&&metaConfigured(env)){
  const d=hint?JSON.parse(String(hint.normalized_json)) as Row:{};
  const result=await verifyDailyMeta(env,{pageId:TRIAL_PAGE,caption:String(j.caption_snapshot),sentAt:Date.parse(String(attempt.intent_at))},id,typeof d.photoId==='string'?d.photoId:undefined,transport,now);
  if(result.kind==='confirmed')return finalize(env,j,attempt,await recordObservation(env,j,attempt,result,now),now);
 }
 if(Date.parse(String(j.lease_until))<=now&&j.state==='publish_requested')return finalize(env,j,attempt,await recordObservation(env,j,attempt,{kind:'unknown'},now),now);
 return 'reconciliation_required';
}
export async function reconcileDaily(env:CloudBindings,input:unknown,options:{now?:number;transport?:typeof fetch}={}){await config(env);const p=input as Row|null;if(!p||typeof p.jobId!=='string'||!validDailyPost(TRIAL_PAGE,p.remoteId))fail('DAILY_RECONCILE_INVALID');const j=await one(env,"SELECT j.* FROM publish_jobs j JOIN cloud_daily_config c ON c.page_connection_id=j.page_connection_id WHERE j.id=? AND j.slot_id IS NOT NULL",p.jobId);if(!j||!['publish_requested','evidence_pending','unknown','confirmed'].includes(String(j.state)))fail('DAILY_RECONCILE_BLOCKED');if(j.state==='confirmed')return {state:'confirmed'};return {state:await reconcileJob(env,j,options.transport??fetch,options.now??Date.now(),p.remoteId as string)};}
export async function runDaily(env:CloudBindings,options:{now?:number;transport?:typeof fetch;registry?:readonly SourceDefinition[]}={}){
 const now=options.now??Date.now(),transport=options.transport??fetch;if(!Number.isSafeInteger(now)||now<0)fail('DAILY_CLOCK_INVALID');
 let c=await config(env);if(!c.page_connection_id)return {state:'unconfigured'};
 const page=String(c.page_connection_id),today=businessDate(new Date(now));
 // One send per invocation keeps D1 reads within the free Worker query budget.
 for(let budget=0;budget<1;budget++){
  c=await config(env);let j=await one(env,`SELECT * FROM publish_jobs WHERE page_connection_id=? AND state IN ${active} ORDER BY rowid LIMIT 1`,page);
  if(j&&['publish_requested','evidence_pending','unknown'].includes(String(j.state)))return {state:await reconcileJob(env,j,transport,now)};
  if(!await enabled(env,c)){
   if(c.enabled===1){await pauseDaily(env);await event(env,'daily-config:'+page+':'+c.revision,'connection_error',{title:'Cấu hình đăng bài đã thay đổi; lịch được tạm dừng'}).run();}
   return {state:'paused'};
  }
  if(c.stock_pending===1){await monitorStock(env,page,now,options.registry);await statement(env,'UPDATE cloud_daily_config SET stock_pending=0 WHERE id=1').run();return {state:'day_complete'};}
  if(j){const slot=await one(env,'SELECT business_date FROM schedule_slots WHERE id=?',String(j.slot_id));if(slot?.business_date!==today){await batch(env,[statement(env,"UPDATE posts SET pool='reserve' WHERE id IN (SELECT post_id FROM post_versions WHERE id=?) AND EXISTS(SELECT 1 FROM publish_jobs WHERE id=? AND state='held' AND attempt_count=0)",String(j.post_version_id),String(j.id)),statement(env,"UPDATE publish_jobs SET state=CASE WHEN state='retry_wait' THEN 'failed' ELSE 'cancelled' END,next_attempt_at=NULL WHERE id=? AND state IN ('held','retry_wait')",String(j.id)),statement(env,'UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=?',page,String(j.id)),statement(env,"UPDATE schedule_slots SET status='expired' WHERE id=?",String(j.slot_id))]);j=undefined;}}
  if(!j){
   if(!c.start_date||today<String(c.start_date)||now<dailyDue(c,today)-300000)return {state:'not_due'};
   if(await one(env,'SELECT 1 FROM publications p JOIN publish_jobs j ON j.id=p.job_id WHERE j.page_connection_id=? AND p.remote_business_date=?',page,today))return {state:'day_complete'};
   await batch(env,[statement(env,"UPDATE posts SET pool='reserve' WHERE id IN (SELECT planned_post_id FROM schedule_slots WHERE page_connection_id=? AND business_date<? AND status='planned') AND NOT EXISTS(SELECT 1 FROM publications p JOIN publish_jobs j ON j.id=p.job_id JOIN post_versions v ON v.id=j.post_version_id WHERE v.post_id=posts.id)",page,today),statement(env,"UPDATE schedule_slots SET status='expired' WHERE page_connection_id=? AND business_date<? AND status='planned'",page,today),statement(env,"INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES(?,?,?) ON CONFLICT(page_connection_id,business_date) DO NOTHING",'daily:'+page+':'+today,page,today)]);
   const slot=await one(env,"SELECT * FROM schedule_slots WHERE page_connection_id=? AND business_date=? AND status IN ('planned','held','requested')",page,today);if(!slot)return {state:'day_complete'};
   const p=await selection(env,page,slot.planned_post_id===null?undefined:String(slot.planned_post_id),now,options.registry);
   if(!p){await batch(env,[statement(env,'UPDATE cloud_daily_config SET enabled=0,revision=revision+1 WHERE id=1'),statement(env,"UPDATE application_state SET paused_by_user=1 WHERE environment='staging'"),event(env,'stock-empty:'+page+':'+today,'stock_empty')]);return {state:'stock_empty'};}
   j=(await claim(env,c,slot,p,now))??undefined;if(!j)return {state:'in_flight'};
   return {state:'prepared'};
  }
  if(now<dailyDue(c,today))return {state:'prepared'};
  if(j.state==='retry_wait'&&Date.parse(String(j.next_attempt_at))>now)return {state:'retry_wait'};
  const audit=await createCloudReview(env,options.registry).auditPost(String((await one(env,'SELECT post_id FROM post_versions WHERE id=?',String(j.post_version_id)))!.post_id));
  if(!audit.reviewed||audit.versionId!==j.post_version_id||audit.assetChecksum!==j.asset_checksum){await pauseDaily(env);await event(env,'review:'+j.id,'connection_error',{title:'Nội dung hoặc nguồn cần kiểm tra lại'}).run();return {state:'review_required'};}
  const file=await one(env,"SELECT l.* FROM cloud_library l JOIN assets a ON a.id='library-'||l.id WHERE a.id=? AND l.state='complete' AND a.status='complete'",String((await one(env,'SELECT asset_id FROM job_claims WHERE job_id=?',String(j.id)))!.asset_id));if(!file)return {state:'image_unavailable'};
  const bytes=await verifiedBytes(env,file);
  const proof=await checkMeta(env,{email:POLICY.ownerEmail,sub:'daily-runner',csrf:''},{requestId:crypto.randomUUID()},{now,transport});
  if(!proof.verifiedReadOnly){await pauseDaily(env);await event(env,'meta-check:'+page+':'+today,'connection_error').run();return {state:'connection_error'};}
  const intent=crypto.randomUUID(),owner=crypto.randomUUID(),prior=Number(j.attempt_count),ordinal=prior+1;
  await batch(env,[statement(env,`UPDATE publish_jobs SET state='publish_requested',attempt_count=attempt_count+1,owner_token=?,lease_until=? WHERE id=? AND state IN ('held','retry_wait') AND attempt_count=? AND attempt_count<3 AND ${configGuard} AND EXISTS(SELECT 1 FROM job_claims c JOIN application_state s ON s.environment='staging' WHERE c.job_id=publish_jobs.id AND c.operation_generation=s.operation_generation) AND ${versionGuard('publish_jobs.post_version_id',now)} AND EXISTS(SELECT 1 FROM content_entries e JOIN post_versions v ON v.id=e.active_version_id JOIN job_claims jc ON jc.job_id=publish_jobs.id WHERE v.id=publish_jobs.post_version_id AND jc.check_version=v.check_version AND jc.asset_id=v.asset_id) AND (state='held' AND attempt_count=0 OR state='retry_wait' AND next_attempt_at<=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.job_id=publish_jobs.id AND a.ordinal=publish_jobs.attempt_count AND a.outcome='verified_failed_retryable'))`,owner,stamp(now+90000),String(j.id),prior,Number(c.revision),stamp(now)),
   statement(env,"INSERT INTO attempts SELECT ?,j.id,j.attempt_count,?,NULL FROM publish_jobs j WHERE j.id=? AND j.state='publish_requested' AND j.owner_token=? AND j.attempt_count=?",intent,stamp(now),String(j.id),owner,ordinal),
   statement(env,"UPDATE schedule_slots SET status='requested' WHERE id=? AND EXISTS(SELECT 1 FROM attempts WHERE id=?)",String(j.slot_id),intent)]);
  const attempt=await one(env,'SELECT * FROM attempts WHERE id=?',intent);if(!attempt)return {state:'in_flight'};
  j=(await one(env,'SELECT * FROM publish_jobs WHERE id=?',String(j.id)))!;
  // Final durable guard: a pause after the intent commit suppresses the POST.
  const sendTime=options.now??Date.now();
  if(businessDate(new Date(sendTime))!==today||!await enabled(env,await config(env))){await recordObservation(env,j,attempt,{kind:'unknown'},now);return {state:'reconciliation_required'};}
  const result=await sendDailyMeta(env,{pageId:TRIAL_PAGE,caption:String(j.caption_snapshot),bytes,sentAt:now},transport,now);
  const state=await finalize(env,j,attempt,await recordObservation(env,j,attempt,result,now),now);
  if(state==='failed'&&result.kind!=='global')return {state:'reserve_pending'};
  return {state};
 }
 return {state:'budget_exhausted'};
}
