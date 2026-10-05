import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openCatalog,importBriefs,reader} from './catalog-store.mjs';
import {transactionStore} from './transaction-store.mjs';
import {loadSamplePreviews} from './sample-previews.mjs';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';
import {EditorError,validateEditorDraft} from '../src/domain/editor.ts';
import {createSourceLibrary} from './source-library.mjs';
import {normalizedBody} from '../src/domain/content.ts';
import {saveEditorRevision,attachEditorRender,recordEditorReview} from '../src/storage/editor.ts';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const digest=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(join(ROOT,path));
const uuid=prefix=>prefix+'-'+randomUUID();
const now=()=>new Date().toISOString();
const runFile=promisify(execFile);
const safeKey=key=>/^(P(0[1-9]|[12][0-9]|30)|R(0[1-9]|10))$/.test(key);
const fail=code=>{throw new EditorError(code);};

function localPath(path){
  const target=resolve(ROOT,path),rel=relative(join(ROOT,'tmp'),target);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('EDITOR_PATH_OUTSIDE_LOCAL_TMP');
  return target;
}
function validPng(buffer){
  return buffer.length>24&&buffer.length<=5242880&&buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a'
    &&buffer.readUInt32BE(16)===1080&&buffer.readUInt32BE(20)===1080;
}
function dependencies(resourceRoot=ROOT){
  const read=path=>readFileSync(join(resourceRoot,path));
  return {renderer:digest(read('scripts/render-samples.py')),
    logos:Object.fromEntries(['nttu.png','fba.png','digital-economics.jpg'].map(n=>[n,digest(read('assets/brand/originals/'+n))])),
    fonts:Object.fromEntries(['BricolageGrotesque-Bold.ttf','WorkSans-Bold.ttf','WorkSans-Regular.ttf'].map(n=>[n,digest(read('assets/fonts/'+n))]))};
}
function defaultImage(){return {template:'scene',scene:'portfolio',mode:'illustration',headline:'Chủ đề mới\nChỉnh tiêu đề ảnh',subline:'Chỉnh thông điệp theo nội dung bài.',accent:'#0056A6',ink:'#123453',paper:'#EEF5FB',cards:[],takeaway:'Chỉnh câu nhắc nhớ của bài.'};}

