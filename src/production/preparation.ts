import type {PublisherBindings} from './publisher-live.ts';
import {publisherImageBytes} from './publisher-live.ts';
import {assertProductionEnvironment,assertProductionState,PRODUCTION_STATE_SQL} from './management.ts';
import {assertPublisherBoundary} from './publisher-boundary.ts';
import {approvalQueries,projectApprovalRows} from './preview.ts';
import type {ProjectionRows} from './preview.ts';
import {digest} from './read-pages.ts';
import {readOnlyMetaProvider} from './send-preflight.ts';
import {PRODUCTION_PAGE,publicationHash} from './publisher-provider.ts';
import {metaFingerprint} from '../cloud/meta.ts';
import {businessDate,POLICY} from '../domain/policy.ts';

type Row=Record<string,any>;
type Receipt={kind:'nttu-preparation-v1';owner:string;release:string;page:string;phase:'image'|'connection'|'finalize';version:string;post:string;approval:string;captionHash:string;checksum:string;snapshot:string;fingerprint:string;started:number;expires:number;deadline:number|null;day:string;imageBytes?:number};
const encoder=new TextEncoder(),hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
let cachedKey:{raw:string;value:Promise<CryptoKey>}|undefined;
function key(e:PublisherBindings){
 if(!e.SESSION_SIGNING_KEY)throw Error('SEND_RECEIPT_UNAVAILABLE');
 if(cachedKey?.raw!==e.SESSION_SIGNING_KEY)cachedKey={raw:e.SESSION_SIGNING_KEY,value:crypto.subtle.importKey('raw',encoder.encode(e.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])};
 return cachedKey.value;
}
async function sign(e:PublisherBindings,r:Receipt){const body=btoa(JSON.stringify(r));return body+'.'+hex(await crypto.subtle.sign('HMAC',await key(e),encoder.encode('nttu-preparation-v1:'+body)));}
async function verify(e:PublisherBindings,token:string,now:number):Promise<Receipt>{
 if(token.length>4096||! /^[A-Za-z0-9+/=]+\.[a-f0-9]{64}$/.test(token))throw Error('SEND_RECEIPT_INVALID');
 const [body,signature]=token.split('.');
 if(!await crypto.subtle.verify('HMAC',await key(e),Uint8Array.from(signature!.match(/../g)!,x=>parseInt(x,16)),encoder.encode('nttu-preparation-v1:'+body)))throw Error('SEND_RECEIPT_INVALID');
 let r:Receipt;try{r=JSON.parse(atob(body!));}catch{throw Error('SEND_RECEIPT_INVALID');}
 if(r.kind!=='nttu-preparation-v1'||r.owner!==POLICY.ownerEmail||r.release!==e.RELEASE_SHA||r.page!==PRODUCTION_PAGE||!['image','connection','finalize'].includes(r.phase)||!Number.isSafeInteger(r.started)||r.started>now||r.expires!==r.started+300000||now>=r.expires||r.deadline!==null&&now>=r.deadline||r.day!==businessDate(new Date(now)))throw Error('SEND_RECEIPT_EXPIRED');
 return r;
}
const clockValue=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('PREFLIGHT_CLOCK_INVALID');return n;};
const day=(n:number)=>businessDate(new Date(n));
// Preparation is scoped to one selected version. F1 warehouse preview still uses
// its global snapshot. Immutable row identities/revisions are protected by the
// same triggers/FKs; final projection rechecks the complete approval bytes.
function selectedSnapshot(e:PublisherBindings,version:string,now:number){
 const specs=[
  ['posts','rowid,content_key,topic_group,pool','id=(SELECT post_id FROM post_versions WHERE id=?)'],
  ['content_entries','rowid,active_version_id,stage,stable_order','post_id=(SELECT post_id FROM post_versions WHERE id=?)'],
  ['post_versions','rowid,check_version,status,review_due_at','id=?'],
  ['sources','rowid,status,reviewed_at,review_due_at','id IN (SELECT source_id FROM version_sources WHERE version_id=?)'],
  ['facts','rowid,status,review_due_at','id IN (SELECT fact_id FROM version_facts WHERE version_id=?)'],
  ['post_prerequisites','post_id,prerequisite_id','post_id=(SELECT post_id FROM post_versions WHERE id=?)'],
  ['assets','rowid,status','id=(SELECT asset_id FROM post_versions WHERE id=?)'],
  ['asset_bindings','rowid,asset_id,checksum,check_version','version_id=?'],
  ['cloud_library','rowid,state',"kind='document' OR 'library-'||id=(SELECT asset_id FROM post_versions WHERE id=?)"],
  ['cloud_reviews','rowid,check_version','version_id=?'],
  ['application_state','operation_generation,paused_by_user,maintenance_owner,blocked_reasons',"environment='production'"],
 ] as const;
 const values:(string|number)[]=[],parts=specs.map(([table,fields,where])=>{
  const expiry=['post_versions','sources','facts'].includes(table);
  if(expiry)values.push(now);if(where.includes('?'))values.push(version);
  return `(SELECT json_group_array(json(row)) FROM (SELECT json_array(${fields}${expiry?",CASE WHEN review_due_at IS NULL THEN 0 WHEN julianday(review_due_at)*86400000-210866760000000<=? THEN 1 ELSE 0 END":''}) row FROM ${table} WHERE ${where} ORDER BY ${fields}))`;
 });
 return e.DB!.prepare('SELECT json_array('+parts.join(',')+') snapshot').bind(...values);
}
// There is no write statement or provider POST capability in any preparation phase.
export async function productionPreparation(e:PublisherBindings,input:unknown,transport:typeof fetch,clock:()=>number=Date.now,expectedPhase?:string){
 assertProductionEnvironment(e);assertPublisherBoundary(e.APP_ENV??'',e.META_PAGE_ID??'',e.PRODUCTION_DATABASE_ID??'',e.PRODUCTION_ASSET_BUCKET??'');
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1)throw Error('SEND_REVIEW_INVALID');
 const i=input as Record<string,unknown>,now=clockValue(clock());
 const initial=typeof i.versionId==='string'&&/^[a-zA-Z0-9:-]{1,128}$/.test(i.versionId);
 if(!initial&&typeof i.receipt!=='string')throw Error('SEND_REVIEW_INVALID');
 const prior=initial?null:await verify(e,i.receipt as string,now),version=prior?.version??i.versionId as string;
 if(expectedPhase!==undefined&&expectedPhase!==(prior?.phase??'content'))throw Error('SEND_RECEIPT_PHASE_INVALID');
 const projected=!prior||prior.phase==='finalize';
 if(!e.DB!.batch)throw Error('PRODUCTION_DATABASE_UNAVAILABLE');
 const identitySQL=PRODUCTION_STATE_SQL.replace('a.paused_by_user,','a.paused_by_user,a.maintenance_owner,a.blocked_reasons,a.operation_generation,');
 const statements=[e.DB!.prepare(identitySQL),e.DB!.prepare('SELECT * FROM production_publisher_config WHERE id=1'),
  e.DB!.prepare(`SELECT (SELECT count(*) FROM production_publisher_jobs WHERE state IN ('held','requested','retry_wait','unknown')) active,
   (SELECT count(*) FROM production_send_permits WHERE revoked=0) permits,
   (SELECT count(*) FROM production_publisher_usage WHERE day=? OR post=(SELECT post_id FROM post_versions WHERE id=?)) used,
   (SELECT count(*) FROM post_prerequisites q WHERE q.post_id=(SELECT post_id FROM post_versions WHERE id=?) AND NOT EXISTS(SELECT 1 FROM production_publisher_usage u WHERE u.post=q.prerequisite_id)) prerequisites,
   (SELECT min(julianday(review_due_at)*86400000-210866760000000) FROM (SELECT review_due_at FROM post_versions WHERE id=? UNION ALL SELECT review_due_at FROM sources WHERE id IN (SELECT source_id FROM version_sources WHERE version_id=?) UNION ALL SELECT review_due_at FROM facts WHERE id IN (SELECT fact_id FROM version_facts WHERE version_id=?)) WHERE julianday(review_due_at)*86400000-210866760000000>?) deadline`).bind(day(now),version,version,version,version,version,now),
  selectedSnapshot(e,version,now),
  e.DB!.prepare("SELECT l.* FROM post_versions v JOIN content_entries c ON c.active_version_id=v.id JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE v.id=? AND l.state='complete'").bind(version)];
 if(projected)statements.push(...approvalQueries('?',[version]).map(q=>e.DB!.prepare(q.sql).bind(...q.values)));
 if(statements.some(s=>!s))throw Error('SEND_PREFLIGHT_UNAVAILABLE');
 const results=await e.DB!.batch!(statements) as {results:Row[]}[];
 const identity=assertProductionState(e,results[0]?.results[0]),config=results[1]?.results[0],state=results[2]?.results[0],file=results[4]?.results[0];
 if(identity.migration_count!==14)throw Error('PRODUCTION_IDENTITY_INVALID');
 if(e.PRODUCTION_PUBLISHER_ENABLED!=='false'||config?.enabled!==0||config.active_job!==null||config.blocked!==null||identity.paused_by_user!==1||identity.maintenance_owner!==null||identity.blocked_reasons!=='[]')throw Error('PREFLIGHT_CLOSED_GATES_REQUIRED');
 if(!state||state.active||state.permits||state.used)throw Error('SEND_REVIEW_BUSY');
 if(state.prerequisites)throw Error('SEND_PREREQUISITES_REQUIRED');
 if(!file)throw Error('SEND_IMAGE_UNAVAILABLE');
 const snapshot=await digest(JSON.stringify([results[3]?.results[0]?.snapshot,config])),fingerprint=await metaFingerprint(e);
 if(prior&&(prior.snapshot!==snapshot||prior.fingerprint!==fingerprint||prior.checksum!==file.checksum))throw Error('SEND_REVIEW_CHANGED');
 const item=projected?(await projectApprovalRows(now,'batch',results.slice(5).map(r=>r.results) as ProjectionRows))[0]:null;
 if(projected&&!item?.approvalValid)throw Error('SEND_REVIEW_REQUIRED');
 let receipt:Receipt=prior??{kind:'nttu-preparation-v1',owner:POLICY.ownerEmail,release:e.RELEASE_SHA!,page:PRODUCTION_PAGE,phase:'image',version,post:item!.postId,approval:item!.receiptDigest,captionHash:await publicationHash(item!.caption),checksum:item!.imageChecksum,snapshot,fingerprint,started:now,expires:now+300000,deadline:state.deadline==null?null:Math.floor(state.deadline),day:day(now)};
 let phase='content';
 if(prior?.phase==='image'){
  const bytes=await publisherImageBytes(e,file);receipt={...prior,phase:'connection',imageBytes:bytes.length};phase='image';
 }else if(prior?.phase==='connection'){
  const proof=await readOnlyMetaProvider(e,transport).verify(now);
  if(!proof.verified||proof.fingerprint!==prior.fingerprint)throw Error('SEND_CONNECTION_UNVERIFIED');
  const deadlines=[prior.deadline,proof.expiresAt,proof.dataAccessExpiresAt].filter((n):n is number=>typeof n==='number');
  receipt={...prior,phase:'finalize',deadline:deadlines.length?Math.min(...deadlines):null};phase='connection';
 }else if(prior?.phase==='finalize'){
  if(item!.receiptDigest!==prior.approval||item!.postId!==prior.post||await publicationHash(item!.caption)!==prior.captionHash||item!.imageChecksum!==prior.checksum||prior.imageBytes!==file.size_bytes)throw Error('SEND_REVIEW_CHANGED');
  const completed=clockValue(clock());await verify(e,i.receipt as string,completed);
  if(completed<now||await metaFingerprint(e)!==prior.fingerprint)throw Error('SEND_REVIEW_CHANGED');
  const dueAt=Math.ceil((completed+120000)/60000)*60000;
  if(day(dueAt)!==day(completed))throw Error('SEND_REVIEW_NEXT_DAY');
  const dossier={environment:'production',pageId:PRODUCTION_PAGE,pageName:'Ngành Kinh tế số - NTTU',release:e.RELEASE_SHA!,postId:item!.postId,key:item!.key,title:item!.title,versionId:item!.versionId,checkVersion:item!.checkVersion,receiptDigest:item!.receiptDigest,caption:item!.caption,captionHash:prior.captionHash,imageUrl:item!.imageUrl!,imageChecksum:item!.imageChecksum,imageBytes:prior.imageBytes,connectionFingerprint:prior.fingerprint,configRevision:config!.revision,operationGeneration:identity.operation_generation,mode:'test',businessDate:day(dueAt),dueAt,expiresAt:dueAt+600000,checkedAt:completed,reviewExpiresAt:Math.min(completed+300000,prior.expires,prior.deadline??Infinity),timeZone:POLICY.timeZone};
  return {dryRun:true,complete:true,phase:'finalize',publishingEnabled:false,realPublication:'NOT_RUN',sendReady:false,preparationVerified:true,dossier,dossierHash:await publicationHash(JSON.stringify(dossier)),nextReceipt:null,note:'Đã kiểm nội dung, byte ảnh và kết nối fanpage. Chưa cấp quyền đăng, chưa bật bộ đăng và chưa gửi Facebook.'};
 }
 const completed=clockValue(clock());
 if(completed<now||completed>=receipt.expires||receipt.deadline!==null&&completed>=receipt.deadline||day(completed)!==receipt.day||await metaFingerprint(e)!==receipt.fingerprint)throw Error('SEND_REVIEW_CHANGED');
 return {dryRun:true,complete:false,phase,publishingEnabled:false,realPublication:'NOT_RUN',sendReady:false,preparationVerified:false,nextReceipt:await sign(e,receipt)};
}
