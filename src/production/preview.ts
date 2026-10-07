import type {ManagementBindings} from './management.ts';
import {productionState} from './management.ts';
import {composeCaption,FOOTER_VERSION} from '../domain/footer.ts';
import {businessDate,scheduledInstant,POLICY} from '../domain/policy.ts';
import {SOURCE_REGISTRY} from '../cloud/source-registry.ts';
import {PUBLISHER_RESOURCES,assertPublisherBoundary} from './publisher-boundary.ts';
type Row=Record<string,any>;
const parse=(s:unknown)=>{try{return JSON.parse(String(s));}catch{return null;}};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const future=(s:unknown,n:number)=>s==null||Number.isFinite(Date.parse(String(s)))&&Date.parse(String(s))>n;
async function rows(env:ManagementBindings,sql:string,values:string[]=[]){return (await env.DB!.prepare(sql).bind(...values).all!<Row>()).results;}
// All SQL is SELECT. This projection never grants readiness or consumes stock.
export async function productionPreview(env:ManagementBindings,startDate?:string,now=Date.now()){
 await productionState(env);
 assertPublisherBoundary('production',env.META_PAGE_ID??'',env.PRODUCTION_DATABASE_ID??'',env.PRODUCTION_ASSET_BUCKET??'');
 if(!Number.isSafeInteger(now)||now<0)throw Error('PREVIEW_CLOCK_INVALID');
 const tomorrow=businessDate(new Date(now+86400000));
 const start=startDate??tomorrow;
 try{scheduledInstant(start);}catch{throw Error('PREVIEW_DATE_INVALID');}
 if(start<businessDate(new Date(now))||scheduledInstant(start).getTime()>now+366*86400000)throw Error('PREVIEW_DATE_INVALID');
 const items=await approvedProductionItems(env,now);
 const main=items.filter(p=>p.pool==='scheduled'),reserve=items.filter(p=>p.pool==='reserve');
 const calendar=main.map((p,i)=>{const day=new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);return {...p,day,publishAt:scheduledInstant(day).toISOString(),prerequisitePreviewSatisfied:p.prerequisites.every(id=>main.slice(0,i).some(q=>q.postId===id&&q.approvalValid))};});
 return {environment:'production',previewOnly:true,publishingEnabled:false,realPublication:'NOT_RUN',checkedAt:new Date(now).toISOString(),startDate:start,timeZone:POLICY.timeZone,publishTime:POLICY.publishTime,
  resources:PUBLISHER_RESOURCES.production,total:items.length,valid:items.filter(p=>p.approvalValid).length,main:main.length,reserve:reserve.length,warehouseComplete:items.length===40&&main.length===30&&reserve.length===10,
  calendar,reserves:reserve,gates:{deployment:false,database:false,ownerPublicationApproval:false,liveTransport:false,httpPublisher:false},
  note:'Bản xem trước không lưu lịch và không cấp quyền đăng bài. Ngày bắt đầu cần được duyệt riêng.'};
}

