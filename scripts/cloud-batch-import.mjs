// Shared approval validation and offline SQL fixtures. No staging transfer command.
import {validateBatch,batchHash} from './batch-contract.mjs';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';
import {normalizedBody} from '../src/domain/content.ts';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
export const BATCH_IMPORT_ID='owner-approved-batch-2026-v1';
export const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function approvedPack(batch,manifest,prior,receipt){
 validateBatch(batch,prior);
 if(receipt.scope!=='content_and_design_only'||receipt.authority!=='owner_message_in_current_conversation'||receipt.batch_version!==batch.version||receipt.samples?.length!==37||receipt.publication_authorized!==false||receipt.daily_schedule_authorized!==false||receipt.cloud_readiness_granted!==false)throw Error('Approval scope invalid');
 const records=[...prior.samples,...receipt.samples];
 if(new Set(records.map(r=>r.id)).size!==40||manifest.posts.length!==40)throw Error('Approval coverage invalid');
 return batch.posts.map(p=>{
  const approval=records.find(r=>r.id===p.id),entry=manifest.posts.find(r=>r.id===p.id);
  if(!entry||!approval||approval.content_approved!==true||approval.design_approved!==true||approval.body_sha256!==batchHash(p.body)||approval.caption_sha256!==batchHash(composeCaption(p.body))||entry.body_sha256!==approval.body_sha256||entry.caption_sha256!==approval.caption_sha256||entry.image_sha256!==approval.image_sha256||entry.proof_sha256!==approval.proof_sha256)throw Error('Approved content changed: '+p.id);
  return {...p,entry,approval,approvalStep:prior.samples.some(r=>r.id===p.id)?22:23};
 });
}
export function batchImportSQL(pack,current,library,fingerprint,now){
 if(pack.length!==40||current.length!==40||new Set(current.map(r=>r.content_key)).size!==40)throw Error('Cloud warehouse must contain exactly 40 identities');
 const match=pack.map(p=>{
  const old=current.find(r=>r.content_key===p.id),file=library.find(f=>f.kind==='image'&&f.state==='complete'&&f.checksum===p.entry.image_sha256);
  if(!old||old.topic_group!==p.group||old.pool!==(p.pool==='main'?'scheduled':'reserve')||!file||file.width!==1080||file.height!==1080)throw Error('Cloud identity or image unavailable: '+p.id);
  const refs=p.source_refs.map(r=>{const s=SOURCE_REGISTRY.find(s=>s.id===r.id);if(!s||s.authority==='document'&&!library.some(f=>f.source_key===r.id&&f.checksum===s.sha256&&f.state==='complete'))throw Error('Cloud source unavailable: '+r.id);return {...r,title:s.name,revision:s.sha256,authority:s.authority};});
  return {p,old,file,refs};
 });
 const guard=["EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)","NOT EXISTS(SELECT 1 FROM publish_jobs WHERE state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))","NOT EXISTS(SELECT 1 FROM sources s JOIN version_sources r ON r.source_id=s.id JOIN content_entries e ON e.active_version_id=r.version_id WHERE s.status='blocked')",'(SELECT count(*) FROM content_entries)=40',...match.flatMap(({old,file,p})=>[`EXISTS(SELECT 1 FROM content_entries WHERE post_id=${quote(old.id)} AND active_version_id=${quote(old.active_version_id)})`,`EXISTS(SELECT 1 FROM assets WHERE id=${quote('library-'+file.id)} AND status='complete' AND checksum=${quote(p.entry.image_sha256)})`])].join(' AND ');
 // NOT NULL failure aborts the atomic D1 file import if any parent changed.
 const sql=[`INSERT INTO editor_imports(batch_id,fingerprint) VALUES(${quote(BATCH_IMPORT_ID)},CASE WHEN ${guard} THEN ${quote(fingerprint)} ELSE NULL END);`];
 for(const {p,old,file,refs} of match){
  const id=BATCH_IMPORT_ID+':'+p.id,asset='library-'+file.id;
  const meta={isBrief:false,concept:p.title,angle:p.reader_outcome,sourceNote:p.source_refs.map(r=>`${r.id}: trang ${r.pages.join(', ')||'đính chính owner'}; ${r.supports}`).join('\n'),sourceRefs:p.source_refs,externalRefs:p.external_refs??[],ownerApproval:{step:p.approvalStep,bodyChecksum:p.approval.body_sha256,captionChecksum:p.approval.caption_sha256,imageChecksum:p.approval.image_sha256,scope:'content_and_design_only'},batchArtwork:{renderer:'batch-square-v1',spec:p.image,checksum:p.entry.image_sha256},readerOutcome:p.reader_outcome};
  sql.push(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_points,image_description,primary_audience,metadata_json,status,asset_id) VALUES(${[id,old.id,old.version+1,p.body,p.title,p.image.headline,JSON.stringify(p.image.cards),p.image.takeaway,p.audience==='SV'?'student':'prospective_student',JSON.stringify(meta),'needs_review',asset].map(quote).join(',')});`);
  for(const [i,r] of refs.entries()){
   const sourceId=id+':source:'+i,location={id:r.id,pages:r.pages,section:r.section,supports:r.supports,adaptation:r.adaptation};
   sql.push(`INSERT INTO sources VALUES(${[sourceId,r.title,r.revision,r.section,r.authority,'verified',now,null].map(quote).join(',')});`,`INSERT INTO version_sources VALUES(${[id,sourceId,JSON.stringify(location)].map(quote).join(',')});`);
  }
  sql.push(`INSERT INTO version_facts SELECT ${quote(id)},fact_id FROM version_facts WHERE version_id=${quote(old.active_version_id)};`,
   `INSERT INTO editor_revisions VALUES(${[id,old.active_version_id,null,'import','tranthanhtung37@gmail.com',now].map(quote).join(',')});`,
   `DELETE FROM cloud_caption_keys WHERE post_id=${quote(old.id)};`,
   `INSERT INTO cloud_caption_keys VALUES(${[batchHash(normalizedBody(p.body)),old.id,id].map(quote).join(',')});`,
   `UPDATE content_entries SET active_version_id=${quote(id)},stage='caption',concept=${quote(p.title)},angle=${quote(p.reader_outcome)} WHERE post_id=${quote(old.id)};`,
   `INSERT INTO asset_bindings SELECT id,asset_id,check_version,${quote(p.entry.image_sha256)} FROM post_versions WHERE id=${quote(id)};`);
  const reviewId=id+':review',requestId=id+':approval',reviewFingerprint=batchHash(JSON.stringify(p.approval)),rubric={accuracy:true,usefulness:true,clarity:true,originality:true,visual_quality:true};
  sql.push(`INSERT INTO cloud_reviews SELECT ${[reviewId,requestId,reviewFingerprint,old.id,id].map(quote).join(',')},check_version,${[p.entry.image_sha256,FOOTER_VERSION,JSON.stringify(refs),p.body,composeCaption(p.body),JSON.stringify(rubric),'tranthanhtung37@gmail.com',now].map(quote).join(',')} FROM post_versions WHERE id=${quote(id)};`,
   `INSERT INTO cloud_review_requests VALUES(${[requestId,reviewFingerprint,reviewId].map(quote).join(',')});`);
 }
 return sql.join('\n');
}
