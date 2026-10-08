import type {PublisherBindings} from './publisher-live.ts';
import {publisherIdentity,publisherImageBytes} from './publisher-live.ts';
import {approvedProductionItems} from './preview.ts';
import {ProductionMetaPublisher,PRODUCTION_PAGE,publicationHash} from './publisher-provider.ts';
import {businessDate,POLICY} from '../domain/policy.ts';
import {metaFingerprint} from '../cloud/meta.ts';
import {versionGuard} from '../cloud/version-guard.ts';

const one=(e:PublisherBindings,q:string,...v:(string|number)[])=>e.DB!.prepare(q).bind(...v).first<Record<string,any>>();
const date=(n:number)=>businessDate(new Date(n));
const validClock=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('PREFLIGHT_CLOCK_INVALID');return n;};
// This capability cannot forward a POST even if a provider implementation regresses.
export function readOnlyMetaProvider(e:PublisherBindings,transport:typeof fetch){
 return new ProductionMetaPublisher(e,async(input,init)=>{
  const url=new URL(String(input));
  if(init?.method!=='GET'||url.origin!=='https://graph.facebook.com'||!['/'+e.META_API_VERSION+'/debug_token','/'+e.META_API_VERSION+'/me'].includes(url.pathname))throw Error('PREFLIGHT_TRANSPORT_DENIED');
  return transport(input,init);
 });
}
// No write SQL, runtime tick, permit issuance, claim or publication exists in this operation.
export async function productionSendPreflight(env:PublisherBindings,input:unknown,transport:typeof fetch,clock:()=>number=Date.now){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='versionId')||typeof (input as any).versionId!=='string'||! /^[a-zA-Z0-9:-]{1,128}$/.test((input as any).versionId))throw Error('SEND_REVIEW_INVALID');
 let queries=0;const started=performance.now(),original=env.DB!;
 const e:PublisherBindings={...env,DB:{prepare(q){if(!/^\s*SELECT\b/i.test(q))throw Error('PREFLIGHT_WRITE_DENIED');if(++queries>24)throw Error('PREFLIGHT_QUERY_BUDGET');return original.prepare(q);},async batch(){throw Error('PREFLIGHT_WRITE_DENIED');}}};
 const now=validClock(clock()),identity=await publisherIdentity(e);
 const config=await one(e,'SELECT * FROM production_publisher_config WHERE id=1');
 if(e.PRODUCTION_PUBLISHER_ENABLED!=='false'||config?.enabled!==0||identity.paused_by_user!==1||identity.maintenance_owner!==null||identity.blocked_reasons!=='[]')throw Error('PREFLIGHT_CLOSED_GATES_REQUIRED');
 const versionId=(input as any).versionId;
 const item=(await approvedProductionItems(e,now,versionId))[0];
 if(!item?.approvalValid)throw Error('SEND_REVIEW_REQUIRED');
 const state=await one(e,"SELECT (SELECT count(*) FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown')) active,(SELECT count(*) FROM production_send_permits WHERE revoked=0) permits,(SELECT count(*) FROM production_publisher_usage WHERE day=? OR post=?) used",date(now),item.postId);
 if(state!.active||state!.permits||state!.used)throw Error('SEND_REVIEW_BUSY');
 const used=(await e.DB!.prepare('SELECT post FROM production_publisher_usage').all!<{post:string}>()).results;
 if(item.prerequisites.some(id=>!used.some(p=>p.post===id)))throw Error('SEND_PREREQUISITES_REQUIRED');
 const file=await one(e,"SELECT * FROM cloud_library WHERE id=? AND state='complete' AND checksum=?",item.imageUrl!.split('/').at(-1)!,item.imageChecksum);
 if(!file)throw Error('SEND_IMAGE_UNAVAILABLE');
 const bytes=await publisherImageBytes(e,file),provider=readOnlyMetaProvider(e,transport),proof=await provider.verify(clock());
 if(!proof.verified)throw Error('SEND_CONNECTION_UNVERIFIED');
 const completed=validClock(clock()),current=(await approvedProductionItems(e,completed,versionId))[0],after=await publisherIdentity(e),afterConfig=await one(e,'SELECT * FROM production_publisher_config WHERE id=1');
 const afterState=await one(e,"SELECT (SELECT count(*) FROM production_send_permits WHERE revoked=0) permits,(SELECT count(*) FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown')) active,(SELECT count(*) FROM production_publisher_usage WHERE day=? OR post=?) used",date(completed),item.postId);
 if(!current?.approvalValid||JSON.stringify(current)!==JSON.stringify(item)||JSON.stringify(config)!==JSON.stringify(afterConfig)||JSON.stringify(identity)!==JSON.stringify(after)||afterState!.permits||afterState!.active||afterState!.used||await metaFingerprint(e)!==proof.fingerprint||date(now)!==date(completed)||completed-now>30000)throw Error('SEND_REVIEW_CHANGED');
 const dueAt=Math.ceil((completed+120000)/60000)*60000;
 if(date(dueAt)!==date(completed))throw Error('SEND_REVIEW_NEXT_DAY');
 const dossier={environment:'production',pageId:PRODUCTION_PAGE,pageName:'Ngành Kinh tế số - NTTU',release:e.RELEASE_SHA!,postId:item.postId,key:item.key,title:item.title,versionId:item.versionId,checkVersion:item.checkVersion,receiptDigest:item.receiptDigest,caption:item.caption,captionHash:await publicationHash(item.caption),imageUrl:item.imageUrl!,imageChecksum:item.imageChecksum,imageBytes:bytes.length,connectionFingerprint:proof.fingerprint,configRevision:config!.revision,operationGeneration:identity.operation_generation,mode:'test',businessDate:date(dueAt),dueAt,expiresAt:dueAt+600000,checkedAt:completed,reviewExpiresAt:completed+300000,timeZone:POLICY.timeZone};
 return {dryRun:true,publishingEnabled:false,realPublication:'NOT_RUN',sendReady:false,preparationVerified:true,dossier,dossierHash:await publicationHash(JSON.stringify(dossier)),queries,wallMs:Math.ceil(performance.now()-started),note:'Đã kiểm tra chuẩn bị gửi. Chưa cấp quyền đăng, chưa bật bộ đăng và chưa gửi Facebook. Thời điểm đề xuất chỉ có giá trị trong hồ sơ này.'};
}
export type SendReview=Awaited<ReturnType<typeof productionSendPreflight>>;
const eligible=(now:number)=>versionGuard('production_send_permits.version_id',now).replace('WHERE old.post_id=q.prerequisite_id)', 'WHERE old.post_id=q.prerequisite_id UNION ALL SELECT 1 FROM production_publisher_usage pu WHERE pu.post=q.prerequisite_id)');

