import type { TransactionDatabase } from './claims.ts';
import { composeCaption, FOOTER_VERSION } from '../domain/footer.ts';
import { editorFail, validateEditorDraft } from '../domain/editor.ts';
import type { EditorDraft } from '../domain/editor.ts';

type Version = {id:string;post_id:string;version:number;body:string;caption_title:string;primary_audience:string;metadata_json:string;check_version:number;asset_id:string|null;status:string};
type SourceInput = {id:string;pages:number[];section:string;supports:string;adaptation:string;title:string;revision:string;authority:string};
type Save = {postId:string;expectedVersion:string;versionId:string;requestId:string;fingerprint:string;now:string;actor:string;draft:EditorDraft;restoreFrom?:string;sourceRecords?:SourceInput[]};
type Source = {id:string;title:string;revision:string;locator:string;authority:string;status:string;reviewed_at:string|null;review_due_at:string|null;location:string};
function one<T>(db:TransactionDatabase,sql:string,...args:(string|number|null)[]):T|undefined{return db.all<T>(sql,...args)[0];}
function time(now:string){if(!Number.isFinite(Date.parse(now))||new Date(now).toISOString()!==now)editorFail('INVALID_EDITOR_TIME');}
function writable(db:TransactionDatabase,postId:string,expectedVersion:string):Version{
  if(db.all('SELECT environment FROM application_state WHERE maintenance_owner IS NOT NULL').length)editorFail('EDITOR_MAINTENANCE');
  if(db.all(`SELECT j.id FROM publish_jobs j JOIN post_versions v ON v.id=j.post_version_id
    WHERE v.post_id=? AND j.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown')`,postId).length)editorFail('EDITOR_POST_BUSY');
  const active=one<Version>(db,'SELECT v.* FROM content_entries e JOIN post_versions v ON v.id=e.active_version_id WHERE e.post_id=?',postId);
  if(!active)editorFail('EDITOR_POST_NOT_FOUND');
  if(active.id!==expectedVersion)editorFail('EDITOR_CONFLICT');
  return active;
}

