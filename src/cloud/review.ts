import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';
import {validateEditorReferences,EditorError} from '../domain/editor.ts';
import {composeCaption,FOOTER_VERSION,CAPTION_SEPARATOR} from '../domain/footer.ts';
import {normalizedBody} from '../domain/content.ts';
import {verifiedBytes,checksum,downloadFile} from './storage.ts';
import {SOURCE_REGISTRY} from './source-registry.ts';
import type {SourceDefinition} from './source-registry.ts';

type Row=Record<string,unknown>;
type Issue={code:string;matches?:string[]};
type AuditData={sources:Row[];assets:Row[];bindings:Row[];reviews:Row[]};
export const REVIEW_KEYS=['accuracy','usefulness','clarity','originality','visual_quality'] as const;
async function rows(env:CloudBindings,sql:string,...args:(string|number|null)[]) {
  const statement=env.DB!.prepare(sql).bind(...args);
  if(!statement.all)throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);
  return (await statement.all<Row>()).results;
}
export function createCloudReview(env:CloudBindings,registry:readonly SourceDefinition[]=SOURCE_REGISTRY) {
  const cache=new Map<string,Promise<void>>();
  let fileRows:Promise<Row[]>|undefined;
  const begin=()=>{cache.clear();fileRows=undefined;};
  const files=()=>fileRows??=rows(env,"SELECT * FROM cloud_library WHERE kind='document' AND state='complete'");
  const checked=(file:Row)=>{const id=String(file.id);if(!cache.has(id))cache.set(id,verifiedBytes(env,file).then(()=>{}));return cache.get(id)!;};
  const fileFor=async(source:SourceDefinition)=>(await files()).find(f=>f.source_key===source.id&&f.checksum===source.sha256);
  async function listSources() {
    begin();
    await readStatus(env);
    return Promise.all(registry.map(async source=>{const file=source.authority==='document'?await fileFor(source):null;return {...source,
      available:source.authority==='user_confirmation'||Boolean(env.MEDIA&&file),integrityChecked:false,
      pdfUrl:file?'/api/sources/'+source.id+'/pdf':null};}));
  }
  async function resolveReferences(input:unknown,reuseCache=false) {
    if(!reuseCache)begin();
    let refs;try {refs=validateEditorReferences(input);}catch(error){throw new CatalogError(error instanceof EditorError?error.code:'INVALID_SOURCE_REFERENCES');}
    return Promise.all(refs.map(async ref=>{
      const source=registry.find(s=>s.id===ref.id);if(!source)throw new CatalogError('SOURCE_NOT_FOUND');
      if(source.authority==='document'&&(!ref.pages.length||ref.pages.some(page=>page>source.pages))
        ||source.authority==='user_confirmation'&&ref.pages.length)throw new CatalogError('SOURCE_PAGE_INVALID');
      if(source.authority==='document') {
        const file=await fileFor(source);if(!file)throw new CatalogError('SOURCE_FILE_UNAVAILABLE');
        try {await checked(file);}catch {throw new CatalogError('SOURCE_FILE_CHANGED',409);}
      }
      return {...ref,title:source.name,revision:source.sha256,authority:source.authority};
    }));
  }
  const postSQL=`SELECT p.id post_id,p.content_key,p.topic_group,v.*,e.stage FROM posts p
    JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id`;
  async function auditRow(row:Row,all:Row[],published:Row[],preloaded?:AuditData) {
    const meta=JSON.parse(String(row.metadata_json)) as Record<string,unknown>,issues:Issue[]=[];
    if(row.stage==='brief'||meta.isBrief)issues.push({code:'SAVE_CAPTION_FIRST'});
    if(typeof meta.sourceNote!=='string'||!meta.sourceNote.trim())issues.push({code:'SOURCE_NOTE_REQUIRED'});
    let snapshot:Awaited<ReturnType<typeof resolveReferences>>=[];
    let sourcesVerified=false;
    try {
      snapshot=await resolveReferences(meta.sourceRefs??[],true);
      if(!snapshot.some(r=>r.authority==='document'))issues.push({code:'SOURCE_PROVENANCE_REQUIRED'});
      const stored=preloaded?preloaded.sources.filter(s=>s.version_id===row.id):await rows(env,`SELECT s.*,r.location FROM sources s JOIN version_sources r ON r.source_id=s.id WHERE r.version_id=?`,String(row.id));
      if(stored.length!==snapshot.length||snapshot.some(ref=>!stored.some(s=>s.revision===ref.revision&&s.authority===ref.authority
        &&s.location===JSON.stringify({id:ref.id,pages:ref.pages,section:ref.section,supports:ref.supports,adaptation:ref.adaptation}))))issues.push({code:'SOURCE_BINDING_CHANGED'});
      if(stored.some(s=>s.status==='blocked'))issues.push({code:'SOURCE_BLOCKED'});
      sourcesVerified=stored.length>0&&stored.every(s=>s.status==='verified'&&s.reviewed_at&&Number.isFinite(Date.parse(String(s.reviewed_at)))&&Date.parse(String(s.reviewed_at))<=Date.now());
      if(stored.some(s=>s.review_due_at&&Date.parse(String(s.review_due_at))<=Date.now()))issues.push({code:'SOURCE_REVIEW_EXPIRED'});
    }catch(error){issues.push({code:error instanceof CatalogError?error.code:'SOURCE_BINDING_CHANGED'});}
    const refs=Array.isArray(meta.sourceRefs)?meta.sourceRefs as {id:string}[]:[];
    if(row.topic_group==='I'&&(!refs.some(r=>['BM03','BM11','BM12'].includes(r.id))||!refs.some(r=>r.id==='OWNER-2026')))issues.push({code:'PROGRAM_SOURCE_REQUIRED'});
    let assetChecksum='';
    const asset=preloaded?preloaded.assets.find(a=>a.id===row.asset_id):(await rows(env,`SELECT a.*,l.id file_id FROM assets a JOIN cloud_library l ON a.id='library-'||l.id
      WHERE a.id=? AND l.kind='image' AND l.state='complete'`,row.asset_id===null?null:String(row.asset_id)))[0];
    const binding=preloaded?preloaded.bindings.find(b=>b.version_id===row.id):(await rows(env,'SELECT * FROM asset_bindings WHERE version_id=?',String(row.id)))[0];
    if(!asset||asset.status!=='complete'||binding?.asset_id!==row.asset_id||binding?.check_version!==row.check_version||binding?.checksum!==asset.checksum)issues.push({code:'IMAGE_NOT_CURRENT'});
    else {
      try {await checked({...asset,id:asset.file_id});assetChecksum=String(asset.checksum);}catch{issues.push({code:'IMAGE_FILE_CHANGED'});}
    }
    const body=normalizedBody(String(row.body)),duplicates=all.filter(v=>v.post_id!==row.post_id&&v.stage==='caption'&&normalizedBody(String(v.body))===body).map(v=>String(v.content_key));
    if(duplicates.length)issues.push({code:'DUPLICATE_CAPTION',matches:duplicates});
    if(published.some(p=>{const caption=String(p.caption_snapshot),offset=caption.lastIndexOf('\n\n'+CAPTION_SEPARATOR+'\n\n');return normalizedBody(offset>=0?caption.slice(0,offset):caption)===body;}))issues.push({code:'DUPLICATE_PUBLISHED_CAPTION'});
    const review=preloaded?preloaded.reviews.find(r=>r.version_id===row.id&&r.check_version===row.check_version):(await rows(env,'SELECT * FROM cloud_reviews WHERE version_id=? AND check_version=?',String(row.id),Number(row.check_version)))[0];
    const current=Boolean(review&&sourcesVerified&&issues.length===0&&review.asset_checksum===assetChecksum&&review.footer_version===FOOTER_VERSION&&review.source_snapshot===JSON.stringify(snapshot));
    return {postId:row.post_id,key:row.content_key,title:row.caption_title,version:row.version,versionId:row.id,checkVersion:row.check_version,
      issues,canReview:issues.length===0,reviewed:current,review:review?{reviewer:review.reviewer,checkedAt:review.checked_at,current}:null,
      sourceSnapshot:snapshot,assetChecksum,checkedAt:new Date().toISOString(),ready:false,
      scope:'Kiểm tra cấu trúc và file; người quản lý cần đối chiếu nhận định và xem ảnh.'};
  }
  async function warehouseAudit() {
    begin();
    await readStatus(env);
    const all=await rows(env,postSQL+' ORDER BY p.content_key'),published=await rows(env,'SELECT caption_snapshot FROM publications');
    const preloaded:AuditData={
      sources:await rows(env,'SELECT s.*,r.location,r.version_id FROM sources s JOIN version_sources r ON r.source_id=s.id JOIN content_entries e ON e.active_version_id=r.version_id'),
      assets:await rows(env,"SELECT a.*,l.id file_id FROM assets a JOIN cloud_library l ON a.id='library-'||l.id WHERE l.kind='image' AND l.state='complete'"),
      bindings:await rows(env,'SELECT b.* FROM asset_bindings b JOIN content_entries e ON e.active_version_id=b.version_id'),
      reviews:await rows(env,'SELECT r.* FROM cloud_reviews r JOIN content_entries e ON e.active_version_id=r.version_id'),
    };
    const posts=[];for(const row of all)posts.push(await auditRow(row,all,published,preloaded));
    return {posts,total:posts.length,canReview:posts.filter(p=>p.canReview).length,reviewed:posts.filter(p=>p.reviewed).length,checkedAt:new Date().toISOString(),ready:false};
  }
  async function auditPost(id:string) {
    begin();
    await readStatus(env);const all=await rows(env,postSQL),row=all.find(r=>r.post_id===id);
    if(!row)throw new CatalogError('POST_NOT_FOUND',404);
    return auditRow(row,all,await rows(env,'SELECT caption_snapshot FROM publications'));
  }
  async function reviewPost(id:string,owner:OwnerSession,input:unknown) {
    await readStatus(env);
    if(!input||typeof input!=='object'||Array.isArray(input))throw new CatalogError('REVIEW_INCOMPLETE');
    const data=input as Record<string,unknown>,rubric=data.rubric as Record<string,unknown>|null;
    if(typeof data.requestId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(data.requestId)
      ||typeof data.expectedVersion!=='string'||!Number.isSafeInteger(data.expectedCheck)||!rubric||typeof rubric!=='object'||Array.isArray(rubric)
      ||!REVIEW_KEYS.every(key=>rubric[key]===true))throw new CatalogError('REVIEW_INCOMPLETE');
    const fingerprint=await checksum(new TextEncoder().encode(JSON.stringify({id,owner:owner.sub,expectedVersion:data.expectedVersion,expectedCheck:data.expectedCheck,rubric:REVIEW_KEYS.map(key=>rubric[key])})));
    const previous=(await rows(env,'SELECT * FROM cloud_review_requests WHERE request_id=?',data.requestId))[0];
    if(previous){if(previous.fingerprint!==fingerprint)throw new CatalogError('REQUEST_REUSED',409);return {reviewId:previous.review_id,replayed:true};}
    let audit=await auditPost(id);
    if(audit.versionId!==data.expectedVersion||audit.checkVersion!==data.expectedCheck)throw new CatalogError('VERSION_CONFLICT',409);
    if(audit.issues.length)throw new CatalogError(audit.issues[0]!.code);
    if(audit.review&&!audit.review.current){
      // Another review may commit between the source read and receipt read. Recheck
      // once before treating that conservative mixed read as an obsolete receipt.
      audit=await auditPost(id);
      if(audit.versionId!==data.expectedVersion||audit.checkVersion!==data.expectedCheck)throw new CatalogError('VERSION_CONFLICT',409);
      if(audit.issues.length)throw new CatalogError(audit.issues[0]!.code);
      if(audit.review&&!audit.review.current)throw new CatalogError('REVIEW_VERSION_REQUIRES_NEW_SAVE',409);
    }
    const reviewId=crypto.randomUUID(),now=new Date().toISOString();
    const body=String((await rows(env,'SELECT body FROM post_versions WHERE id=?',String(audit.versionId)))[0]!.body);
    const canonicalRubric=Object.fromEntries(REVIEW_KEYS.map(key=>[key,true]));
    if(!env.DB!.batch)throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);
    try {await env.DB!.batch([
      env.DB!.prepare(`INSERT INTO cloud_reviews(id,request_id,fingerprint,post_id,version_id,check_version,asset_checksum,footer_version,
        source_snapshot,body_snapshot,caption_snapshot,rubric_json,reviewer,checked_at)
        SELECT ?,?,?,v.post_id,v.id,v.check_version,?,?,?,?,?,?,?,? FROM post_versions v JOIN content_entries e ON e.active_version_id=v.id
        WHERE v.post_id=? AND v.id=? AND v.check_version=?
        AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
        AND NOT EXISTS(SELECT 1 FROM publish_jobs j JOIN post_versions p ON p.id=j.post_version_id WHERE p.post_id=v.post_id AND j.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))
        AND NOT EXISTS(SELECT 1 FROM sources s JOIN version_sources r ON r.source_id=s.id WHERE r.version_id=v.id AND s.status='blocked')
        AND EXISTS(SELECT 1 FROM assets a JOIN asset_bindings b ON b.asset_id=a.id WHERE b.version_id=v.id AND a.id=v.asset_id
          AND a.status='complete' AND b.check_version=v.check_version AND b.checksum=a.checksum AND a.checksum=?)
        ON CONFLICT(version_id,check_version) DO NOTHING`)
        .bind(reviewId,data.requestId,fingerprint,audit.assetChecksum,FOOTER_VERSION,JSON.stringify(audit.sourceSnapshot),
          body,composeCaption(body),JSON.stringify(canonicalRubric),owner.email,now,id,data.expectedVersion,Number(data.expectedCheck),audit.assetChecksum),
      env.DB!.prepare(`INSERT INTO cloud_review_requests(request_id,fingerprint,review_id)
        SELECT ?,?,r.id FROM cloud_reviews r JOIN content_entries e ON e.active_version_id=r.version_id
        JOIN post_versions v ON v.id=r.version_id WHERE r.post_id=? AND r.version_id=? AND r.check_version=? AND v.check_version=r.check_version
        AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
        AND NOT EXISTS(SELECT 1 FROM publish_jobs j JOIN post_versions p ON p.id=j.post_version_id WHERE p.post_id=r.post_id AND j.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))
        AND NOT EXISTS(SELECT 1 FROM sources s JOIN version_sources vs ON vs.source_id=s.id WHERE vs.version_id=v.id AND s.status='blocked')
        AND EXISTS(SELECT 1 FROM assets a JOIN asset_bindings b ON b.asset_id=a.id WHERE b.version_id=v.id AND a.id=v.asset_id
          AND a.status='complete' AND b.check_version=v.check_version AND b.checksum=a.checksum AND a.checksum=?)`)
        .bind(data.requestId,fingerprint,id,data.expectedVersion,Number(data.expectedCheck),audit.assetChecksum),
      env.DB!.prepare(`UPDATE sources SET status='verified',reviewed_at=? WHERE authority='document'
        AND id IN (SELECT source_id FROM version_sources WHERE version_id=?) AND EXISTS(SELECT 1 FROM cloud_reviews WHERE id=?)`).bind(now,data.expectedVersion,reviewId),
    ]);}catch {
      const replay=(await rows(env,'SELECT * FROM cloud_review_requests WHERE request_id=?',data.requestId))[0];
      if(replay?.fingerprint===fingerprint)return {reviewId:replay.review_id,replayed:true};
      if(replay)throw new CatalogError('REQUEST_REUSED',409);
      throw new CatalogError('VERSION_CONFLICT_OR_BUSY',409);
    }
    const recorded=(await rows(env,'SELECT * FROM cloud_review_requests WHERE request_id=?',data.requestId))[0];
    if(!recorded)throw new CatalogError('VERSION_CONFLICT_OR_BUSY',409);
    return {reviewId:recorded.review_id,replayed:recorded.review_id!==reviewId};
  }
  async function openPDF(id:string) {
    await readStatus(env);const source=registry.find(s=>s.id===id&&s.authority==='document');
    if(!source)throw new CatalogError('SOURCE_NOT_FOUND',404);
    const file=await fileFor(source);if(!file)throw new CatalogError('SOURCE_FILE_UNAVAILABLE',404);
    return downloadFile(env,String(file.id),true);
  }
  return {listSources,resolveReferences,warehouseAudit,auditPost,reviewPost,openPDF};
}
