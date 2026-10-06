// Owner-workstation administrative transfer. Never deployed or run in CI.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateBatch,batchHash} from './batch-contract.mjs';
import {parseD1Output} from './upload-private-assets.mjs';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';
import {normalizedBody} from '../src/domain/content.ts';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
import {validateFile} from '../src/cloud/storage.ts';
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
export async function importApprovedBatch(){
 if(process.env.CI||process.env.STAGING_D1_DATABASE_ID!=='83881fd7-88e6-4835-b616-6f4f8f2d25cd')throw Error('Explicit owner-workstation staging ID required');
 const read=p=>readFileSync(p),json=p=>JSON.parse(read(p));
 const batch=json('content/batch-2026-v1.json'),manifest=json('content/batch-2026-v1.manifest.json'),prior=json('content/samples/step22-approval.json'),receipt=json('content/batch/step23-approval.json');
 if(batchHash(read('content/batch-2026-v1.json'))!==receipt.batch_sha256||batchHash(read('content/batch-2026-v1.manifest.json'))!==receipt.reviewed_manifest_sha256||batchHash(read('content/samples/step22-approval.json'))!==receipt.prior_approval_sha256)throw Error('Reviewed inputs changed');
 const pack=approvedPack(batch,manifest,prior,receipt),dir=resolve('tmp/step24/import');mkdirSync(dir,{recursive:true});
 const files=pack.map(p=>{const bytes=read(p.entry.image_path);if(batchHash(bytes)!==p.approval.image_sha256||batchHash(read(`assets/batch/v1/${p.id}-360.png`))!==p.approval.proof_sha256)throw Error('Approved image changed: '+p.id);return {p,bytes,info:validateFile({kind:'image',filename:p.id+'.png',contentType:'image/png'},bytes)};});
 const cli=resolve('node_modules/wrangler/bin/wrangler.js'),config=resolve('tmp/step-14/import/config/wrangler.json');
 const cfg=json(config);if(cfg.d1_databases[0].database_id!==process.env.STAGING_D1_DATABASE_ID||cfg.name!=='nttu-publisher-staging')throw Error('Staging config mismatch');
 const invoke=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:180000,maxBuffer:16777216,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 const run=args=>{const r=invoke(args);if(r.status!==0)throw Error('Administrative operation failed; provider output suppressed: '+args.slice(0,3).join(' '));return r.stdout;};
 const query=q=>parseD1Output(run(['d1','execute','DB','--remote','--config',config,'--command',q,'--json']));
 const activeSQL='SELECT p.id,p.content_key,p.topic_group,p.pool,e.active_version_id,v.version,v.body,v.metadata_json FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id ORDER BY p.content_key;';
 const state=query("SELECT * FROM application_state WHERE environment='staging'")[0];if(state?.paused_by_user!==1||state.maintenance_owner!==null)throw Error('Staging must be paused and idle');
 const fingerprint=batchHash(JSON.stringify({batch:receipt.batch_sha256,manifest:receipt.reviewed_manifest_sha256,approval:batchHash(read('content/batch/step23-approval.json'))}));
 const imported=query(`SELECT fingerprint FROM editor_imports WHERE batch_id=${quote(BATCH_IMPORT_ID)}`)[0];
 if(imported&&imported.fingerprint!==fingerprint)throw Error('Import identity reused with different approval');
 // Private full D1 snapshot retained before any mutation. Includes operational history; never tracked.
 if(!imported)run(['d1','export','DB','--remote','--config',config,'--output',resolve(dir,'before-'+Date.now()+'.sql')]);
 const knownLibrary=query("SELECT l.*,a.status asset_status FROM cloud_library l LEFT JOIN assets a ON a.id='library-'||l.id" );
 for(const [index,{p,bytes,info}] of files.entries()){
  const sha=p.entry.image_sha256,key='private/v1/image/'+sha,path=resolve(dir,sha+'.input'),back=resolve(dir,sha+'.readback');writeFileSync(path,bytes);
  let row=knownLibrary.find(f=>f.kind==='image'&&f.checksum===sha);
  if(row&&(row.storage_key!==key||row.size_bytes!==bytes.length))throw Error('Existing asset mismatch');
  if(!row){query(`INSERT INTO cloud_library SELECT ${[randomUUID(),'image',info.filename,null,sha,key,'image/png',bytes.length,1080,1080,'pending','tranthanhtung37@gmail.com',new Date().toISOString()].map(quote).join(',')} WHERE (SELECT count(*) FROM cloud_library)<256 AND (SELECT coalesce(sum(size_bytes),0) FROM cloud_library)+${bytes.length}<=104857600 AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL) ON CONFLICT(kind,checksum) DO NOTHING;`);row=query(`SELECT * FROM cloud_library WHERE kind='image' AND checksum=${quote(sha)}`)[0];}
  if(!row)throw Error('Quota or maintenance block');
  const get=invoke(['r2','object','get','nttu-publisher-staging-assets/'+key,'--remote','--file',back]);
  if(get.status!==0){if(row.state==='complete'||!/(404|object does not exist|object not found|specified key does not exist)/i.test(get.stdout+get.stderr))throw Error('Existing R2 object cannot be verified');run(['r2','object','put','nttu-publisher-staging-assets/'+key,'--remote','--file',path,'--content-type','image/png']);run(['r2','object','get','nttu-publisher-staging-assets/'+key,'--remote','--file',back]);}
  if(batchHash(read(back))!==sha)throw Error('R2 readback mismatch');
  if(row.state!=='complete'||row.asset_status!=='complete')query(`UPDATE cloud_library SET state='complete' WHERE id=${quote(row.id)} AND state='pending'; INSERT INTO assets SELECT 'library-'||id,storage_key,checksum,content_type,width,height,size_bytes,'complete' FROM cloud_library WHERE id=${quote(row.id)} AND state='complete' ON CONFLICT(storage_key) DO NOTHING;`);
  console.log('Verified staging image '+(index+1)+'/40: '+p.id);
 }
 // Verify all bound source bytes and the three original logos before caption transfer.
 const sourceFiles=query("SELECT * FROM cloud_library WHERE state='complete' AND kind IN ('document','logo')");
 for(const f of sourceFiles){
  const path=resolve(dir,f.checksum+'.source-readback');run(['r2','object','get','nttu-publisher-staging-assets/'+f.storage_key,'--remote','--file',path]);
  if(batchHash(read(path))!==f.checksum)throw Error('Source/logo R2 integrity failure');
 }
 console.log('Verified '+sourceFiles.length+' source/logo objects from private R2.');
 if(!imported){
  const current=query(activeSQL),library=query('SELECT * FROM cloud_library;');
  const history=query("SELECT caption_snapshot caption FROM publications UNION ALL SELECT caption FROM cloud_meta_trial WHERE state='published'");
  if(pack.some(p=>history.some(h=>normalizedBody(h.caption)===normalizedBody(p.body))))throw Error('Caption already published');
  const sql=batchImportSQL(pack,current,library,fingerprint,new Date().toISOString()),path=resolve(dir,'approved-batch.sql');writeFileSync(path,sql);
  run(['d1','execute','DB','--remote','--config',config,'--file',path,'--yes','--json']);
 }
 const result=query(activeSQL);if(result.length!==40||pack.some(p=>{const row=result.find(r=>r.content_key===p.id);return row?.active_version_id!==BATCH_IMPORT_ID+':'+p.id||batchHash(row.body)!==p.approval.body_sha256;}))throw Error('Import readback mismatch');
 const checks=query("SELECT (SELECT count(*) FROM cloud_reviews r JOIN content_entries e ON e.active_version_id=r.version_id JOIN post_versions v ON v.id=r.version_id WHERE r.check_version=v.check_version) reviews,(SELECT count(*) FROM publications) publications,(SELECT count(*) FROM publish_jobs) jobs,(SELECT paused_by_user FROM application_state WHERE environment='staging') paused,(SELECT count(*) FROM post_versions WHERE status='ready') ready; PRAGMA foreign_key_check;");
 if(checks.length!==1||checks[0].reviews!==40||checks[0].paused!==1||checks[0].ready!==0)throw Error('Cloud approval/readiness integrity failure');
 writeFileSync(resolve(dir,'evidence.json'),JSON.stringify({checked_at:new Date().toISOString(),batch_id:BATCH_IMPORT_ID,fingerprint,posts:40,images_readback:40,...checks[0],replayed:Boolean(imported)},null,2)+'\n');
 console.log('Staging warehouse imported and verified: 40 posts, 40 bound owner reviews; no scheduling or publication.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await importApprovedBatch();