export function saveEditorRevision(db:TransactionDatabase,input:Save):string{
  time(input.now);
  const draft=validateEditorDraft(input.draft);
  return db.immediate(()=>{
    const previous=one<{fingerprint:string;result_version_id:string}>(db,'SELECT * FROM editor_requests WHERE request_id=?',input.requestId);
    if(previous){if(previous.fingerprint!==input.fingerprint)editorFail('EDITOR_REQUEST_REUSED');return previous.result_version_id;}
    const active=writable(db,input.postId,input.expectedVersion);
    const parent=input.restoreFrom?one<Version>(db,'SELECT * FROM post_versions WHERE id=? AND post_id=?',input.restoreFrom,input.postId):active;
    if(!parent)editorFail('EDITOR_VERSION_NOT_FOUND');
    const metadata=JSON.parse(parent.metadata_json) as Record<string,unknown>;
    const next=one<{n:number}>(db,'SELECT MAX(version)+1 n FROM post_versions WHERE post_id=?',input.postId)!.n;
    const nextMetadata:Record<string,unknown>={...metadata,isBrief:false,editor:true,image:draft.image,sourceNote:draft.sourceNote};
    if(input.sourceRecords!==undefined)nextMetadata.sourceRefs=input.sourceRecords.map(({id,pages,section,supports,adaptation})=>({id,pages,section,supports,adaptation}));
    db.run(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_points,image_description,primary_audience,metadata_json,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'needs_review')`,input.versionId,input.postId,next,draft.body,draft.title,draft.image.headline,JSON.stringify(draft.image.cards),draft.image.subline,parent.primary_audience,JSON.stringify(nextMetadata));
    const sources=input.sourceRecords===undefined?db.all<Source>(`SELECT s.*,r.location FROM version_sources r JOIN sources s ON s.id=r.source_id WHERE r.version_id=?`,parent.id):input.sourceRecords.map(ref=>({id:ref.id,title:ref.title,revision:ref.revision,locator:ref.section,authority:ref.authority,status:ref.authority==='user_confirmation'?'verified':'pending',reviewed_at:ref.authority==='user_confirmation'?input.now:null,review_due_at:null,location:JSON.stringify({id:ref.id,pages:ref.pages,section:ref.section,supports:ref.supports,adaptation:ref.adaptation})}));
    for(const [index,source] of sources.entries()){
      const id=`${input.versionId}:source:${index}`;
      // Copy reference provenance, but a document review belongs to its old caption.
      const owner=source.authority==='user_confirmation';
      db.run('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)',id,source.title,source.revision,source.locator,source.authority,owner?source.status:'pending',owner?source.reviewed_at:null,source.review_due_at);
      db.run('INSERT INTO version_sources VALUES (?,?,?)',input.versionId,id,source.location);
    }
    for(const fact of db.all<{fact_id:string}>('SELECT fact_id FROM version_facts WHERE version_id=?',parent.id))db.run('INSERT INTO version_facts VALUES (?,?)',input.versionId,fact.fact_id);
    db.run('INSERT INTO editor_revisions VALUES (?,?,?,?,?,?)',input.versionId,active.id,input.restoreFrom??null,input.restoreFrom?'restore':'save',input.actor,input.now);
    if(db.run("UPDATE content_entries SET active_version_id=?,stage='caption' WHERE post_id=? AND active_version_id=?",input.versionId,input.postId,active.id)!==1)editorFail('EDITOR_CONFLICT');
    db.run('INSERT INTO editor_requests VALUES (?,?,?)',input.requestId,input.fingerprint,input.versionId);
    return input.versionId;
  });
}

export interface RenderAttachment {postId:string;expectedVersion:string;expectedCheck:number;assetId:string;storageKey:string;checksum:string;size:number;inputJson:string;inputChecksum:string;dependencyJson:string;now:string}
export function attachEditorRender(db:TransactionDatabase,input:RenderAttachment):string{
  time(input.now);
  if(!input.checksum||input.size<=0||input.size>5242880)editorFail('EDITOR_INVALID_ASSET');
  return db.immediate(()=>{
    const version=writable(db,input.postId,input.expectedVersion);
    if(version.check_version!==input.expectedCheck)editorFail('EDITOR_CONFLICT');
    if(version.asset_id)editorFail('EDITOR_IMAGE_ALREADY_ATTACHED');
    db.run("INSERT INTO assets VALUES (?,?,?,'image/png',1080,1080,?,'complete')",input.assetId,input.storageKey,input.checksum,input.size);
    db.run('UPDATE post_versions SET asset_id=? WHERE id=?',input.assetId,version.id);
    const updated=one<Version>(db,'SELECT * FROM post_versions WHERE id=?',version.id)!;
    db.run('INSERT INTO asset_bindings VALUES (?,?,?,?)',version.id,input.assetId,updated.check_version,input.checksum);
    db.run('INSERT INTO editor_render_receipts VALUES (?,?,?,?,?,?)',input.assetId,version.id,input.inputJson,input.inputChecksum,input.dependencyJson,input.now);
    return input.assetId;
  });
}

export function recordEditorReview(db:TransactionDatabase,input:{postId:string;expectedVersion:string;expectedCheck:number;checksum:string;now:string;reviewer:string;rubric:unknown;reviewId:string}):string{
  time(input.now);
  if(!input.rubric||typeof input.rubric!=='object'||Array.isArray(input.rubric))editorFail('EDITOR_REVIEW_INCOMPLETE');
  const rubric=input.rubric as Record<string,unknown>;
  if(!['accuracy','usefulness','clarity','originality','visual_quality'].every(key=>rubric[key]===true))editorFail('EDITOR_REVIEW_INCOMPLETE');
  return db.immediate(()=>{
    const version=writable(db,input.postId,input.expectedVersion);
    if(version.check_version!==input.expectedCheck)editorFail('EDITOR_CONFLICT');
    const meta=JSON.parse(version.metadata_json) as {sourceNote?:string};
    if(!meta.sourceNote?.trim())editorFail('EDITOR_SOURCE_NOTE_REQUIRED');
    const asset=one<{checksum:string;status:string}>(db,'SELECT checksum,status FROM assets WHERE id=?',version.asset_id);
    const binding=one<{checksum:string;check_version:number;asset_id:string}>(db,'SELECT * FROM asset_bindings WHERE version_id=?',version.id);
    if(!asset||asset.status!=='complete'||asset.checksum!==input.checksum||binding?.checksum!==asset.checksum||binding.check_version!==version.check_version||binding.asset_id!==version.asset_id)editorFail('EDITOR_IMAGE_NOT_CURRENT');
    const existing=one<{id:string;footer_version:string}>(db,'SELECT id,footer_version FROM editor_reviews WHERE version_id=? AND check_version=?',version.id,version.check_version);
    if(existing){if(existing.footer_version!==FOOTER_VERSION)editorFail('EDITOR_REVIEW_FORMAT_CHANGED');return existing.id;}
    if(!db.all('SELECT source_id FROM version_sources WHERE version_id=?',version.id).length)editorFail('EDITOR_SOURCE_REQUIRED');
    db.run(`UPDATE sources SET status='verified',reviewed_at=? WHERE id IN (SELECT source_id FROM version_sources WHERE version_id=?) AND authority='document'`,input.now,version.id);
    db.run(`INSERT INTO content_checks VALUES (?,?,?,?,?,?,?,1,1,1,1,1,1)`,input.reviewId,version.id,version.check_version,asset.checksum,FOOTER_VERSION,input.reviewer,input.now);
    db.run('INSERT INTO editor_reviews VALUES (?,?,?,?,?,?,?,?,?,?,?)',input.reviewId,version.id,version.check_version,version.body,composeCaption(version.body),asset.checksum,FOOTER_VERSION,meta.sourceNote,JSON.stringify(rubric),input.reviewer,input.now);
    // A local review is not authority to activate production publishing or readiness.
    db.run("UPDATE post_versions SET status='needs_review' WHERE id=?",version.id);
    return input.reviewId;
  });
}
