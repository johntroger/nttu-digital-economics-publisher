// Owner-workstation only. Import approved local bytes, never staging operational data.
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {approvedPack,quote} from './cloud-batch-import.mjs';
import {batchHash} from './batch-contract.mjs';
import {parseD1Output} from './upload-private-assets.mjs';
import {createSourceLibrary} from './source-library.mjs';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
import {validateFile} from '../src/cloud/storage.ts';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';
import {normalizedBody} from '../src/domain/content.ts';
export const PRODUCTION_IMPORT_ID='production-approved-batch-2026-v1';
export const PRODUCTION_DB='09cdecc7-36a2-4196-950e-ef68b1ecd834';
export function importConfig(config){
 if(config.name!=='nttu-publisher-production'||config.vars?.APP_ENV!=='production'||config.vars?.INTEGRATION_MODE!=='management'
 ||config.vars?.DAILY_PUBLISHING_ENABLED!=='false'||config.vars?.PRODUCTION_DATABASE_ID!==PRODUCTION_DB
 ||config.d1_databases?.length!==1||config.d1_databases[0].database_id!==PRODUCTION_DB||config.d1_databases[0].database_name!=='nttu-publisher-production'
 ||config.r2_buckets?.length!==1||config.r2_buckets[0].bucket_name!=='nttu-publisher-production-assets'
 ||config.triggers?.crons?.length!==0)throw Error('Production import boundary invalid');
}
export const importGuard=`EXISTS(SELECT 1 FROM production_identity WHERE id=1 AND environment='production' AND database_id='${PRODUCTION_DB}' AND schema_version=1)
 AND (SELECT count(*) FROM schema_migrations) IN (10,11,12,13) AND (SELECT count(*) FROM application_state)=1
 AND EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL)
 AND EXISTS(SELECT 1 FROM production_control WHERE id=1 AND enabled=0 AND page_id IS NULL AND connection_verified=0)
 AND NOT EXISTS(SELECT 1 FROM page_connections) AND NOT EXISTS(SELECT 1 FROM publish_jobs)
 AND NOT EXISTS(SELECT 1 FROM publications) AND NOT EXISTS(SELECT 1 FROM schedule_slots) AND NOT EXISTS(SELECT 1 FROM notification_outbox)`;