export function createEditorService({database='tmp/step-08/warehouse.sqlite',assetsRoot='tmp/step-08/assets',resourcesRoot=null}={}){
  const databasePath=database===':memory:'?database:localPath(database),assetDirectory=localPath(assetsRoot);
  mkdirSync(assetDirectory,{recursive:true});
  if(databasePath!==':memory:')mkdirSync(resolve(databasePath,'..'),{recursive:true});
  const resourceDirectory=resourcesRoot===null?ROOT:localPath(resourcesRoot);
  const read=path=>readFileSync(join(resourceDirectory,path));
  const renderDependencies=()=>dependencies(resourceDirectory);
  const db=openCatalog(databasePath),tx=transactionStore(db),sourceLibrary=createSourceLibrary(read);
  const briefInput=JSON.parse(read('content/content-plan-40.json'));
  try{
    if(db.prepare('SELECT id FROM page_connections LIMIT 1').get())fail('EDITOR_CONNECTED_DATABASE_FORBIDDEN');
    importBriefs(db,briefInput);
    initializeSamples();
  }catch(error){db.close();throw error;}

  function current(key){
    if(typeof key!=='string'||!safeKey(key))fail('EDITOR_POST_NOT_FOUND');
    const row=db.prepare(`SELECT v.*,p.content_key,p.topic_group,e.stage,r.created_at,r.action,r.restored_from_id FROM posts p JOIN content_entries e ON e.post_id=p.id
      JOIN post_versions v ON v.id=e.active_version_id LEFT JOIN editor_revisions r ON r.version_id=v.id WHERE p.batch_id='initial-2026-v1' AND p.content_key=?`).get(key);
    if(!row)fail('EDITOR_POST_NOT_FOUND');return row;
  }
  function sourceNote(sample){return sample.source_refs.map(r=>`${r.id}${r.pages.length?' — trang PDF '+r.pages.join(', '):''}, ${r.section}\nCăn cứ: ${r.supports}\nDiễn giải: ${r.adaptation}`).join('\n\n');}
  function renderInput(row){const meta=JSON.parse(row.metadata_json);return {id:row.content_key??db.prepare('SELECT content_key FROM posts WHERE id=?').get(row.post_id).content_key,title:row.caption_title,body:row.body,image:meta.image??defaultImage()};}
  function putAsset(buffer){
    if(!validPng(buffer))fail('EDITOR_INVALID_ASSET');
    const assetId=uuid('asset'),key=assetId+'.png';writeFileSync(join(assetDirectory,key),buffer,{flag:'wx'});
    return {id:assetId,key,checksum:digest(buffer),size:buffer.length};
  }
  function initializeSamples(){
    const samples=JSON.parse(read('content/samples-2026-v1.json')).samples;
    const previous=db.prepare("SELECT * FROM editor_imports WHERE batch_id='samples-2026-v1'").get();
    if(previous){
      // Imported snapshots live in SQLite; missing/changing PDFs must remain diagnosable in the UI.
      const manifest=JSON.parse(read('content/samples-2026-v1.manifest.json'));
      if(manifest.input_sha256!==digest(read('content/samples-2026-v1.json')))fail('EDITOR_IMPORT_CHANGED');
      const fingerprint=digest(JSON.stringify(samples.map(s=>({key:s.id,caption:composeCaption(s.body),image:manifest.samples.find(p=>p.id===s.id)?.image_sha256}))));
      if(previous.fingerprint!==fingerprint)fail('EDITOR_IMPORT_CHANGED');return;
    }
    const previews=loadSamplePreviews(read);
    const fingerprint=digest(JSON.stringify(previews.map(p=>({key:p.key,caption:p.caption,image:p.imageChecksum}))));
    // All files are checked before the transaction; unreferenced files are harmless after a rollback.
    const assets=new Map(samples.map(s=>[s.id,putAsset(read(`assets/samples/v1/${s.id}.png`))]));
    const dep=JSON.stringify(renderDependencies());
    const registry=JSON.parse(read('content/samples-2026-v1.manifest.json')).registry;
    tx.immediate(()=>{
      for(const sample of samples){
        const parent=current(sample.id),versionId=uuid('ver'),asset=assets.get(sample.id),created=now();
        const metadata={editor:true,isBrief:false,image:sample.image,sourceNote:sourceNote(sample),sourceRefs:sample.source_refs,level:briefInput.posts.find(p=>p.id===sample.id).level,angle:sample.id,concept:parent.topic_group};
        db.prepare(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_points,image_description,primary_audience,metadata_json,status)
          VALUES (?,?,2,?,?,?,?,?,?,?,'needs_review')`).run(versionId,parent.post_id,sample.body,sample.title,sample.image.headline,JSON.stringify(sample.image.cards),sample.image.subline,parent.primary_audience,JSON.stringify(metadata));
        for(const [index,ref] of sample.source_refs.entries()){
          const sourceId=versionId+':source:'+index,owner=ref.id==='OWNER-2026';
          db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,NULL)').run(sourceId,ref.id+' — căn cứ riêng cho '+sample.id,registry[ref.id].sha256,ref.section,owner?'user_confirmation':'document',owner?'verified':'pending',owner?'2026-10-04T00:00:00Z':null);
          db.prepare('INSERT INTO version_sources VALUES (?,?,?)').run(versionId,sourceId,JSON.stringify(ref));
        }
        for(const fact of db.prepare('SELECT fact_id FROM version_facts WHERE version_id=?').all(parent.id))db.prepare('INSERT INTO version_facts VALUES (?,?)').run(versionId,fact.fact_id);
        db.prepare('INSERT INTO editor_revisions VALUES (?,?,NULL,?,?,?)').run(versionId,parent.id,'import','local-import-approved-step-8',created);
        db.prepare("UPDATE content_entries SET active_version_id=?,stage='caption' WHERE post_id=?").run(versionId,parent.post_id);
        db.prepare("INSERT INTO assets VALUES (?,?,?,'image/png',1080,1080,?,'complete')").run(asset.id,asset.key,asset.checksum,asset.size);
        db.prepare('UPDATE post_versions SET asset_id=? WHERE id=?').run(asset.id,versionId);
        const version=db.prepare('SELECT * FROM post_versions WHERE id=?').get(versionId);
        db.prepare('INSERT INTO asset_bindings VALUES (?,?,?,?)').run(versionId,asset.id,version.check_version,asset.checksum);
        const inputJson=JSON.stringify(renderInput(version));
        db.prepare('INSERT INTO editor_render_receipts VALUES (?,?,?,?,?,?)').run(asset.id,versionId,inputJson,digest(inputJson),dep,created);
      }
      db.prepare('INSERT INTO editor_imports VALUES (?,?)').run('samples-2026-v1',fingerprint);
    });
  }
  function readAsset(assetId){
    if(typeof assetId!=='string'||!/^asset-[0-9a-f-]{36}$/.test(assetId))fail('EDITOR_ASSET_NOT_FOUND');
    const asset=db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
    if(!asset||asset.storage_key!==assetId+'.png')fail('EDITOR_ASSET_NOT_FOUND');
    const path=join(assetDirectory,asset.storage_key);
    if(!existsSync(path))fail('EDITOR_ASSET_CHANGED');
    const buffer=readFileSync(path);
    if(!validPng(buffer)||digest(buffer)!==asset.checksum||buffer.length!==asset.size_bytes)fail('EDITOR_ASSET_CHANGED');
    return buffer;
  }
  function imageCurrent(row){
    if(!row.asset_id)return false;
    try{
      readAsset(row.asset_id);
      const receipt=db.prepare('SELECT * FROM editor_render_receipts WHERE asset_id=? AND version_id=?').get(row.asset_id,row.id);
      return Boolean(receipt&&receipt.input_checksum===digest(JSON.stringify(renderInput(row)))&&receipt.dependency_json===JSON.stringify(renderDependencies()));
    }catch{return false;}
  }
  function versionModel(row){
    const meta=JSON.parse(row.metadata_json),imageValid=imageCurrent(row);
    const review=db.prepare('SELECT * FROM editor_reviews WHERE version_id=? AND check_version=? AND footer_version=?').get(row.id,row.check_version,FOOTER_VERSION);
    return {id:row.id,number:row.version,title:row.caption_title,body:row.body,caption:composeCaption(row.body),stage:row.stage??(meta.isBrief?'brief':'caption'),
      sourceNote:meta.sourceNote??'',sourceRefs:meta.sourceRefs??[],image:meta.image??defaultImage(),imageUrl:row.asset_id?`/editor-assets/${row.asset_id}.png`:null,
      imageCurrent:imageValid,checkVersion:row.check_version,reviewed:Boolean(row.status!=='quarantined'&&review&&imageValid&&auditRow(row).canReview),review:review?{at:review.checked_at,reviewer:review.reviewer,note:review.source_note}:null,
      createdAt:row.created_at??null,action:row.action??'brief',restoredFrom:row.restored_from_id??null,status:row.status};
  }
  function getPost(key){
    const row=current(key),versions=db.prepare(`SELECT v.*,r.created_at,r.action,r.restored_from_id FROM post_versions v
      LEFT JOIN editor_revisions r ON r.version_id=v.id WHERE v.post_id=? ORDER BY v.version DESC`).all(row.post_id);
    return {key,postId:row.post_id,current:versionModel(row),versions:versions.map(versionModel),footerVersion:FOOTER_VERSION,sourceLibrary:sourceLibrary.list(),audit:auditRow(row)};
  }
  function save(key,input){
    const row=current(key);
    if(typeof input?.requestId!=='string'||input.requestId.length>100||!input.requestId.trim()||typeof input.expectedVersion!=='string')fail('INVALID_EDITOR_REQUEST');
    const draft=validateEditorDraft(input.draft),sourceRecords=draft.sourceRefs===undefined?undefined:sourceLibrary.resolveRefs(draft.sourceRefs),fingerprint=digest(JSON.stringify({key,expectedVersion:input.expectedVersion,draft}));
    const id=saveEditorRevision(tx,{postId:row.post_id,expectedVersion:input.expectedVersion,versionId:uuid('ver'),requestId:input.requestId,fingerprint,now:now(),actor:'local-owner-unverified-login',draft,sourceRecords});
    return {...getPost(key),savedVersion:id};
  }
  function restore(key,input){
    const row=current(key);
    if(typeof input?.requestId!=='string'||!input.requestId.trim()||input.requestId.length>100||typeof input.expectedVersion!=='string'||typeof input.restoreFrom!=='string')fail('INVALID_EDITOR_REQUEST');
    const target=db.prepare('SELECT * FROM post_versions WHERE id=? AND post_id=?').get(input.restoreFrom,row.post_id);
    if(!target)fail('EDITOR_VERSION_NOT_FOUND');
    const meta=JSON.parse(target.metadata_json),draft=validateEditorDraft({title:target.caption_title,body:target.body,image:meta.image??defaultImage(),sourceNote:meta.sourceNote??''});
    const fingerprint=digest(JSON.stringify({key,expectedVersion:input.expectedVersion,restoreFrom:input.restoreFrom}));
    const id=saveEditorRevision(tx,{postId:row.post_id,expectedVersion:input.expectedVersion,versionId:uuid('ver'),requestId:input.requestId,fingerprint,now:now(),actor:'local-owner-unverified-login',draft,restoreFrom:target.id});
    return {...getPost(key),savedVersion:id};
  }
  async function render(key,input){
    const row=current(key);
    if(row.id!==input?.expectedVersion||row.check_version!==input.expectedCheck)fail('EDITOR_CONFLICT');
    if(row.asset_id){if(imageCurrent(row))return getPost(key);fail('EDITOR_IMAGE_NEEDS_NEW_VERSION');}
    if(!JSON.parse(row.metadata_json).editor)fail('EDITOR_SAVE_CAPTION_FIRST');
    const value=renderInput(row),jobDirectory=localPath('tmp/step-08/render-jobs/'+randomUUID());mkdirSync(jobDirectory,{recursive:true});
    const inputJson=JSON.stringify(value),inputPath=join(jobDirectory,'input.json'),depBefore=JSON.stringify(renderDependencies());writeFileSync(inputPath,inputJson);
    const python=process.env.SAMPLE_PYTHON??join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    try{await runFile(python,[join(resourceDirectory,'scripts/render-samples.py'),'--single','--input',inputPath,'--output',jobDirectory],{cwd:resourceDirectory,windowsHide:true,timeout:20000,maxBuffer:262144});}
    catch(error){
      if(String(error.stderr).includes('TEXT_OVERFLOW'))fail('EDITOR_TEXT_OVERFLOW');
      if(String(error.stderr).includes('Missing glyphs'))fail('EDITOR_MISSING_GLYPH');
      if(String(error.stderr).includes('LOW_TEXT_CONTRAST'))fail('EDITOR_LOW_CONTRAST');
      fail('EDITOR_RENDER_FAILED');
    }
    if(depBefore!==JSON.stringify(renderDependencies()))fail('EDITOR_RENDER_INPUT_CHANGED');
    const report=JSON.parse(readFileSync(join(jobDirectory,'render-report.json'))).samples[0],buffer=readFileSync(join(jobDirectory,key+'.png'));
    if(report.input_sha256!==digest(inputJson)||report.sha256!==digest(buffer))fail('EDITOR_RENDER_INPUT_CHANGED');
    const asset=putAsset(buffer);
    attachEditorRender(tx,{postId:row.post_id,expectedVersion:row.id,expectedCheck:row.check_version,assetId:asset.id,storageKey:asset.key,checksum:asset.checksum,size:asset.size,inputJson,inputChecksum:digest(inputJson),dependencyJson:depBefore,now:now()});
    return getPost(key);
  }
  function sourceState(row){
    const refs=JSON.parse(row.metadata_json).sourceRefs;
    if(!Array.isArray(refs)||!refs.length)return [{code:'EDITOR_SOURCE_PROVENANCE_REQUIRED'}];
    try{
      const resolved=sourceLibrary.resolveRefs(refs);
      const stored=db.prepare('SELECT s.revision,s.authority,r.location FROM sources s JOIN version_sources r ON r.source_id=s.id WHERE r.version_id=?').all(row.id);
      if(stored.length!==resolved.length||resolved.some(ref=>!stored.some(s=>s.revision===ref.revision&&s.authority===ref.authority&&s.location===JSON.stringify({id:ref.id,pages:ref.pages,section:ref.section,supports:ref.supports,adaptation:ref.adaptation}))))return [{code:'EDITOR_SOURCE_CHANGED'}];
      return [];
    }catch(error){return [{code:error instanceof EditorError?error.code:'EDITOR_SOURCE_CHANGED'}];}
  }
  function auditRow(row){
    const issues=sourceState(row),meta=JSON.parse(row.metadata_json);
    if(row.status==='quarantined')issues.unshift({code:'EDITOR_RESTORED_REVIEW_REQUIRED'});
    if(row.stage==='brief'||meta.isBrief)issues.unshift({code:'EDITOR_SAVE_CAPTION_FIRST'});
    if(!meta.sourceNote?.trim())issues.push({code:'EDITOR_SOURCE_NOTE_REQUIRED'});
    if(!imageCurrent(row))issues.push({code:'EDITOR_IMAGE_NOT_CURRENT'});
    const refs=meta.sourceRefs??[];
    const group=row.topic_group??db.prepare('SELECT topic_group FROM posts WHERE id=?').get(row.post_id)?.topic_group;
    if(group==='I'&&(!refs.some(r=>['BM03','BM11','BM12'].includes(r.id))||!refs.some(r=>r.id==='OWNER-2026')))issues.push({code:'EDITOR_PROGRAM_SOURCE_REQUIRED'});
    const body=normalizedBody(row.body);
    const duplicates=db.prepare("SELECT p.content_key,v.body FROM content_entries e JOIN posts p ON p.id=e.post_id JOIN post_versions v ON v.id=e.active_version_id WHERE e.stage='caption' AND p.id<>?").all(row.post_id).filter(v=>normalizedBody(v.body)===body).map(v=>v.content_key);
    if(duplicates.length)issues.push({code:'EDITOR_DUPLICATE_CAPTION',matches:duplicates});
    if(db.prepare('SELECT caption_snapshot FROM publications').all().some(v=>normalizedBody(v.caption_snapshot)===body))issues.push({code:'EDITOR_DUPLICATE_PUBLISHED_CAPTION'});
    return {versionId:row.id,checkVersion:row.check_version,issues,canReview:issues.length===0,checkedAt:now(),scope:'Kiểm tra cấu trúc, nguồn và caption trùng nguyên văn; cần người quản lý đối chiếu nhận định và ảnh.'};
  }
  function warehouseAudit(){
    const rows=db.prepare("SELECT p.content_key FROM posts p JOIN content_entries e ON e.post_id=p.id WHERE p.batch_id='initial-2026-v1' ORDER BY p.content_key").all();
    const posts=rows.map(p=>{const row=current(p.content_key);return {key:p.content_key,title:row.caption_title,version:row.version,...auditRow(row)};});
    return {checkedAt:now(),total:posts.length,canReview:posts.filter(p=>p.canReview).length,posts};
  }
  function audit(key,input){const row=current(key);if(row.id!==input?.expectedVersion||row.check_version!==input.expectedCheck)fail('EDITOR_CONFLICT');return getPost(key);}
  function review(key,input){
    const row=current(key);
    if(row.id!==input?.expectedVersion||row.check_version!==input.expectedCheck)fail('EDITOR_CONFLICT');
    if(!imageCurrent(row))fail('EDITOR_IMAGE_NOT_CURRENT');
    const issues=auditRow(row).issues;
    if(issues.length)fail(issues[0].code);
    const asset=db.prepare('SELECT checksum FROM assets WHERE id=?').get(row.asset_id);
    recordEditorReview(tx,{postId:row.post_id,expectedVersion:row.id,expectedCheck:row.check_version,checksum:asset.checksum,now:now(),reviewer:'local-owner-unverified-login',rubric:input.rubric,reviewId:uuid('review')});
    return getPost(key);
  }
  return {db,reader:reader(db),getPost,save,restore,render,review,audit,warehouseAudit,readAsset,sourceLibrary,backupContext:{resourceDirectory,assetDirectory},close:()=>db.close()};
}