// Future owner-approved operation. It is unreachable from production HTTP in B38.
// The same immutable review is rechecked before either SQL statement can take effect.
export async function issueSingleTestPermit(e:PublisherBindings,review:SendReview,approval:{actor:string;dossierHash:string},clock:()=>number=Date.now){
 if(e.PRODUCTION_PUBLISHER_ENABLED!=='true'||approval.actor!==POLICY.ownerEmail||approval.dossierHash!==review.dossierHash||await publicationHash(JSON.stringify(review.dossier))!==review.dossierHash||review.dossier.pageId!==PRODUCTION_PAGE||review.dossier.mode!=='test')throw Error('PUBLICATION_APPROVAL_REQUIRED');
 const now=validClock(clock()),d=review.dossier,a=await publisherIdentity(e);
 if(now<d.checkedAt||now>=d.reviewExpiresAt||now>=d.dueAt||date(now)!==d.businessDate||d.release!==e.RELEASE_SHA||a.operation_generation!==d.operationGeneration||await metaFingerprint(e)!==d.connectionFingerprint)throw Error('SEND_REVIEW_EXPIRED');
 const current=(await approvedProductionItems(e,now,d.versionId))[0];
 if(!current?.approvalValid||current.receiptDigest!==d.receiptDigest||current.caption!==d.caption||current.imageChecksum!==d.imageChecksum)throw Error('SEND_REVIEW_CHANGED');
 const id='production-permit:'+crypto.randomUUID();
 const result=await e.DB!.prepare(`INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at) SELECT ?,?,?,?,?,?,?,?,'test',?,? WHERE EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND enabled=0 AND revision=? AND active_job IS NULL AND blocked IS NULL) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL AND blocked_reasons='[]' AND operation_generation=?) AND NOT EXISTS(SELECT 1 FROM production_send_permits WHERE revoked=0) AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown')) AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=? OR post=?) AND EXISTS(SELECT 1 FROM post_versions WHERE id=? AND check_version=?) AND ${versionGuard('?',now).replace('WHERE old.post_id=q.prerequisite_id)', 'WHERE old.post_id=q.prerequisite_id UNION ALL SELECT 1 FROM production_publisher_usage pu WHERE pu.post=q.prerequisite_id)')} RETURNING id`).bind(id,PRODUCTION_PAGE,d.versionId,d.caption,d.imageChecksum,d.businessDate,d.dueAt,d.expiresAt,approval.actor,now,d.configRevision,d.operationGeneration,d.businessDate,d.postId,d.versionId,d.checkVersion,d.versionId).first();
 if(!result)throw Error('PUBLICATION_APPROVAL_CONFLICT');return {permitId:id,publishingEnabled:false};
}

