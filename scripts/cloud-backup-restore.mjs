// Offline recovery only: never touches a Cloudflare binding or executes bundle SQL.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,lstatSync,mkdirSync,existsSync,copyFileSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BACKUP_SCHEMA} from '../src/cloud/backup-schema.ts';
import {prepareCloud} from './cloud-prepare.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});},hash=b=>createHash('sha256').update(b).digest('hex');
function scan(root,prefix=''){const out=[];for(const name of readdirSync(join(root,prefix))){const path=prefix+name,stat=lstatSync(join(root,path));if(stat.isSymbolicLink())fail('BACKUP_SYMLINK_FORBIDDEN');if(stat.isDirectory())out.push(...scan(root,path+'/'));else if(stat.isFile())out.push(path);else fail('BACKUP_FILE_INVALID');}return out;}
const paths=new Set(['database.json',...BACKUP_SCHEMA.extra.map(f=>f.path)]);
const safePath=path=>typeof path==='string'&&(paths.has(path)||/^objects\/(document|logo|image)\/[a-f0-9]{64}$/.test(path));
function jsonFile(path,max){if(!existsSync(path))fail('BACKUP_FILES_MISSING_OR_EXTRA');if(lstatSync(path).size>max)fail('BACKUP_TOO_LARGE');try{return JSON.parse(readFileSync(path,'utf8'));}catch{fail('BACKUP_MANIFEST_INVALID');}}
export function verifyCloudBundle(bundle){
  const root=resolve(bundle);if(!existsSync(root)||lstatSync(root).isSymbolicLink()||!lstatSync(root).isDirectory())fail('BACKUP_PATH_INVALID');
  const actual=scan(root),manifest=jsonFile(join(root,'manifest.json'),200000);
  if(manifest.format!=='nttu-cloud-backup-v1'||manifest.complete!==true||!/^backup-[a-f0-9-]{36}$/.test(manifest.id)||manifest.schemaVersion!==BACKUP_SCHEMA.version||manifest.schemaFingerprint!==BACKUP_SCHEMA.fingerprint||!Array.isArray(manifest.files)||manifest.files.length>262)fail('BACKUP_MANIFEST_INVALID');
  let total=0;const seen=new Set();for(const file of manifest.files){if(!file||typeof file!=='object'||!safePath(file.path)||seen.has(file.path)||!Number.isSafeInteger(file.size)||file.size<0||file.size>12*1048576||!/^[a-f0-9]{64}$/.test(file.sha256))fail('BACKUP_MANIFEST_INVALID');seen.add(file.path);total+=file.size;if(total>112*1048576)fail('BACKUP_TOO_LARGE');const path=join(root,file.path);if(!existsSync(path)||lstatSync(path).size!==file.size||hash(readFileSync(path))!==file.sha256)fail('BACKUP_INTEGRITY_FAILED');}
  if(actual.length!==seen.size+1||actual.some(p=>p!=='manifest.json'&&!seen.has(p))||!seen.has('database.json'))fail('BACKUP_FILES_MISSING_OR_EXTRA');
  for(const font of BACKUP_SCHEMA.extra){const file=manifest.files.find(f=>f.path===font.path);if(file?.sha256!==font.sha256||file?.size!==font.size)fail('BACKUP_RESOURCE_MISSING');}
  const snapshot=jsonFile(join(root,'database.json'),1048576);
  if(snapshot.format!=='nttu-cloud-snapshot-v1'||snapshot.id!==manifest.id||snapshot.schemaVersion!==manifest.schemaVersion||snapshot.schemaFingerprint!==manifest.schemaFingerprint||snapshot.release!==manifest.release||snapshot.capturedAt!==manifest.capturedAt||JSON.stringify(snapshot.counts)!==JSON.stringify(manifest.counts))fail('BACKUP_SNAPSHOT_INVALID');
  if(!snapshot.tables||Object.keys(snapshot.tables).sort().join('|')!==BACKUP_SCHEMA.tables.map(t=>t.name).join('|'))fail('BACKUP_SCHEMA_UNSUPPORTED');
  for(const t of BACKUP_SCHEMA.tables){const rows=snapshot.tables[t.name];if(!Array.isArray(rows)||rows.length>5000)fail('BACKUP_SNAPSHOT_INVALID');for(const r of rows)if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join('|')!==[...t.columns].sort().join('|')||Object.values(r).some(v=>v!==null&&typeof v!=='string'&&(typeof v!=='number'||!Number.isFinite(v))))fail('BACKUP_SNAPSHOT_INVALID');}
  const t=snapshot.tables;if(t.page_connections.length||t.publish_jobs.length||t.application_state.some(r=>r.paused_by_user!==1||r.maintenance_owner!==null))fail('BACKUP_CONNECTED_OR_BUSY');
  const counts={posts:t.posts.length,versions:t.post_versions.length,files:t.cloud_library.length,reviews:t.cloud_reviews.length};if(JSON.stringify(counts)!==JSON.stringify(manifest.counts))fail('BACKUP_SNAPSHOT_INVALID');
  for(const l of t.cloud_library){const path='objects/'+l.kind+'/'+l.checksum;if(l.state!=='complete'||l.storage_key!=='private/v1/'+l.kind+'/'+l.checksum||!manifest.files.some(f=>f.path===path&&f.sha256===l.checksum&&f.size===l.size_bytes))fail('BACKUP_ASSET_INVALID');}
  if(manifest.files.length!==1+t.cloud_library.length+BACKUP_SCHEMA.extra.length)fail('BACKUP_FILES_MISSING_OR_EXTRA');
  for(const a of t.assets)if(!t.cloud_library.some(l=>l.kind==='image'&&l.storage_key===a.storage_key&&l.checksum===a.checksum&&l.size_bytes===a.size_bytes))fail('BACKUP_ASSET_INVALID');
  return {root,manifest,snapshot,bytes:total};
}
function trustedSchema(){const {directory}=prepareCloud({output:'tmp/step-17/restore-schema'}),db=new DatabaseSync(':memory:');try{for(const name of readdirSync(directory+'/migrations').sort())db.exec(readFileSync(directory+'/migrations/'+name,'utf8'));return{definitions:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),migrations:db.prepare('SELECT * FROM schema_migrations ORDER BY name').all()};}finally{db.close();}}
export function restoreCloudBundle({bundle,requestId,confirmQuarantine=false}){
  if(confirmQuarantine!==true||typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(requestId))fail('BACKUP_RESTORE_CONFIRMATION_REQUIRED');
  const verified=verifyCloudBundle(bundle),id='restored-'+requestId,base=resolve('tmp/step-17/restores'),target=join(base,id),building=join(base,'.building-'+id),manifestHash=hash(readFileSync(join(verified.root,'manifest.json')));
  const rel=relative(resolve('tmp'),target);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail('BACKUP_PATH_INVALID');
  for(const parent of ['tmp','tmp/step-17','tmp/step-17/restores'])if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())fail('BACKUP_PATH_INVALID');
  if(existsSync(target)){if(lstatSync(target).isSymbolicLink())fail('BACKUP_PATH_INVALID');const result=jsonFile(join(target,'restore-result.json'),10000);if(result.manifestHash!==manifestHash)fail('BACKUP_REQUEST_REUSED');return {...result,replayed:true};}
  if(existsSync(building))fail('BACKUP_RESTORE_INCOMPLETE');
  const trusted=trustedSchema(),business=trusted.definitions.filter(d=>!['cloud_backups','cloud_backup_checks','cloud_telegram_runtime','cloud_telegram_attempts','cloud_meta_checks'].includes(d.tbl_name));
  if(hash(JSON.stringify(business))!==BACKUP_SCHEMA.fingerprint||JSON.stringify(verified.snapshot.tables.schema_migrations)!==JSON.stringify(trusted.migrations))fail('BACKUP_SCHEMA_UNSUPPORTED');
  mkdirSync(building,{recursive:true});const database=join(building,'warehouse.sqlite'),db=new DatabaseSync(database);
  try{
    db.exec('PRAGMA foreign_keys=OFF; BEGIN');for(const d of trusted.definitions.filter(d=>d.type==='table'))db.exec(d.sql);
    for(const t of BACKUP_SCHEMA.tables){const insert=db.prepare(`INSERT INTO "${t.name}" (${t.columns.map(c=>'"'+c+'"').join(',')}) VALUES (${t.columns.map(()=>'?').join(',')})`);for(const row of verified.snapshot.tables[t.name])insert.run(...t.columns.map(c=>row[c]));}
    for(const d of trusted.definitions.filter(d=>d.type==='index'))db.exec(d.sql);
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_DATABASE_INVALID');
    for(const d of trusted.definitions.filter(d=>d.type==='trigger'))db.exec(d.sql);
    db.exec("UPDATE application_state SET paused_by_user=1,blocked_reasons='[\"RESTORED_BACKUP\"]'; UPDATE post_versions SET status='quarantined',check_version=check_version+1; UPDATE simulation_settings SET enabled=0; UPDATE notification_outbox SET state='quarantined',next_at=NULL WHERE state!='delivered'; INSERT INTO cloud_telegram_runtime(id) VALUES(1);");
    db.exec('COMMIT; PRAGMA foreign_keys=ON');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)fail('BACKUP_DATABASE_INVALID');
  }catch(error){try{db.exec('ROLLBACK');}catch{}if(error.code?.startsWith('BACKUP_'))throw error;fail('BACKUP_DATABASE_INVALID');}finally{db.close();}
  for(const file of verified.manifest.files){const output=join(building,file.path);mkdirSync(dirname(output),{recursive:true});copyFileSync(join(verified.root,file.path),output);}
  copyFileSync(join(verified.root,'manifest.json'),join(building,'origin-manifest.json'));
  const result={id,backupId:verified.manifest.id,manifestHash,counts:verified.manifest.counts,bytes:verified.bytes,quarantined:true,paused:true,remoteModified:false,database:join(target,'warehouse.sqlite'),directory:target};
  writeFileSync(join(building,'restore-result.json'),JSON.stringify(result,null,2),{flag:'wx'});renameSync(building,target);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];if(!args.includes('--bundle')||!args.includes('--request-id')||!args.includes('--confirm-quarantine'))throw Error('Use --bundle <extracted folder> --request-id <UUID> --confirm-quarantine');console.log(JSON.stringify(restoreCloudBundle({bundle:get('--bundle'),requestId:get('--request-id'),confirmQuarantine:true})));}