export async function warehouseInputs(){
 const read=p=>readFileSync(p),json=p=>JSON.parse(read(p));
 const batch=json('content/batch-2026-v1.json'),manifest=json('content/batch-2026-v1.manifest.json'),prior=json('content/samples/step22-approval.json'),approval=json('content/batch/step23-approval.json');
 if(batchHash(read('content/batch-2026-v1.json'))!==approval.batch_sha256||batchHash(read('content/batch-2026-v1.manifest.json'))!==approval.reviewed_manifest_sha256||batchHash(read('content/samples/step22-approval.json'))!==approval.prior_approval_sha256)throw Error('Approved input bytes changed');
 const pack=approvedPack(batch,manifest,prior,approval),files=[],root=realpathSync('assets');
 const asset=p=>{const path=realpathSync(p),rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Asset path escaped');return read(path);};
 const sourceLibrary=createSourceLibrary();
 for(const s of sourceLibrary.list().filter(x=>x.pdfUrl)){
  const def=SOURCE_REGISTRY.find(x=>x.id===s.id),bytes=sourceLibrary.pdf(s.id);
  if(!s.available||!def||batchHash(bytes)!==def.sha256)throw Error('Source changed: '+s.id);
  files.push({metadata:{kind:'document',filename:s.name,sourceKey:s.id,contentType:'application/pdf'},bytes});
 }
 for(const logo of json('content/samples-2026-v1.manifest.json').renderInputs.logos){
  if(!['nttu.png','fba.png','digital-economics.jpg'].includes(logo.file))throw Error('Unexpected logo');
  const bytes=asset('assets/brand/originals/'+logo.file);if(batchHash(bytes)!==logo.sha256)throw Error('Logo changed');
  files.push({metadata:{kind:'logo',filename:logo.file,contentType:logo.file.endsWith('.jpg')?'image/jpeg':'image/png'},bytes});
 }
 for(const p of pack){
  const bytes=asset(p.entry.image_path);if(batchHash(bytes)!==p.approval.image_sha256||batchHash(asset(`assets/batch/v1/${p.id}-360.png`))!==p.approval.proof_sha256)throw Error('Image approval changed: '+p.id);
  sourceLibrary.resolveRefs(p.source_refs);
  files.push({metadata:{kind:'image',filename:p.id+'.png',contentType:'image/png'},bytes});
 }
 if(files.length!==56)throw Error('Expected 13 PDFs, 3 logos and 40 images');
 const checked=await Promise.all(files.map(async f=>({...f,info:validateFile(f.metadata,f.bytes),sha:batchHash(f.bytes)})));
 if(new Set(checked.map(x=>x.info.kind+':'+x.sha)).size!==56||checked.reduce((n,x)=>n+x.bytes.length,0)>104857600)throw Error('Duplicate files or quota exceeded');
 const fingerprint=batchHash(JSON.stringify({batch:approval.batch_sha256,manifest:approval.reviewed_manifest_sha256,prior:approval.prior_approval_sha256,approval:batchHash(read('content/batch/step23-approval.json')),files:checked.map(x=>({kind:x.info.kind,sha:x.sha}))}));
 return {pack,files:checked,fingerprint};
}
export function productionWarehouseStatements(pack,library,fingerprint,now){
 if(pack.length!==40||new Set(pack.map(p=>p.id)).size!==40||!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('Invalid approved warehouse');
 const matches=pack.map(p=>{
  const f=library.find(x=>x.kind==='image'&&x.state==='complete'&&x.checksum===p.entry.image_sha256);
  if(!f||f.width!==1080||f.height!==1080)throw Error('Verified image missing: '+p.id);
  const refs=p.source_refs.map(r=>{const s=SOURCE_REGISTRY.find(x=>x.id===r.id);if(!s||s.authority==='document'&&!library.some(x=>x.kind==='document'&&x.state==='complete'&&x.source_key===s.id&&x.checksum===s.sha256))throw Error('Verified source missing: '+r.id);return {...r,title:s.name,revision:s.sha256,authority:s.authority};});return {p,f,refs};
 });
 const assets=matches.map(({f})=>`EXISTS(SELECT 1 FROM assets WHERE id=${quote('library-'+f.id)} AND checksum=${quote(f.checksum)} AND status='complete')`);
 const sql=[`INSERT INTO editor_imports VALUES(${quote(PRODUCTION_IMPORT_ID)},CASE WHEN ${importGuard} AND NOT EXISTS(SELECT 1 FROM posts) AND ${assets.join(' AND ')} THEN ${quote(fingerprint)} ELSE NULL END);`];
 for(const [order,{p,f,refs}] of matches.entries()){
  const post=PRODUCTION_IMPORT_ID+':'+p.id,version=post+':v1',asset='library-'+f.id;
  const meta={isBrief:false,concept:p.title,angle:p.reader_outcome,readerOutcome:p.reader_outcome,sourceRefs:p.source_refs,externalRefs:p.external_refs??[],
   ownerApproval:{step:p.approvalStep,scope:'content_and_design_only',bodyChecksum:p.approval.body_sha256,captionChecksum:p.approval.caption_sha256,imageChecksum:p.approval.image_sha256,proofChecksum:p.approval.proof_sha256},
   transfer:{step:33,environment:'production',fingerprint},batchArtwork:{renderer:'batch-square-v1',spec:p.image,checksum:p.entry.image_sha256}};
  sql.push(`INSERT INTO posts VALUES(${[post,PRODUCTION_IMPORT_ID,p.id,p.group,p.pool==='main'?'scheduled':'reserve',now].map(quote).join(',')});`,
   `INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_points,image_description,primary_audience,metadata_json,asset_id,status) VALUES(${[version,post,1,p.body,p.title,p.image.headline,JSON.stringify(p.image.cards),p.image.takeaway,p.audience==='SV'?'student':'prospective_student',JSON.stringify(meta),asset,'needs_review'].map(quote).join(',')});`,
   `INSERT INTO content_entries VALUES(${[post,version,p.title,p.reader_outcome,order,'caption'].map(quote).join(',')});`);
  for(const [i,r] of refs.entries()){
   const id=version+':source:'+i;
   sql.push(`INSERT INTO sources VALUES(${[id,r.title,r.revision,r.section,r.authority,'verified',now,null].map(quote).join(',')});`,
    `INSERT INTO version_sources VALUES(${[version,id,JSON.stringify({id:r.id,pages:r.pages,section:r.section,supports:r.supports,adaptation:r.adaptation})].map(quote).join(',')});`);
  }
  if(p.group==='I'){
   const ownerIndex=refs.findIndex(r=>r.id==='OWNER-2026');if(ownerIndex<0)throw Error('Program owner confirmation missing');
   for(const [key,value] of [['training_duration_years',3.5],['cohort',2026]]){
    const fact=version+':fact:'+key;
    sql.push(`INSERT INTO facts VALUES(${[fact,version+':source:'+ownerIndex,key,JSON.stringify(value),2026,'verified',null].map(quote).join(',')});`,
     `INSERT INTO version_facts VALUES(${[version,fact].map(quote).join(',')});`);
   }
  }
  sql.push(`INSERT INTO cloud_caption_keys VALUES(${[batchHash(normalizedBody(p.body)),post,version].map(quote).join(',')});`,
   `INSERT INTO editor_revisions VALUES(${[version,null,null,'import','tranthanhtung37@gmail.com',now].map(quote).join(',')});`,
   `INSERT INTO asset_bindings SELECT id,asset_id,check_version,${quote(f.checksum)} FROM post_versions WHERE id=${quote(version)};`);
  const review=version+':review',request=version+':approval',hash=batchHash(JSON.stringify(p.approval));
  sql.push(`INSERT INTO cloud_reviews SELECT ${[review,request,hash,post,version].map(quote).join(',')},check_version,${[f.checksum,FOOTER_VERSION,JSON.stringify(refs),p.body,composeCaption(p.body),JSON.stringify({accuracy:true,usefulness:true,clarity:true,originality:true,visual_quality:true}),'tranthanhtung37@gmail.com',now].map(quote).join(',')} FROM post_versions WHERE id=${quote(version)};`,
   `INSERT INTO cloud_review_requests VALUES(${[request,hash,review].map(quote).join(',')});`);
 }
 sql.push(`INSERT INTO content_imports VALUES(${[PRODUCTION_IMPORT_ID,fingerprint,now].map(quote).join(',')});`);return sql;
}
export const productionWarehouseSQL=(...args)=>productionWarehouseStatements(...args).join('\n');
export function verifyWarehouse(pack,rows,reviews){
 if(rows.length!==40||reviews.length!==40)throw Error('Incomplete production warehouse');
 for(const p of pack){const row=rows.find(x=>x.content_key===p.id),r=reviews.find(x=>x.post_id===row?.id);
  if(!row||row.active_version_id!==PRODUCTION_IMPORT_ID+':'+p.id+':v1'||row.body!==p.body||row.caption_title!==p.title||row.topic_group!==p.group||row.pool!==(p.pool==='main'?'scheduled':'reserve')
   ||row.status!=='needs_review'||row.primary_audience!==(p.audience==='SV'?'student':'prospective_student')||!r||r.check_version!==row.check_version||r.body_snapshot!==p.body||r.caption_snapshot!==composeCaption(p.body)||r.asset_checksum!==p.approval.image_sha256
   ||JSON.stringify(JSON.parse(r.source_snapshot).map(x=>({id:x.id,pages:x.pages,section:x.section,supports:x.supports,adaptation:x.adaptation})))!==JSON.stringify(p.source_refs))throw Error('Warehouse readback changed: '+p.id);
 }
}
export async function importProductionWarehouse(){
 if(process.env.CI||process.env.PRODUCTION_D1_DATABASE_ID!==PRODUCTION_DB)throw Error('Explicit owner-workstation production ID required');
 const config=resolve('tmp/production-management/wrangler.json');importConfig(JSON.parse(readFileSync(config)));
 const {pack,files,fingerprint}=await warehouseInputs(),dir=resolve('tmp/step33');mkdirSync(dir,{recursive:true});
 const cli=resolve('node_modules/wrangler/bin/wrangler.js'),invoke=args=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:180000,maxBuffer:16777216,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 const run=args=>{const r=invoke(args);if(r.status!==0)throw Error('Administrative operation failed; provider output suppressed: '+args.slice(0,3).join(' '));return r.stdout;};
 const query=q=>parseD1Output(run(['d1','execute','DB','--remote','--config',config,'--command',q,'--json']));
 const guard=()=>{if(query(`SELECT 1 ok WHERE ${importGuard}`)[0]?.ok!==1)throw Error('Production must be isolated, paused and unconnected');};guard();
 const imported=query(`SELECT fingerprint FROM editor_imports WHERE batch_id=${quote(PRODUCTION_IMPORT_ID)}`)[0];
 if(imported&&imported.fingerprint!==fingerprint)throw Error('Import identity changed');
 if(!imported){if(query('SELECT count(*) n FROM posts')[0]?.n!==0)throw Error('Unexpected existing warehouse');run(['d1','export','DB','--remote','--config',config,'--output',resolve(dir,'before-'+Date.now()+'.sql')]);}
 const known=query('SELECT * FROM cloud_library;');if(known.some(x=>!files.some(f=>f.sha===x.checksum&&f.info.kind===x.kind)))throw Error('Unexpected library objects');
 for(const [index,f] of files.entries()){
  guard();const {info,bytes,sha}=f,key='private/v1/'+info.kind+'/'+sha,id='production-'+info.kind+'-'+sha,back=resolve(dir,sha+'.readback'),path=resolve(dir,sha+'.input');writeFileSync(path,bytes);
  let row=query(`SELECT * FROM cloud_library WHERE kind=${quote(info.kind)} AND checksum=${quote(sha)}`)[0];
  if(row&&(row.id!==id||row.storage_key!==key||row.size_bytes!==bytes.length||row.source_key!==info.sourceKey))throw Error('Metadata conflict');
  if(!row){query(`INSERT INTO cloud_library SELECT ${[id,info.kind,info.filename,info.sourceKey,sha,key,info.contentType,bytes.length,info.width,info.height,'pending','tranthanhtung37@gmail.com',new Date().toISOString()].map(quote).join(',')} WHERE ${importGuard} AND (SELECT count(*) FROM cloud_library)<256 AND (SELECT coalesce(sum(size_bytes),0) FROM cloud_library)+${bytes.length}<=104857600;`);row=query(`SELECT * FROM cloud_library WHERE id=${quote(id)}`)[0];if(!row)throw Error('Library reservation failed');}
  const got=invoke(['r2','object','get','nttu-publisher-production-assets/'+key,'--remote','--file',back]);
  if(got.status!==0){if(row.state==='complete'||!/(404|object does not exist|object not found|specified key does not exist)/i.test(got.stdout+got.stderr))throw Error('R2 cannot be verified');run(['r2','object','put','nttu-publisher-production-assets/'+key,'--remote','--file',path,'--content-type',info.contentType]);run(['r2','object','get','nttu-publisher-production-assets/'+key,'--remote','--file',back]);}
  if(batchHash(readFileSync(back))!==sha)throw Error('R2 checksum mismatch');
  query(`UPDATE cloud_library SET state='complete' WHERE id=${quote(id)} AND state='pending' AND ${importGuard};
   INSERT INTO assets SELECT 'library-'||id,storage_key,checksum,content_type,width,height,size_bytes,'complete' FROM cloud_library WHERE id=${quote(id)} AND kind='image' AND state='complete' AND ${importGuard} ON CONFLICT(storage_key) DO NOTHING;`);
  console.log('Verified production file '+(index+1)+'/56: '+info.filename);
 }
 guard();if(!imported){const sql=productionWarehouseSQL(pack,query('SELECT * FROM cloud_library'),fingerprint,new Date().toISOString()),path=resolve(dir,'warehouse.sql');writeFileSync(path,sql);run(['d1','execute','DB','--remote','--config',config,'--file',path,'--yes','--json']);}
 const rows=query('SELECT p.*,e.active_version_id,v.body,v.caption_title,v.status,v.primary_audience,v.check_version FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id');
 verifyWarehouse(pack,rows,query('SELECT * FROM cloud_reviews'));guard();
 if(query('PRAGMA foreign_key_check').length||query("SELECT count(*) n FROM cloud_library WHERE state='complete'")[0]?.n!==56)throw Error('Final integrity check failed');
 writeFileSync(resolve(dir,'evidence.json'),JSON.stringify({checkedAt:new Date().toISOString(),fingerprint,posts:40,main:30,reserve:10,filesReadback:56,reviews:40,replayed:Boolean(imported),publishingEnabled:false,schedules:0,publications:0},null,2));
 console.log('Production warehouse verified; no publishing or scheduling enabled.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--check')){const x=await warehouseInputs();console.log(JSON.stringify({posts:x.pack.length,files:x.files.length,bytes:x.files.reduce((n,f)=>n+f.bytes.length,0),fingerprint:x.fingerprint}));}else await importProductionWarehouse();}