export async function approvedProductionItems(env:ManagementBindings,now:number,versionId?:string){
 const [posts,sources,facts,documents,prerequisites]=await Promise.all([
 rows(env,`SELECT p.id,p.content_key,p.topic_group,p.pool,e.stable_order,e.stage,v.id version_id,v.body,v.caption_title,v.status,v.check_version,v.review_due_at,v.metadata_json,
 a.id asset_id,a.checksum,a.width,a.height,a.content_type,a.size_bytes,a.status asset_status,b.asset_id binding_id,b.checksum binding_checksum,b.check_version binding_version,
 l.id image_id,l.checksum library_checksum,l.state library_state,
 r.id review_id,r.check_version reviewed_version,r.asset_checksum,r.footer_version,r.body_snapshot,r.caption_snapshot,r.source_snapshot,r.rubric_json,r.reviewer actor,r.checked_at
 FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id
 LEFT JOIN assets a ON a.id=v.asset_id LEFT JOIN asset_bindings b ON b.version_id=v.id
 LEFT JOIN cloud_library l ON v.asset_id='library-'||l.id
 LEFT JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version ${versionId?'WHERE v.id=?':''} ORDER BY e.stable_order,p.id`,versionId?[versionId]:[]),
 rows(env,'SELECT x.version_id,x.location ref_json,s.* FROM version_sources x JOIN sources s ON s.id=x.source_id'+(versionId?' WHERE x.version_id=?':''),versionId?[versionId]:[]),
 rows(env,'SELECT x.version_id,f.* FROM version_facts x JOIN facts f ON f.id=x.fact_id'+(versionId?' WHERE x.version_id=?':''),versionId?[versionId]:[]),
 rows(env,"SELECT source_key,checksum FROM cloud_library WHERE kind='document' AND state='complete' ORDER BY source_key,checksum"),
 rows(env,'SELECT post_id,prerequisite_id FROM post_prerequisites'+(versionId?' WHERE post_id=(SELECT post_id FROM post_versions WHERE id=?)':''),versionId?[versionId]:[]),
 ]);
 const items=await Promise.all(posts.map(async p=>{
  const reasons:string[]=[],meta=parse(p.metadata_json),approval=meta?.ownerApproval,receipt=parse(p.source_snapshot),refs=meta?.sourceRefs;
  const caption=composeCaption(p.body);
  if(p.stage!=='caption'||p.status==='quarantined'||!future(p.review_due_at,now))reasons.push('VERSION_INELIGIBLE');
  if(!p.review_id||p.reviewed_version!==p.check_version||p.body_snapshot!==p.body||p.caption_snapshot!==caption||p.footer_version!==FOOTER_VERSION
    ||p.actor!==POLICY.ownerEmail||!Number.isFinite(Date.parse(p.checked_at))||Date.parse(p.checked_at)>now)reasons.push('APPROVAL_RECEIPT_INVALID');
  if(approval?.scope!=='content_and_design_only'||![22,23].includes(approval?.step)||approval?.bodyChecksum!==await hash(p.body)||approval?.captionChecksum!==await hash(caption)||approval?.imageChecksum!==p.checksum)reasons.push('APPROVED_BYTES_CHANGED');
  const rubric=parse(p.rubric_json);if(!rubric||['accuracy','usefulness','clarity','originality','visual_quality'].some(k=>rubric[k]!==true))reasons.push('REVIEW_RUBRIC_INVALID');
  if(p.asset_status!=='complete'||p.library_state!=='complete'||p.library_checksum!==p.checksum||p.binding_id!==p.asset_id||p.binding_checksum!==p.checksum||p.asset_checksum!==p.checksum||p.binding_version!==p.check_version
    ||p.width!==1080||p.height!==1080||p.content_type!=='image/png'||p.size_bytes<=0||p.size_bytes>5242880)reasons.push('IMAGE_BINDING_INVALID');
  const linked=sources.filter(s=>s.version_id===p.version_id).sort((a,b)=>String(a.id).localeCompare(String(b.id))||String(a.ref_json).localeCompare(String(b.ref_json)));
  if(!Array.isArray(refs)||!refs.length||!Array.isArray(receipt)||linked.length!==refs.length||receipt.length!==refs.length)reasons.push('SOURCES_MISSING');
  else for(const ref of refs){
   const def=SOURCE_REGISTRY.find(s=>s.id===ref.id),source=linked.find(s=>same(parse(s.ref_json),ref)),r=receipt.find((s:Row)=>s.id===ref.id);
   if(!def||!source||!r||source.revision!==def.sha256||source.authority!==def.authority||r.revision!==def.sha256||r.authority!==def.authority
     ||!same({...ref,title:def.name,revision:def.sha256,authority:def.authority},r)||source.status!=='verified'
     ||!Number.isFinite(Date.parse(source.reviewed_at))||Date.parse(source.reviewed_at)>Date.parse(p.checked_at)||!future(source.review_due_at,now)
     ||def.authority==='document'&&!documents.some(d=>d.source_key===def.id&&d.checksum===def.sha256))reasons.push('SOURCE_RECEIPT_INVALID');
   if(!Array.isArray(ref.pages)||ref.pages.some((n:unknown)=>!Number.isInteger(n)||Number(n)<1||Number(n)>(def?.pages??0)))reasons.push('SOURCE_PAGE_INVALID');
  }
  const linkedFacts=facts.filter(f=>f.version_id===p.version_id).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(linkedFacts.some(f=>f.status!=='verified'||!future(f.review_due_at,now)||f.cohort!=null&&f.cohort!==2026||!linked.some(s=>s.id===f.source_id&&s.status==='verified')))reasons.push('FACT_INVALID');
  if(p.topic_group==='I'&&[['training_duration_years','3.5'],['cohort','2026']].some(([key,value])=>!linkedFacts.some(f=>f.fact_key===key&&f.value_json===value&&linked.some(s=>s.id===f.source_id&&parse(s.ref_json)?.id==='OWNER-2026'))))reasons.push('PROGRAM_FACTS_INVALID');
  return {postId:p.id,key:p.content_key,versionId:p.version_id,title:p.caption_title,pool:p.pool,order:p.stable_order,caption,imageUrl:p.image_id?'/api/library/files/'+p.image_id:null,
   imageChecksum:p.checksum,checkVersion:p.check_version,receiptDigest:await hash(JSON.stringify([p,linked,linkedFacts,documents])),sourceRefs:refs??[],approvalValid:reasons.length===0,reasons:[...new Set(reasons)],prerequisites:prerequisites.filter(q=>q.post_id===p.id).map(q=>q.prerequisite_id)};
 }));
 return items;
}
