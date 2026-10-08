import type {PublisherBindings} from './publisher-live.ts';
import {publisherIdentity,publisherImageBytes,finalizePublisherEvidence} from './publisher-live.ts';
import {approvedProductionItems} from './preview.ts';
import {ProductionMetaPublisher,PRODUCTION_PAGE} from './publisher-provider.ts';
import {metaFingerprint} from '../cloud/meta.ts';
import {versionGuard} from '../cloud/version-guard.ts';
import {businessDate,scheduledInstant} from '../domain/policy.ts';
import {readSnapshotSQL} from './read-pages.ts';

type Row=Record<string,any>;type Value=string|number|null;
const s=(e:PublisherBindings,q:string,...v:Value[])=>e.DB!.prepare(q).bind(...v);
const one=(e:PublisherBindings,q:string,...v:Value[])=>s(e,q,...v).first<Row>();
const batch=(e:PublisherBindings,q:ReturnType<typeof s>[])=>e.DB!.batch!(q);
const day=(n:number)=>businessDate(new Date(n));
const eligible=(v:string,n:number)=>versionGuard(v,n).replace('WHERE old.post_id=q.prerequisite_id)', 'WHERE old.post_id=q.prerequisite_id UNION ALL SELECT 1 FROM production_publisher_usage pu WHERE pu.post=q.prerequisite_id)');
const gate=(e:PublisherBindings,c:Row,a:Row)=>e.PRODUCTION_PUBLISHER_ENABLED==='true'&&c.enabled===1&&!c.blocked&&a.paused_by_user===0&&a.maintenance_owner===null&&a.blocked_reasons==='[]';
const snapshot=(p:unknown)=>JSON.stringify(p);
const stockSQL=()=>`SELECT json_array(json(snapshot),(SELECT json_group_array(json(row)) FROM (SELECT json_array(day,job,post,remote_id) row FROM production_publisher_usage ORDER BY day,job))) snapshot FROM (${readSnapshotSQL()})`;
const result=(state:string,sends=0)=>({state,sends});
const validTime=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('PUBLISHER_CLOCK_INVALID');return n;};
async function cancel(e:PublisherBindings,j:Row){
 await batch(e,[s(e,"UPDATE production_publisher_jobs SET state='cancelled',next_at=NULL WHERE id=? AND state IN ('held','retry_wait')",j.id),s(e,"UPDATE production_publisher_config SET active_job=NULL WHERE active_job=? AND EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=? AND state='cancelled')",j.id,j.id)]);
 return result('review_required');
}
// Stock verification reads one selected article per tick. SQL retains/compares the
// whole eligibility snapshot without returning or hashing it in the Worker.
async function stock(e:PublisherBindings,c:Row,now:number){
 let scan=await one(e,'SELECT cursor,remaining,revision FROM production_publisher_stock_scan WHERE id=1');
 if(!scan){await s(e,`INSERT INTO production_publisher_stock_scan(id,snapshot,release,started_at) SELECT 1,snapshot,?,? FROM (${stockSQL()}) WHERE NOT EXISTS(SELECT 1 FROM production_publisher_stock_scan)`,e.RELEASE_SHA!,now,now,now,now).run();return result('stock_started');}
 const matches=async(n:number)=>one(e,`SELECT 1 ok FROM production_publisher_stock_scan WHERE id=1 AND release=? AND snapshot=(SELECT snapshot FROM (${stockSQL()}))`,e.RELEASE_SHA!,n,n,n);
 if(!await matches(now)){await s(e,'DELETE FROM production_publisher_stock_scan WHERE id=1').run();return result('stock_restart');}
 const v=await one(e,'SELECT rowid,id FROM post_versions WHERE rowid>? AND id IN (SELECT active_version_id FROM content_entries) ORDER BY rowid LIMIT 1',scan.cursor);
 if(v){const item=(await approvedProductionItems(e,now,v.id,'batch'))[0],used=await one(e,'SELECT 1 FROM production_publisher_usage WHERE post=?',item?.postId??'');
  await s(e,`UPDATE production_publisher_stock_scan SET cursor=?,remaining=remaining+?,revision=revision+1 WHERE id=1 AND revision=? AND snapshot=(SELECT snapshot FROM (${stockSQL()}))`,v.rowid,item?.approvalValid&&!used?1:0,scan.revision,now,now,now).run();return result('stock_item');}
 const level=scan.remaining===0?'empty':scan.remaining<=3?'low':'normal',episode=c.stock_episode+(level!==c.stock_level?1:0);
 await batch(e,[s(e,`UPDATE production_publisher_config SET stock_pending=0,stock_level=?,stock_episode=? WHERE id=1 AND stock_pending=1 AND EXISTS(SELECT 1 FROM production_publisher_stock_scan WHERE id=1 AND revision=? AND snapshot=(SELECT snapshot FROM (${stockSQL()})))`,level,episode,scan.revision,now,now,now),
 s(e,"INSERT INTO notification_outbox(event_id,payload_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND stock_pending=0 AND stock_episode=? AND stock_level=?) AND ?!=? AND ?!='normal' ON CONFLICT(event_id) DO NOTHING",'production-stock:'+episode,JSON.stringify({kind:level==='empty'?'stock_empty':'stock_low',environment:'production',page:'Ngành Kinh tế số - NTTU',title:scan.remaining+' bài đã duyệt còn trong kho'}),episode,level,level,c.stock_level,level),
 s(e,'DELETE FROM production_publisher_stock_scan WHERE id=1 AND EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND stock_pending=0)')]);
 return result('day_complete');
}
async function operation(e:PublisherBindings,provider:ProductionMetaPublisher,clock:()=>number){
 let now=validTime(clock()),a=await publisherIdentity(e),c=(await one(e,'SELECT * FROM production_publisher_config WHERE id=1'))!;
 // Recover evidence before gates. Recovery never calls dispatch, even when paused.
 const ev=await one(e,'SELECT e.*,j.id job_id FROM production_publisher_evidence e JOIN production_publisher_attempts t ON t.id=e.attempt JOIN production_publisher_jobs j ON j.id=t.job WHERE e.applied=0 ORDER BY e.observed_at,e.attempt LIMIT 1');
 if(ev){const j=(await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',ev.job_id))!,r=JSON.parse(ev.response);
  if(r.kind==='unknown'&&r.remoteId){const proof=await provider.reconcile({attemptId:ev.attempt,pageId:PRODUCTION_PAGE,caption:j.caption,checksum:j.checksum,sentAt:ev.sent_at},r.remoteId,clock);
   if(proof.kind==='confirmed'){await s(e,"UPDATE production_publisher_evidence SET response=?,observed_at=? WHERE attempt=? AND applied=0 AND json_extract(response,'$.kind')='unknown'",JSON.stringify(proof),validTime(clock()),ev.attempt).run();return result('evidence_verified');}}
  return result(await finalizePublisherEvidence(e,j,ev.attempt,r,ev.sent_at,ev.observed_at));
 }
 let j=c.active_job?await one(e,'SELECT * FROM production_publisher_jobs WHERE id=?',c.active_job):null;
 if(c.active_job&&!j)throw Error('BROKEN_PUBLISHER_GATE');
 if(j&&['requested','unknown'].includes(j.state)){
  if(j.state==='requested'&&j.lease_until<=now){const t=await one(e,'SELECT * FROM production_publisher_attempts WHERE job=? ORDER BY ordinal DESC LIMIT 1',j.id);if(!t)throw Error('BROKEN_PUBLISHER_INTENT');await s(e,'INSERT INTO production_publisher_evidence(attempt,response,sent_at,observed_at) VALUES(?,?,?,?) ON CONFLICT(attempt) DO NOTHING',t.id,JSON.stringify({kind:'unknown'}),t.created_at,now).run();return result('evidence_recorded');}
  return result(j.state==='unknown'?'unknown':'in_flight');
 }
 if(c.stock_pending===1)return stock(e,c,now);
 if(!gate(e,c,a))return result('closed');
 if(!c.start_date||day(now)<c.start_date)return result('not_due');
 if(c.connection_hash!==await metaFingerprint(e)||c.connection_hash!==await provider.fingerprint())return result('connection_changed');
 if(await one(e,'SELECT 1 FROM production_publisher_usage WHERE day=?',day(now)))return result('day_complete');
 if(j&&j.day!==day(now))return cancel(e,j);
 // Prepare up to three minutes before due time; POST can never start early.
 const permit=await one(e,`SELECT * FROM production_send_permits p WHERE p.page_id=? AND p.business_date=? AND p.revoked=0 AND p.due_at<=? AND p.expires_at>? AND p.approved_at<=? ${j?'AND p.id=?':"AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs j WHERE j.permit=p.id AND j.state IN ('failed','cancelled','confirmed'))"} ORDER BY p.due_at,p.id LIMIT 1`,PRODUCTION_PAGE,day(now),now+180000,now,now,...(j?[j.permit]:[]));
 if(!permit)return j?cancel(e,j):result('publication_approval_required');
 if(day(permit.due_at)!==permit.business_date||permit.mode==='normal'&&permit.due_at!==scheduledInstant(permit.business_date).getTime())return result('invalid_permit_time');
 if(j?.state==='retry_wait'&&j.next_at>now)return result('retry_wait');
 if(!j){
  const item=(await approvedProductionItems(e,now,permit.version_id,'batch'))[0];if(!item?.approvalValid||item.caption!==permit.caption||item.imageChecksum!==permit.checksum)return result('review_required');
  const id='production-job:'+crypto.randomUUID(),fingerprint=await metaFingerprint(e);
  await batch(e,[s(e,`INSERT INTO production_publisher_jobs(id,permit,day,post,version,snapshot,caption,checksum,config_revision,operation_generation,state,lease_until,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,'held',?,? WHERE EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND active_job IS NULL AND enabled=1 AND revision=? AND blocked IS NULL) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=0 AND maintenance_owner IS NULL AND blocked_reasons='[]' AND operation_generation=?) AND EXISTS(SELECT 1 FROM production_send_permits WHERE id=? AND revoked=0 AND expires_at>?) AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=? OR post=?) AND ${eligible('?',now)}`,id,permit.id,day(now),item.postId,item.versionId,snapshot(item),item.caption,item.imageChecksum,c.revision,a.operation_generation,now+60000,now,c.revision,a.operation_generation,permit.id,now,day(now),item.postId,item.versionId),
   s(e,'UPDATE production_publisher_config SET active_job=? WHERE id=1 AND active_job IS NULL AND EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=?)',id,id),
   s(e,"INSERT INTO production_publisher_preparation(job,phase,release,fingerprint) SELECT ?,'image',?,? WHERE EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=?)",id,e.RELEASE_SHA!,fingerprint,id)]);
  return result(await one(e,'SELECT 1 FROM production_publisher_jobs WHERE id=?',id)?'content_prepared':'claim_lost');
 }
 let p=await one(e,'SELECT * FROM production_publisher_preparation WHERE job=?',j.id);
 if(!p||p.release!==e.RELEASE_SHA||p.fingerprint!==c.connection_hash||j.config_revision!==c.revision||j.operation_generation!==a.operation_generation)return cancel(e,j);
 if(j.state==='retry_wait'){
  await batch(e,[s(e,"UPDATE production_publisher_preparation SET phase='image',image_bytes=NULL,verified_at=NULL,proof_expires_at=NULL,revision=revision+1 WHERE job=? AND revision=?",j.id,p.revision),s(e,"UPDATE production_publisher_jobs SET state='held',next_at=NULL WHERE id=? AND state='retry_wait'",j.id)]);return result('retry_preparation');
 }
 const file=await one(e,"SELECT l.* FROM post_versions v JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE v.id=? AND l.state='complete' AND l.checksum=?",j.version,j.checksum);
 if(!file)return cancel(e,j);
 if(p.phase==='image'){const bytes=await publisherImageBytes(e,file);await s(e,"UPDATE production_publisher_preparation SET phase='connection',image_bytes=?,revision=revision+1 WHERE job=? AND phase='image' AND revision=?",bytes.length,j.id,p.revision).run();return result('image_prepared');}
 if(p.phase==='connection'){
  const proof=await provider.verify(now),completed=validTime(clock());if(!proof.verified||proof.fingerprint!==p.fingerprint||await metaFingerprint(e)!==p.fingerprint)return result('connection_error');
  const expires=Math.min(completed+300000,permit.expires_at,...[proof.expiresAt,proof.dataAccessExpiresAt].filter((v):v is number=>typeof v==='number'));
  if(completed<now||day(completed)!==j.day||expires<=completed)return cancel(e,j);
  await s(e,"UPDATE production_publisher_preparation SET phase='send',verified_at=?,proof_expires_at=?,revision=revision+1 WHERE job=? AND phase='connection' AND revision=?",completed,expires,j.id,p.revision).run();return result('connection_prepared');
 }
 // Bytes are never persisted in the receipt: reread verified R2 bytes before intent.
 if(p.phase!=='send'||!p.verified_at||p.verified_at>now||p.proof_expires_at<=now)return cancel(e,j);
 if(now<permit.due_at)return result('not_due');
 const bytes=await publisherImageBytes(e,file),item=(await approvedProductionItems(e,validTime(clock()),j.version,'batch'))[0];
 if(bytes.length!==p.image_bytes||!item?.approvalValid||snapshot(item)!==j.snapshot)return cancel(e,j);
 now=validTime(clock());if(day(now)!==j.day||now>=permit.expires_at||now>=p.proof_expires_at||await provider.fingerprint()!==p.fingerprint||await metaFingerprint(e)!==p.fingerprint)return cancel(e,j);
 const attempt='production-attempt:'+crypto.randomUUID();
 // The runtime lease fences a slow prior invocation. Unique (job,ordinal), Page
 // active job and daily usage locks remain in the same atomic intent transaction.
 const lease=(e as StagedBindings).__publisherLease!;
 await batch(e,[s(e,`INSERT INTO production_publisher_attempts SELECT ?,id,tries+1,'intent',? FROM production_publisher_jobs WHERE id=? AND state='held' AND tries<3 AND EXISTS(SELECT 1 FROM production_publisher_runtime WHERE lease_id=? AND lease_until>?) AND EXISTS(SELECT 1 FROM production_publisher_config WHERE active_job=? AND enabled=1 AND revision=? AND blocked IS NULL) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=0 AND maintenance_owner IS NULL AND blocked_reasons='[]' AND operation_generation=?) AND EXISTS(SELECT 1 FROM production_send_permits WHERE id=production_publisher_jobs.permit AND revoked=0 AND expires_at>?) AND EXISTS(SELECT 1 FROM production_publisher_preparation WHERE job=? AND phase='send' AND revision=? AND proof_expires_at>?) AND (SELECT due_at FROM production_send_permits WHERE id=production_publisher_jobs.permit)<=? AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=? OR post=?) AND ${eligible('production_publisher_jobs.version',now)}`,attempt,now,j.id,lease,now,j.id,j.config_revision,j.operation_generation,now,j.id,p.revision,now,now,j.day,j.post),
  s(e,"UPDATE production_publisher_jobs SET state='requested',tries=tries+1,lease_until=? WHERE id=? AND EXISTS(SELECT 1 FROM production_publisher_attempts WHERE id=?)",now+60000,j.id,attempt)]);
 if(!await one(e,'SELECT 1 FROM production_publisher_attempts WHERE id=?',attempt))return result('intent_blocked');
 // A pause after durable intent preserves unknown; never automatically resends.
 a=await publisherIdentity(e);c=(await one(e,'SELECT * FROM production_publisher_config WHERE id=1'))!;
 const fence=await one(e,`SELECT 1 FROM production_send_permits WHERE id=? AND revoked=0 AND due_at<=? AND expires_at>? AND ${eligible('production_send_permits.version_id',validTime(clock()))}`,permit.id,validTime(clock()),validTime(clock())),active=await one(e,'SELECT 1 FROM production_publisher_runtime WHERE lease_id=? AND lease_until>?',lease,validTime(clock()));
 const allowed=gate(e,c,a)&&c.active_job===j.id&&c.revision===j.config_revision&&a.operation_generation===j.operation_generation&&day(clock())===j.day&&clock()<p.proof_expires_at&&fence&&active&&await metaFingerprint(e)===p.fingerprint;
 const response=allowed?await provider.dispatch({attemptId:attempt,pageId:PRODUCTION_PAGE,caption:j.caption,checksum:j.checksum,bytes,sentAt:now}):{kind:'unknown'};
 // Failure/crash here leaves requested+intent; subsequent ticks never repeat POST.
 await s(e,'INSERT INTO production_publisher_evidence(attempt,response,sent_at,observed_at) VALUES(?,?,?,?) ON CONFLICT(attempt) DO NOTHING',attempt,JSON.stringify(response),now,validTime(clock())).run();
 return result('evidence_recorded',allowed?1:0);
}
type StagedBindings=PublisherBindings&{__publisherLease?:string};
// One phase per invocation; caller supplies no job/clock/receipt through HTTP.
export async function runStagedProductionPublisher(e:PublisherBindings,provider:ProductionMetaPublisher,clock:()=>number=Date.now){
 if(!(provider instanceof ProductionMetaPublisher))throw Error('EXPLICIT_LIVE_PROVIDER_REQUIRED');
 await publisherIdentity(e);const schema=await one(e,"SELECT 1 FROM schema_migrations WHERE name='0015_production_publisher_stages.sql'");
 if(!schema)return result(e.PRODUCTION_PUBLISHER_ENABLED==='true'?'stage_schema_required':'closed');
 const now=validTime(clock()),lease=crypto.randomUUID(),claimed=await s(e,'UPDATE production_publisher_runtime SET lease_id=?,lease_until=?,last_received_at=?,heartbeat_count=heartbeat_count+1,last_bucket=? WHERE id=1 AND (lease_until IS NULL OR lease_until<=?) AND (last_bucket IS NULL OR last_bucket<?) RETURNING id',lease,now+60000,now,Math.floor(now/60000),now,Math.floor(now/60000)).first();
 if(!claimed)return result('coalesced');
 const original=e.DB!,started=performance.now();let queries=3,state='failed';
 const counted:StagedBindings={...e,__publisherLease:lease,DB:{prepare(q){if(++queries>36)throw Error('PUBLISHER_QUERY_BUDGET');return original.prepare(q);},batch:q=>original.batch!(q)}};
 try{const r=await operation(counted,provider,clock);state=r.state;return {...r,queries:queries+1};}
 finally{await s(e,'UPDATE production_publisher_runtime SET last_complete_at=?,state=?,last_queries=?,last_duration_ms=?,lease_id=NULL,lease_until=NULL WHERE id=1 AND lease_id=?',validTime(clock()),state,queries+1,Math.ceil(performance.now()-started),lease).run();}
}
