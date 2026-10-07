import type {ManagementBindings} from './management.ts';
import {productionState} from './management.ts';
import {approvedProductionItems} from './preview.ts';
import {assertPublisherBoundary} from './publisher-boundary.ts';
import {ProductionMetaPublisher,PRODUCTION_PAGE,publicationHash} from './publisher-provider.ts';
import type {PublicationResult} from './publisher-provider.ts';
import {metaFingerprint} from '../cloud/meta.ts';
import {verifiedBytes} from '../cloud/storage.ts';
import {versionGuard} from '../cloud/version-guard.ts';
import {businessDate,scheduledInstant,POLICY} from '../domain/policy.ts';
type Row=Record<string,any>;type Value=string|number|null;
export interface PublisherBindings extends ManagementBindings {PRODUCTION_PUBLISHER_ENABLED?:string;PRODUCTION_PUBLISHER_TOKEN?:string}
const s=(e:ManagementBindings,q:string,...v:Value[])=>e.DB!.prepare(q).bind(...v);
const one=(e:ManagementBindings,q:string,...v:Value[])=>s(e,q,...v).first<Row>();
const rows=async(e:ManagementBindings,q:string,...v:Value[])=>(await s(e,q,...v).all!<Row>()).results;
const batch=(e:ManagementBindings,q:ReturnType<typeof s>[])=>e.DB!.batch!(q);
const day=(n:number)=>businessDate(new Date(n));
async function imageBytes(e:ManagementBindings,file:Row){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([verifiedBytes(e,file),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('R2_READ_TIMEOUT')),5000);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function identity(e:PublisherBindings){
 assertPublisherBoundary(e.APP_ENV??'',e.META_PAGE_ID??'',e.PRODUCTION_DATABASE_ID??'',e.PRODUCTION_ASSET_BUCKET??'');
 if(e.INTEGRATION_MODE!=='management'||!e.DB?.batch||e.DAILY_PUBLISHING_ENABLED!=='false'||! /^[a-f0-9]{40}$/.test(e.RELEASE_SHA??''))throw Error('LIVE_PUBLISHER_BOUNDARY_INVALID');
 const i=await one(e,"SELECT i.database_id,a.paused_by_user,a.maintenance_owner,a.blocked_reasons,a.operation_generation,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM schema_migrations WHERE name='0014_production_publisher.sql') publisher_schema FROM production_identity i JOIN application_state a ON a.environment=i.environment WHERE i.id=1 AND i.environment='production' AND i.schema_version=1");
 if(!i||i.database_id!==e.PRODUCTION_DATABASE_ID||i.migrations!==14||i.publisher_schema!==1)throw Error('LIVE_PUBLISHER_SCHEMA_INVALID');return i;
}
const runtimeGate=(e:PublisherBindings,c:Row,a:Row)=>e.PRODUCTION_PUBLISHER_ENABLED==='true'&&c.enabled===1&&a.paused_by_user===0&&a.maintenance_owner===null&&a.blocked_reasons==='[]'&&!c.blocked;
function event(e:ManagementBindings,id:string,kind:string,guard:string,args:Value[]=[],extra:Row={}){
 return s(e,`INSERT INTO notification_outbox(event_id,payload_json) SELECT ?,? WHERE ${guard} ON CONFLICT(event_id) DO NOTHING`,id,JSON.stringify({kind,environment:'production',page:'Ngành Kinh tế số - NTTU',...extra}),...args);
}
async function finalize(e:ManagementBindings,j:Row,attempt:string,result:PublicationResult,at:number,observed:number){
 const owned="EXISTS(SELECT 1 FROM production_publisher_config WHERE active_job=?) AND EXISTS(SELECT 1 FROM production_publisher_attempts WHERE id=? AND job=? AND state IN ('intent','unknown'))";
 const args=[j.id,attempt,j.id];
 if(result.kind==='confirmed'){
  if(result.attemptId!==attempt||result.pageId!==PRODUCTION_PAGE||result.captionHash!==await publicationHash(j.caption)||result.checksum!==j.checksum||!new RegExp('^'+PRODUCTION_PAGE+'_[1-9][0-9]{4,24}$').test(result.remoteId)||result.confirmedAt<Math.floor(at/1000)*1000||result.confirmedAt>observed+1000)throw Error('EVIDENCE_CORRELATION_INVALID');
  await batch(e,[s(e,`INSERT INTO production_publisher_usage SELECT ?,?,?,?,?,?,? WHERE ${owned} ON CONFLICT(job) DO NOTHING`,day(result.confirmedAt),j.id,j.post,result.remoteId,result.confirmedAt,j.caption,j.checksum,...args),
   s(e,"UPDATE production_publisher_jobs SET state='confirmed',next_at=NULL WHERE id=? AND EXISTS(SELECT 1 FROM production_publisher_usage WHERE job=?)",j.id,j.id),
   s(e,"UPDATE production_publisher_attempts SET state='confirmed' WHERE id=? AND EXISTS(SELECT 1 FROM production_publisher_usage WHERE job=?)",attempt,j.id),
   event(e,'published:'+j.id,'published','EXISTS(SELECT 1 FROM production_publisher_usage WHERE job=?)',[j.id],{url:'https://www.facebook.com/'+result.remoteId,time:new Date(result.confirmedAt).toISOString()}),
   s(e,'UPDATE production_publisher_evidence SET applied=1 WHERE attempt=? AND EXISTS(SELECT 1 FROM production_publisher_usage WHERE job=?)',attempt,j.id),
   s(e,'UPDATE production_publisher_config SET active_job=NULL,stock_pending=1 WHERE active_job=? AND EXISTS(SELECT 1 FROM production_publisher_usage WHERE job=?)',j.id,j.id)]);return 'confirmed';
 }
 const retry=result.kind==='retryable'&&j.tries<3,state=retry?'retry_wait':result.kind==='unknown'?'unknown':'failed';
 await batch(e,[s(e,`UPDATE production_publisher_jobs SET state=?,next_at=? WHERE id=? AND ${owned}`,state,retry?observed+300000:null,j.id,...args),
  s(e,`UPDATE production_publisher_attempts SET state=? WHERE id=? AND ${owned}`,result.kind,attempt,...args),
  ...(state==='unknown'?[event(e,'unknown:'+j.id,'needs_reconciliation',"EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=? AND state='unknown')",[j.id])]:state==='failed'?[event(e,'failed:'+j.id,'post_failed',"EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=? AND state='failed')",[j.id])]:[]),
  ...(state==='failed'?[s(e,'UPDATE production_publisher_config SET active_job=NULL WHERE active_job=?',j.id)]:[]),
  ...(result.kind==='global'?[s(e,"UPDATE production_publisher_config SET enabled=0,blocked='connection_error' WHERE id=1"),s(e,"UPDATE application_state SET paused_by_user=1 WHERE environment='production'")]:[]),
  s(e,'UPDATE production_publisher_evidence SET applied=1 WHERE attempt=?',attempt)]);return state;
}
async function saveEvidence(e:ManagementBindings,j:Row,attempt:string,result:PublicationResult,at:number,observed:number){
 await s(e,"INSERT INTO production_publisher_evidence(attempt,response,sent_at,observed_at) VALUES(?,?,?,?) ON CONFLICT(attempt) DO NOTHING",attempt,JSON.stringify(result),at,observed).run();
 const saved=await one(e,'SELECT * FROM production_publisher_evidence WHERE attempt=?',attempt);if(!saved)throw Error('EVIDENCE_NOT_DURABLE');
 return finalize(e,j,attempt,JSON.parse(saved.response),saved.sent_at,saved.observed_at);
}
// No permit creation/activation operation is exposed in B37.
export async function publisherPreflight(e:PublisherBindings,now=Date.now()){
 await productionState(e);const schema=await one(e,"SELECT 1 FROM schema_migrations WHERE name='0014_production_publisher.sql'");
 if(!schema)return {schemaReady:false,state:'closed',publishingEnabled:false};
 const [config,runtime,counts]=await Promise.all([one(e,'SELECT enabled,revision,start_date,blocked,publish_time,timezone FROM production_publisher_config WHERE id=1'),one(e,'SELECT last_received_at,last_complete_at,heartbeat_count,state,last_queries,last_duration_ms FROM production_publisher_runtime WHERE id=1'),one(e,"SELECT (SELECT count(*) FROM production_send_permits WHERE revoked=0) permits,(SELECT count(*) FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait')) in_flight,(SELECT count(*) FROM production_publisher_jobs WHERE state='unknown') unknown,(SELECT count(*) FROM production_publisher_usage) publications")]);
 return {schemaReady:true,state:counts!.unknown?'unknown':counts!.in_flight?'in_flight':'closed',publishingEnabled:false,checkedAt:new Date(now).toISOString(),serverDate:day(now),publishTime:POLICY.publishTime,timeZone:POLICY.timeZone,config,runtime,counts,
  gates:{deployment:e.PRODUCTION_PUBLISHER_ENABLED==='true',database:config!.enabled===1,ownerPublicationApproval:counts!.permits>0,httpPublisher:!!e.PRODUCTION_PUBLISHER_TOKEN},realPublication:counts!.publications===0?'NOT_RUN':'RECORDED'};
}
export async function publisherAuthorized(request:Request,e:PublisherBindings){
 const token=e.PRODUCTION_PUBLISHER_TOKEN,received=request.headers.get('Authorization');
 if(!/^[a-f0-9]{64}$/.test(token??'')||token===e.PRODUCTION_TRIGGER_TOKEN||token===e.PRODUCTION_MONITOR_TOKEN||received?.length!==71||!received.startsWith('Bearer '))return false;
 const a=await publicationHash(token!),b=await publicationHash(received.slice(7));let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
async function operation(e:PublisherBindings,provider:ProductionMetaPublisher,clock:()=>number){
 let a=await identity(e),c=(await one(e,'SELECT * FROM production_publisher_config WHERE id=1'))!,now=clock();
 if(!Number.isSafeInteger(now)||now<0)throw Error('PUBLISHER_CLOCK_INVALID');
 // Finish durable receipts before considering any gate or additional POST.
 const evidence=await one(e,'SELECT e.*,j.id job_id FROM production_publisher_evidence e JOIN production_publisher_attempts t ON t.id=e.attempt JOIN production_publisher_jobs j ON j.id=t.job WHERE e.applied=0 LIMIT 1');
 if(evidence){const j=(await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',evidence.job_id))!;return {state:await finalize(e,j,evidence.attempt,JSON.parse(evidence.response),evidence.sent_at,evidence.observed_at),sends:0};}
 if(c.stock_pending===1){
  const items=await approvedProductionItems(e,now),used=await rows(e,'SELECT post FROM production_publisher_usage');
  const count=items.filter(p=>p.approvalValid&&!used.some(u=>u.post===p.postId)).length,level=count===0?'empty':count<=3?'low':'normal';
  const episode=c.stock_episode+(level!==c.stock_level?1:0);
  await batch(e,[s(e,'UPDATE production_publisher_config SET stock_pending=0,stock_level=?,stock_episode=? WHERE id=1',level,episode),
   ...(level!==c.stock_level&&level!=='normal'?[event(e,'production-stock:'+episode,level==='empty'?'stock_empty':'stock_low','1',[],{title:count+' bài đã duyệt còn trong kho'})]:[])]);
  return {state:'day_complete',sends:0};
 }
 let j=c.active_job?await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',c.active_job):null;
 if(c.active_job&&!j)throw Error('BROKEN_PUBLISHER_GATE');
 if(j&&['requested','unknown'].includes(j.state)){
  if(j.state==='requested'&&j.lease_until<=now){const t=(await one(e,'SELECT * FROM production_publisher_attempts WHERE job=? ORDER BY ordinal DESC LIMIT 1',j.id))!;await saveEvidence(e,j,t.id,{kind:'unknown'},t.created_at,now);}
  return {state:j.state==='unknown'||j.lease_until<=now?'unknown':'in_flight',sends:0};
 }
 if(!runtimeGate(e,c,a))return {state:'closed',sends:0};
 if(!c.start_date||day(now)<c.start_date)return {state:'not_due',sends:0};
 if(c.connection_hash!==await metaFingerprint(e)||c.connection_hash!==await provider.fingerprint())return {state:'connection_changed',sends:0};
 if(await one(e,"SELECT 1 FROM production_publisher_usage WHERE day=? UNION ALL SELECT 1 FROM production_publisher_jobs WHERE day=? AND state='confirmed'",day(now),day(now)))return {state:'day_complete',sends:0};
 const permits=await rows(e,"SELECT * FROM production_send_permits p WHERE p.page_id=? AND p.business_date=? AND p.revoked=0 AND p.due_at<=? AND p.expires_at>? AND p.approved_at<=? AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs j WHERE j.permit=p.id AND j.state IN ('failed','cancelled','confirmed')) ORDER BY p.due_at,p.id",PRODUCTION_PAGE,day(now),now,now,now);
 if(j&&j.day!==day(now)){await batch(e,[s(e,"UPDATE production_publisher_jobs SET state='cancelled',next_at=NULL WHERE id=? AND state IN ('held','retry_wait')",j.id),s(e,'UPDATE production_publisher_config SET active_job=NULL WHERE active_job=?',j.id)]);return {state:'expired',sends:0};}
 const permit=j?permits.find(p=>p.id===j!.permit):permits[0];if(!permit){if(j){await batch(e,[s(e,"UPDATE production_publisher_jobs SET state='cancelled',next_at=NULL WHERE id=? AND state IN ('held','retry_wait')",j.id),s(e,'UPDATE production_publisher_config SET active_job=NULL WHERE active_job=?',j.id)]);}return {state:'publication_approval_required',sends:0};}
 if(day(permit.due_at)!==permit.business_date||permit.mode==='normal'&&permit.due_at!==scheduledInstant(permit.business_date).getTime())return {state:'invalid_permit_time',sends:0};
 const items=await approvedProductionItems(e,now),item=items.find(p=>p.versionId===permit.version_id);
 if(!item?.approvalValid||item.caption!==permit.caption||item.imageChecksum!==permit.checksum)return {state:'review_required',sends:0};
 const used=await rows(e,'SELECT post FROM production_publisher_usage');
 if(used.some(p=>p.post===item.postId)||item.prerequisites.some(id=>!used.some(p=>p.post===id)))return {state:'prerequisites_required',sends:0};
 const snapshot=JSON.stringify(item);
 if(j&&(snapshot!==j.snapshot||j.day!==day(now)||j.config_revision!==c.revision||j.operation_generation!==a.operation_generation))return {state:'snapshot_changed',sends:0};
 if(j?.state==='retry_wait'&&j.next_at>now)return {state:'retry_wait',sends:0};
 if(!j){
  const id='production-job:'+crypto.randomUUID();
  await batch(e,[s(e,`INSERT INTO production_publisher_jobs(id,permit,day,post,version,snapshot,caption,checksum,config_revision,operation_generation,state,lease_until,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,'held',?,? WHERE EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND active_job IS NULL AND enabled=1 AND revision=?) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=0 AND maintenance_owner IS NULL AND blocked_reasons='[]' AND operation_generation=?) AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=? OR post=?)`,id,permit.id,day(now),item.postId,item.versionId,snapshot,item.caption,item.imageChecksum,c.revision,a.operation_generation,now+60000,now,c.revision,a.operation_generation,day(now),item.postId),s(e,'UPDATE production_publisher_config SET active_job=? WHERE id=1 AND active_job IS NULL AND EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=?)',id,id)]);
  j=await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',id);if(!j)return {state:'claim_lost',sends:0};
 }
 const file=await one(e,"SELECT * FROM cloud_library WHERE id=? AND state='complete' AND checksum=?",item.imageUrl!.split('/').at(-1)!,j.checksum);if(!file)return {state:'image_unavailable',sends:0};
 const bytes=await imageBytes(e,file),proof=await provider.verify(clock());
 if(!proof.verified||proof.fingerprint!==c.connection_hash)return {state:'connection_error',sends:0};
 now=clock();if(day(now)!==j.day||now>=permit.expires_at)return {state:'not_due',sends:0};
 // Recompute approved sources after asynchronous R2/Meta reads, then SQL-fence current eligibility.
 const current=(await approvedProductionItems(e,now)).find(p=>p.versionId===j!.version);
 if(!current?.approvalValid||JSON.stringify(current)!==j.snapshot)return {state:'review_required',sends:0};
 const attempt='production-attempt:'+crypto.randomUUID();
 await batch(e,[s(e,`INSERT INTO production_publisher_attempts SELECT ?,id,tries+1,'intent',? FROM production_publisher_jobs WHERE id=? AND state IN ('held','retry_wait') AND tries<3 AND (next_at IS NULL OR next_at<=?) AND EXISTS(SELECT 1 FROM production_publisher_config WHERE active_job=? AND enabled=1 AND revision=? AND blocked IS NULL) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=0 AND maintenance_owner IS NULL AND blocked_reasons='[]' AND operation_generation=?) AND EXISTS(SELECT 1 FROM production_send_permits WHERE id=production_publisher_jobs.permit AND revoked=0 AND expires_at>?) AND ${versionGuard('production_publisher_jobs.version',now).replace('WHERE old.post_id=q.prerequisite_id)', 'WHERE old.post_id=q.prerequisite_id UNION ALL SELECT 1 FROM production_publisher_usage pu WHERE pu.post=q.prerequisite_id)')}`,attempt,now,j.id,now,j.id,j.config_revision,j.operation_generation,now),s(e,"UPDATE production_publisher_jobs SET state='requested',tries=tries+1,next_at=NULL,lease_until=? WHERE id=? AND EXISTS(SELECT 1 FROM production_publisher_attempts WHERE id=?)",now+60000,j.id,attempt)]);
 if(!await one(e,'SELECT 1 FROM production_publisher_attempts WHERE id=?',attempt))return {state:'intent_blocked',sends:0};
 j={...j,state:'requested',tries:j.tries+1};
 a=await identity(e);c=(await one(e,'SELECT * FROM production_publisher_config WHERE id=1'))!;
 const livePermit=await one(e,'SELECT revoked,expires_at FROM production_send_permits WHERE id=?',permit.id);
 if(!runtimeGate(e,c,a)||c.revision!==j.config_revision||a.operation_generation!==j.operation_generation||c.active_job!==j.id||day(clock())!==j.day||!livePermit||livePermit.revoked||livePermit.expires_at<=clock()||await metaFingerprint(e)!==proof.fingerprint){await saveEvidence(e,j,attempt,{kind:'unknown'},now,clock());return {state:'unknown',sends:0};}
 const result=await provider.send({attemptId:attempt,pageId:PRODUCTION_PAGE,caption:j.caption,checksum:j.checksum,bytes,sentAt:now},clock);
 return {state:await saveEvidence(e,j,attempt,result,now,clock()),sends:1};
}
// A dedicated capability/heartbeat: never called by the Telegram tick or native cron.
export async function runProductionPublisher(e:PublisherBindings,provider:ProductionMetaPublisher,clock:()=>number=Date.now){
 if(!(provider instanceof ProductionMetaPublisher))throw Error('EXPLICIT_LIVE_PROVIDER_REQUIRED');
 await identity(e);const now=clock();if(!Number.isSafeInteger(now)||now<0)throw Error('PUBLISHER_CLOCK_INVALID');
 const lease=crypto.randomUUID(),claimed=await s(e,'UPDATE production_publisher_runtime SET lease_id=?,lease_until=?,last_received_at=?,heartbeat_count=heartbeat_count+1,last_bucket=? WHERE id=1 AND (lease_until IS NULL OR lease_until<=?) AND (last_bucket IS NULL OR last_bucket<?) RETURNING id',lease,now+60000,now,Math.floor(now/60000),now,Math.floor(now/60000)).first();
 if(!claimed)return {state:'coalesced',sends:0};
 let queries=2,state='failed';const started=performance.now(),original=e.DB!;
 const counted:PublisherBindings={...e,DB:{...original,prepare(q){if(++queries>46)throw Error('PUBLISHER_QUERY_BUDGET');return original.prepare(q);},batch:q=>original.batch!(q)}};
 try{const result=await operation(counted,provider,clock);state=result.state;return {...result,queries:queries+1};}
 finally{await s(e,'UPDATE production_publisher_runtime SET last_complete_at=?,state=?,last_queries=?,last_duration_ms=?,lease_id=NULL,lease_until=NULL WHERE id=1 AND lease_id=?',clock(),state,queries+1,Math.ceil(performance.now()-started),lease).run();}
}
export async function pauseProductionPublisher(e:PublisherBindings,actor:string,now=Date.now()){
 await identity(e);if(actor!==POLICY.ownerEmail)throw Error('OWNER_REQUIRED');
 await batch(e,[s(e,'UPDATE production_publisher_config SET enabled=0 WHERE id=1'),s(e,"UPDATE application_state SET paused_by_user=1 WHERE environment='production'"),s(e,"UPDATE production_send_permits SET revoked=1 WHERE revoked=0"),s(e,"UPDATE production_publisher_jobs SET state='cancelled',next_at=NULL WHERE state IN ('held','retry_wait')"),s(e,"UPDATE production_publisher_config SET active_job=NULL WHERE active_job IN (SELECT id FROM production_publisher_jobs WHERE state='cancelled')"),s(e,"INSERT INTO production_publisher_audit SELECT ?,?,?,'pause',revision FROM production_publisher_config WHERE id=1",crypto.randomUUID(),actor,now)]);
 // Requested/unknown jobs keep their Page lock and must be reconciled.
}
// Reconciliation accepts a remote hint, never treats the hint itself as evidence.
// No POST path exists here. Unknown evidence can only be upgraded by a correlated GET.
export async function reconcileProductionPublisher(e:PublisherBindings,provider:ProductionMetaPublisher,attemptId:string,remoteId:string,clock:()=>number=Date.now){
 await identity(e);if(!(provider instanceof ProductionMetaPublisher))throw Error('EXPLICIT_LIVE_PROVIDER_REQUIRED');
 const t=await one(e,'SELECT * FROM production_publisher_attempts WHERE id=?',attemptId);
 if(!t)throw Error('ATTEMPT_NOT_FOUND');
 const j=(await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',t.job))!;
 if(j.state==='confirmed')return {state:'confirmed',sends:0};
 if(j.state!=='unknown'||t.state!=='unknown')throw Error('UNKNOWN_REQUIRED');
 const result=await provider.reconcile({attemptId,pageId:PRODUCTION_PAGE,caption:j.caption,checksum:j.checksum,sentAt:t.created_at},remoteId,clock);
 if(result.kind!=='confirmed')return {state:'unknown',sends:0};
 // Validate correlation before changing a durable receipt.
 if(result.attemptId!==attemptId||result.captionHash!==await publicationHash(j.caption)||result.checksum!==j.checksum)throw Error('EVIDENCE_CORRELATION_INVALID');
 await s(e,"UPDATE production_publisher_evidence SET response=?,observed_at=?,applied=0 WHERE attempt=? AND json_extract(response,'$.kind')='unknown'",JSON.stringify(result),clock(),attemptId).run();
 return {state:await saveEvidence(e,j,attemptId,result,t.created_at,clock()),sends:0};
}