export async function activateSingleTestPermit(e:PublisherBindings,permitId:string,actor:string,clock:()=>number=Date.now){
 if(e.PRODUCTION_PUBLISHER_ENABLED!=='true'||actor!==POLICY.ownerEmail)throw Error('PUBLICATION_APPROVAL_REQUIRED');
 const now=validClock(clock());await publisherIdentity(e);
 const permit=await one(e,'SELECT * FROM production_send_permits WHERE id=?',permitId),config=await one(e,'SELECT * FROM production_publisher_config WHERE id=1');
 if(!permit||permit.revoked||permit.mode!=='test'||permit.actor!==actor||permit.page_id!==PRODUCTION_PAGE||permit.due_at<=now||date(now)!==permit.business_date||config!.enabled||config!.active_job||config!.blocked)throw Error('PUBLICATION_APPROVAL_CONFLICT');
 const fingerprint=await metaFingerprint(e);
 await e.DB!.batch!([
  e.DB!.prepare(`UPDATE production_publisher_config SET enabled=1,start_date=?,connection_hash=? WHERE id=1 AND enabled=0 AND revision=? AND active_job IS NULL AND blocked IS NULL AND EXISTS(SELECT 1 FROM production_send_permits WHERE id=? AND mode='test' AND revoked=0 AND due_at>? AND ${eligible(now)}) AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL AND blocked_reasons='[]') AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown')) AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=?)`).bind(permit.business_date,fingerprint,config!.revision,permitId,now,permit.business_date),
  e.DB!.prepare("UPDATE application_state SET paused_by_user=0 WHERE environment='production' AND EXISTS(SELECT 1 FROM production_publisher_config WHERE id=1 AND enabled=1 AND revision=? AND start_date=? AND connection_hash=?) AND EXISTS(SELECT 1 FROM production_send_permits WHERE id=? AND revoked=0)").bind(config!.revision+1,permit.business_date,fingerprint,permitId),
 ]);
 const a=await publisherIdentity(e),c=await one(e,'SELECT enabled FROM production_publisher_config WHERE id=1');
 if(a.paused_by_user!==0||c!.enabled!==1)throw Error('PUBLICATION_APPROVAL_CONFLICT');return {singleTestActivated:true,permitId};
}
