import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,renameSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createSourceLibrary} from './source-library.mjs';
import {loadSamplePreviews} from './sample-previews.mjs';
import {EditorError} from '../src/domain/editor.ts';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw new EditorError(code);};
const validId=id=>typeof id==='string'&&/^(backup|restored)-[0-9a-f-]{36}$/.test(id);
function local(path){const target=resolve(ROOT,path),rel=relative(join(ROOT,'tmp'),target);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('BACKUP_PATH_INVALID');return target;}
function files(directory,prefix=''){const result=[];for(const name of readdirSync(directory)){const full=join(directory,name),path=prefix+name,stat=lstatSync(full);if(stat.isSymbolicLink())fail('BACKUP_SYMLINK_FORBIDDEN');if(stat.isDirectory())result.push(...files(full,path+'/'));else if(stat.isFile())result.push(path);else fail('BACKUP_FILE_INVALID');}return result;}
function relativeFile(path){if(typeof path!=='string'||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')||path.includes(':'))fail('BACKUP_FILE_INVALID');return path;}
function inspectDatabase(path){
 const db=new DatabaseSync(path,{readOnly:true});try{
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_DATABASE_INVALID');
 const expected=readdirSync(join(ROOT,'migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort(),migrations=db.prepare('SELECT name,checksum FROM schema_migrations ORDER BY name').all();
 if(migrations.length!==expected.length||migrations.some((m,i)=>m.name!==expected[i]||m.checksum!==hash(readFileSync(join(ROOT,'migrations',m.name)))))fail('BACKUP_SCHEMA_UNSUPPORTED');
 if(db.prepare('SELECT COUNT(*) n FROM page_connections').get().n||db.prepare('SELECT COUNT(*) n FROM publish_jobs').get().n)fail('BACKUP_CONNECTED_DATABASE_FORBIDDEN');
 return {posts:db.prepare('SELECT COUNT(*) n FROM posts').get().n,versions:db.prepare('SELECT COUNT(*) n FROM post_versions').get().n,reviews:db.prepare('SELECT COUNT(*) n FROM editor_reviews').get().n,assets:db.prepare('SELECT * FROM assets ORDER BY id').all()};
 }catch(error){if(error instanceof EditorError)throw error;fail('BACKUP_DATABASE_INVALID');}finally{db.close();}
}
export function createBackupService(editor,{backupsRoot='tmp/step-10/backups',restoresRoot='tmp/step-10/restores'}={}){
 const directory=local(backupsRoot),restores=local(restoresRoot);mkdirSync(directory,{recursive:true});mkdirSync(restores,{recursive:true});
 const {resourceDirectory,assetDirectory}=editor.backupContext;
 function resourceFiles(){return ['content/content-plan-40.json','content/samples-2026-v1.json','content/samples-2026-v1.manifest.json','scripts/render-samples.py',...['assets/sources','assets/fonts','assets/brand/originals','assets/samples/v1','content/samples/v1'].flatMap(p=>files(join(resourceDirectory,p)).map(n=>p+'/'+n))];}
 function assertIdle(){if(editor.db.prepare('SELECT environment FROM application_state WHERE maintenance_owner IS NOT NULL').all().length)fail('BACKUP_MAINTENANCE');if(editor.db.prepare('SELECT id FROM page_connections LIMIT 1').get()||editor.db.prepare('SELECT id FROM publish_jobs LIMIT 1').get())fail('BACKUP_CONNECTED_DATABASE_FORBIDDEN');}
 function verifyAt(bundle){
  if(lstatSync(bundle).isSymbolicLink())fail('BACKUP_SYMLINK_FORBIDDEN');
  let manifest;try{manifest=JSON.parse(readFileSync(join(bundle,'manifest.json'),'utf8'));}catch{fail('BACKUP_MANIFEST_INVALID');}
  if(manifest.format!=='nttu-local-backup-v1'||manifest.complete!==true||!validId(manifest.id)||!Array.isArray(manifest.files)||manifest.files.length>10000)fail('BACKUP_MANIFEST_INVALID');
  const seen=new Set();let bytes=0;
  for(const entry of manifest.files){relativeFile(entry.path);if(entry.path==='manifest.json'||seen.has(entry.path)||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256))fail('BACKUP_MANIFEST_INVALID');seen.add(entry.path);bytes+=entry.size;if(bytes>536870912)fail('BACKUP_TOO_LARGE');}
  const actual=files(bundle).filter(p=>p!=='manifest.json');if(actual.length!==seen.size||actual.some(p=>!seen.has(p)))fail('BACKUP_FILES_MISSING_OR_EXTRA');
  for(const entry of manifest.files){const data=readFileSync(join(bundle,entry.path));if(data.length!==entry.size||hash(data)!==entry.sha256)fail('BACKUP_CHECKSUM_FAILED');}
  for(const path of ['warehouse.sqlite','content/content-plan-40.json','content/samples-2026-v1.json','content/samples-2026-v1.manifest.json','scripts/render-samples.py','assets/sources/career/manifest.json','assets/sources/program/manifest.json'])if(!seen.has(path))fail('BACKUP_FILES_MISSING_OR_EXTRA');
  const bundledRead=path=>readFileSync(join(bundle,relativeFile(path)));
  if(!createSourceLibrary(bundledRead).list().every(source=>source.available))fail('BACKUP_RESOURCES_INVALID');
  try{loadSamplePreviews(bundledRead);}catch{fail('BACKUP_RESOURCES_INVALID');}
  const info=inspectDatabase(join(bundle,'warehouse.sqlite'));
  for(const asset of info.assets){if(asset.storage_key!==asset.id+'.png'||!/^asset-[0-9a-f-]{36}$/.test(asset.id))fail('BACKUP_ASSET_INVALID');const entry=manifest.files.find(f=>f.path==='warehouse-assets/'+asset.storage_key);if(!entry||entry.sha256!==asset.checksum||entry.size!==asset.size_bytes)fail('BACKUP_ASSET_INVALID');}
  if(manifest.counts.posts!==info.posts||manifest.counts.versions!==info.versions||manifest.counts.reviews!==info.reviews||manifest.counts.images!==info.assets.length)fail('BACKUP_MANIFEST_INVALID');
  return {id:manifest.id,createdAt:manifest.createdAt,counts:manifest.counts,bytes,verified:true,location:relative(ROOT,bundle).replaceAll('\\','/'),files:manifest.files.length};
 }
 function bundleFor(id){if(!validId(id)||!id.startsWith('backup-'))fail('BACKUP_NOT_FOUND');const path=join(directory,id);if(!existsSync(path))fail('BACKUP_NOT_FOUND');return path;}
 function verify(id){try{return verifyAt(bundleFor(id));}catch(e){if(e instanceof EditorError)throw e;fail('BACKUP_FILE_INVALID');}}
 function create(){
  assertIdle();const id='backup-'+randomUUID(),building=join(directory,'.building-'+id),complete=join(directory,id);mkdirSync(building);
  // VACUUM INTO takes a consistent SQLite snapshot; image keys are immutable.
  editor.db.prepare('VACUUM INTO ?').run(join(building,'warehouse.sqlite'));
  const info=inspectDatabase(join(building,'warehouse.sqlite'));
  for(const asset of info.assets){const bytes=editor.readAsset(asset.id),target=join(building,'warehouse-assets',asset.storage_key);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});}
  for(const path of resourceFiles()){const target=join(building,path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(resourceDirectory,path),target);}
  const entries=files(building).sort().map(path=>{const data=readFileSync(join(building,path));return {path,size:data.length,sha256:hash(data)};});
  const manifest={format:'nttu-local-backup-v1',id,createdAt:new Date().toISOString(),complete:true,counts:{posts:info.posts,versions:info.versions,reviews:info.reviews,images:info.assets.length},files:entries};
  writeFileSync(join(building,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});verifyAt(building);renameSync(building,complete);return verify(id);
 }
 function list(){return readdirSync(directory).filter(n=>/^backup-/.test(n)).map(id=>{try{return verify(id);}catch(e){return {id,verified:false,code:e instanceof EditorError?e.code:'BACKUP_FILE_INVALID'};}}).sort((a,b)=>(b.createdAt??'').localeCompare(a.createdAt??''));}
 function restore(input){
  assertIdle();if(!input||input.confirmQuarantine!==true||typeof input.requestId!=='string'||!/^[0-9a-f-]{36}$/.test(input.requestId))fail('BACKUP_RESTORE_CONFIRMATION_REQUIRED');
  const report=verify(input.id),receipt=join(restores,'request-'+input.requestId+'.json');
  if(existsSync(receipt)){const saved=JSON.parse(readFileSync(receipt));if(saved.backupId!==input.id)fail('BACKUP_REQUEST_REUSED');return saved;}
  const id='restored-'+randomUUID(),building=join(restores,'.building-'+id),target=join(restores,id);mkdirSync(building);
  const bundle=bundleFor(input.id);
  for(const path of files(bundle)){const output=join(building,path);mkdirSync(dirname(output),{recursive:true});copyFileSync(join(bundle,path),output);}
  verifyAt(building);
  const db=new DatabaseSync(join(building,'warehouse.sqlite'));try{db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');db.exec("UPDATE application_state SET paused_by_user=1; UPDATE post_versions SET status='quarantined',check_version=check_version+1; UPDATE simulation_settings SET enabled=0;");db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
  inspectDatabase(join(building,'warehouse.sqlite'));renameSync(join(building,'manifest.json'),join(building,'origin-manifest.json'));renameSync(building,target);
  const result={id,backupId:input.id,counts:report.counts,quarantined:true,location:relative(ROOT,target).replaceAll('\\','/'),database:relative(ROOT,join(target,'warehouse.sqlite')).replaceAll('\\','/'),assetsRoot:relative(ROOT,join(target,'warehouse-assets')).replaceAll('\\','/'),resourcesRoot:relative(ROOT,target).replaceAll('\\','/')};
  writeFileSync(join(target,'restore-result.json'),JSON.stringify(result,null,2));writeFileSync(receipt,JSON.stringify(result),{flag:'wx'});return result;
 }
 return {create,list,verify,restore};
}
