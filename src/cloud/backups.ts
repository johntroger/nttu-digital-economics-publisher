import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';
import {checksum,verifiedBytes} from './storage.ts';
import {BACKUP_SCHEMA} from './backup-schema.ts';
type Row=Record<string,unknown>;
interface File {path:string;sha256:string;size:number;source:'snapshot'|'media'|'asset';key:string}
interface Snapshot {format:string;id:string;capturedAt:string;release:string;schemaVersion:number;schemaFingerprint:string;tables:Record<string,Row[]>;counts:Record<string,number>}
function fail(code:string,status=409):never{throw new CatalogError(code,status);}
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function validId(id:string){if(!id.startsWith('backup-')||!uuid(id.slice(7)))fail('BACKUP_NOT_FOUND',404);}
async function rows(env:CloudBindings,sql:string,...values:(string|number|null)[]){return(await env.DB!.prepare(sql).bind(...values).all!<Row>()).results;}
async function idle(env:CloudBindings){await readStatus(env);if(!env.MEDIA||!env.DB!.batch)fail('BACKUP_NOT_CONFIGURED',503);const state=(await rows(env,"SELECT maintenance_owner FROM application_state WHERE environment='staging'"))[0];if(state?.maintenance_owner!==null)fail('BACKUP_BUSY');}
async function get(env:CloudBindings,id:string){validId(id);const row=(await rows(env,'SELECT * FROM cloud_backups WHERE id=?',id))[0];if(!row)fail('BACKUP_NOT_FOUND',404);return row;}
const filesOf=(row:Row)=>row.files_json?JSON.parse(String(row.files_json)) as File[]:[];
function view(row:Row){const files=filesOf(row),snapshot=row.snapshot_json?JSON.parse(String(row.snapshot_json)) as Snapshot:null;return{id:row.id,createdAt:row.created_at,capturedAt:snapshot?.capturedAt??null,state:row.state,copied:row.next_index,files:files.length,bytes:files.reduce((n,f)=>n+f.size,0),counts:snapshot?.counts??null,lastVerifiedAt:row.last_verified_at??null};}
const guard="NOT EXISTS(SELECT 1 FROM cloud_content_trial WHERE state IN ('intent','unknown')) AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL) AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))";
function manifest(row:Row){const snapshot=JSON.parse(String(row.snapshot_json)) as Snapshot;return{format:'nttu-cloud-backup-v1',id:row.id,complete:true,capturedAt:snapshot.capturedAt,release:snapshot.release,schemaVersion:snapshot.schemaVersion,schemaFingerprint:snapshot.schemaFingerprint,counts:snapshot.counts,files:filesOf(row).map(({path,size,sha256})=>({path,size,sha256}))};}
async function readObject(env:CloudBindings,key:string,size:number,hash:string){const object=await env.MEDIA!.get(key);if(!object||object.size!==size||size>12*1048576)fail('BACKUP_INTEGRITY_FAILED');const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==size||await checksum(bytes)!==hash)fail('BACKUP_INTEGRITY_FAILED');return bytes;}
async function putVerified(env:CloudBindings,key:string,bytes:Uint8Array,type='application/octet-stream'){
  try{await env.MEDIA!.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:type}});}catch{if(!await env.MEDIA!.get(key))fail('BACKUP_WRITE_FAILED',503);}
  await readObject(env,key,bytes.length,await checksum(bytes));
}
export async function listBackups(env:CloudBindings){await readStatus(env);return{maxBackups:10,backups:(await rows(env,`SELECT b.*, (SELECT max(c.completed_at) FROM cloud_backup_checks c WHERE c.backup_id=b.id) last_verified_at FROM cloud_backups b ORDER BY b.created_at DESC`)).map(view)};}
export async function createBackup(env:CloudBindings,owner:OwnerSession,input:unknown){return initializeBackup(env,owner,input);}
async function initializeBackup(env:CloudBindings,owner:OwnerSession,input:unknown,existing?:Row){
  await idle(env);const request=(input as {requestId?:unknown}|null)?.requestId;if(!uuid(request))fail('BACKUP_REQUEST_INVALID',422);
  const id='backup-'+request;
  await env.DB!.prepare(`INSERT INTO cloud_backups(id,actor,created_at) SELECT ?,?,? WHERE (SELECT count(*) FROM cloud_backups)<10 AND ${guard} ON CONFLICT(id) DO NOTHING`).bind(id,owner.email,new Date().toISOString()).run();
  const row=existing??(await rows(env,'SELECT * FROM cloud_backups WHERE id=?',id))[0];if(!row)fail('BACKUP_QUOTA_OR_BUSY');
  if(row.snapshot_json)return view(row);
  // A single transaction captures every business table at one point in time.
  const results=await env.DB!.batch!([...BACKUP_SCHEMA.tables.map(t=>env.DB!.prepare(`SELECT * FROM "${t.name}" ORDER BY ${t.columns.map(c=>'"'+c+'"').join(',')} LIMIT 5001`)),env.DB!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations','cloud_backups','cloud_backup_checks','cloud_telegram_runtime','cloud_telegram_attempts','cloud_meta_checks','cloud_meta_trial','cloud_daily_config','cloud_content_trial','cloud_presence_runs','cloud_presence_items') ORDER BY name")]) as {results:Row[]}[];
  if(results[BACKUP_SCHEMA.tables.length]?.results.map(r=>r.name).join('|')!==BACKUP_SCHEMA.tables.map(t=>t.name).join('|'))fail('BACKUP_SCHEMA_UNSUPPORTED');
  const tables:Record<string,Row[]>={};for(const [i,t] of BACKUP_SCHEMA.tables.entries()){const data=results[i]?.results;if(!Array.isArray(data)||data.length>5000)fail('BACKUP_SNAPSHOT_TOO_LARGE');for(const r of data)if(Object.keys(r).sort().join('|')!==[...t.columns].sort().join('|')||Object.values(r).some(v=>v!==null&&typeof v!=='string'&&(typeof v!=='number'||!Number.isFinite(v))))fail('BACKUP_SCHEMA_UNSUPPORTED');tables[t.name]=data;}
  if(tables.publish_jobs!.some(r=>['held','publish_requested','evidence_pending','retry_wait','unknown'].includes(String(r.state)))||tables.application_state!.some(r=>r.paused_by_user!==1||r.maintenance_owner!==null))fail('BACKUP_CONNECTED_OR_BUSY');
  const library=tables.cloud_library!;if(library.some(r=>r.state!=='complete'))fail('BACKUP_PENDING_FILES');
  for(const a of tables.assets!)if(!library.some(l=>l.kind==='image'&&l.storage_key===a.storage_key&&l.checksum===a.checksum&&l.size_bytes===a.size_bytes))fail('BACKUP_ASSET_UNAVAILABLE');
  const snapshot:Snapshot={format:'nttu-cloud-snapshot-v1',id,capturedAt:new Date().toISOString(),release:env.RELEASE_SHA??'local',schemaVersion:BACKUP_SCHEMA.version,schemaFingerprint:BACKUP_SCHEMA.fingerprint,tables,counts:{posts:tables.posts!.length,versions:tables.post_versions!.length,files:library.length,reviews:tables.cloud_reviews!.length}};
  const bytes=encode(snapshot);if(bytes.length>1048576)fail('BACKUP_SNAPSHOT_TOO_LARGE');
  const files:File[]=[{path:'database.json',source:'snapshot',key:'',size:bytes.length,sha256:await checksum(bytes)},...library.map(l=>{if(!/^private\/v1\/(document|logo|image)\/[a-f0-9]{64}$/.test(String(l.storage_key)))fail('BACKUP_ASSET_UNAVAILABLE');return {path:'objects/'+l.kind+'/'+l.checksum,source:'media' as const,key:String(l.storage_key),size:Number(l.size_bytes),sha256:String(l.checksum)};}),...BACKUP_SCHEMA.extra.map(f=>({...f,source:'asset' as const,key:'/'+f.path}))];
  if(files.length>262||files.reduce((n,f)=>n+f.size,0)>112*1048576||new Set(files.map(f=>f.path)).size!==files.length)fail('BACKUP_SNAPSHOT_TOO_LARGE');
  await env.DB!.prepare(`UPDATE cloud_backups SET snapshot_json=?,files_json=? WHERE id=? AND snapshot_json IS NULL AND ${guard}`).bind(new TextDecoder().decode(bytes),JSON.stringify(files),id).run();
  const pinned=await get(env,id);if(!pinned.snapshot_json)fail('BACKUP_BUSY');return view(pinned);
}
export async function continueBackup(env:CloudBindings,id:string,owner:OwnerSession){
  await readStatus(env);const row=await get(env,id);if(row.state==='complete')return view(row);
  if(!row.snapshot_json)return await initializeBackup(env,owner,{requestId:id.slice(7)},row);
  await idle(env);
  const files=filesOf(row),index=Number(row.next_index),file=files[index];
  if(file){let bytes:Uint8Array;
    if(file.source==='snapshot')bytes=new TextEncoder().encode(String(row.snapshot_json));
    else if(file.source==='media')bytes=await verifiedBytes(env,{storage_key:file.key,size_bytes:file.size,checksum:file.sha256});
    else {if(!env.ASSETS)fail('BACKUP_NOT_CONFIGURED',503);const response=await env.ASSETS!.fetch(new Request('https://assets.invalid'+file.key));if(response.status!==200)fail('BACKUP_RESOURCE_MISSING');bytes=new Uint8Array(await response.arrayBuffer());}
    if(bytes.length!==file.size||await checksum(bytes)!==file.sha256)fail('BACKUP_INTEGRITY_FAILED');
    await putVerified(env,'backups/v1/'+id+'/'+file.path,bytes);
    await env.DB!.prepare(`UPDATE cloud_backups SET next_index=next_index+1 WHERE id=? AND state='building' AND next_index=? AND ${guard}`).bind(id,index).run();
    const current=await get(env,id);if(Number(current.next_index)===index)fail('BACKUP_BUSY');return view(current);
  }
  const bytes=encode(manifest(row));await putVerified(env,'backups/v1/'+id+'/manifest.json',bytes,'application/json');
  await env.DB!.prepare(`UPDATE cloud_backups SET state='complete',manifest_checksum=?,completed_at=? WHERE id=? AND state='building' AND next_index=? AND ${guard}`).bind(await checksum(bytes),new Date().toISOString(),id,files.length).run();
  const complete=await get(env,id);if(complete.state!=='complete')fail('BACKUP_BUSY');return view(complete);
}
async function completeRow(env:CloudBindings,id:string){await readStatus(env);const row=await get(env,id);if(row.state!=='complete')fail('BACKUP_INCOMPLETE');const data=encode(manifest(row));await readObject(env,'backups/v1/'+id+'/manifest.json',data.length,String(row.manifest_checksum));return row;}
export async function backupManifest(env:CloudBindings,id:string){return manifest(await completeRow(env,id));}
export async function backupFile(env:CloudBindings,id:string,index:number){const row=await completeRow(env,id),file=filesOf(row)[index];if(!Number.isSafeInteger(index)||index<0||!file)fail('BACKUP_FILE_NOT_FOUND',404);const bytes=await readObject(env,'backups/v1/'+id+'/'+file.path,file.size,file.sha256);return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment'}});}
export async function checkBackup(env:CloudBindings,id:string,input:unknown){
  await idle(env);const request=(input as {requestId?:unknown}|null)?.requestId;if(!uuid(request))fail('BACKUP_REQUEST_INVALID',422);
  const row=await completeRow(env,id);
  await env.DB!.prepare(`INSERT INTO cloud_backup_checks(id,backup_id,created_at) SELECT ?,?,? WHERE (SELECT count(*) FROM cloud_backup_checks)<200 AND ${guard} ON CONFLICT(id) DO NOTHING`).bind(request,id,new Date().toISOString()).run();
  const check=(await rows(env,'SELECT * FROM cloud_backup_checks WHERE id=?',request))[0];if(!check||check.backup_id!==id)fail('BACKUP_REQUEST_REUSED');
  if(check.completed_at)return {id,requestId:request,verified:true,checked:check.next_index,checkedAt:check.completed_at};
  const index=Number(check.next_index),files=filesOf(row),file=files[index];
  if(file)await readObject(env,'backups/v1/'+id+'/'+file.path,file.size,file.sha256);
  await env.DB!.prepare(`UPDATE cloud_backup_checks SET next_index=?,completed_at=? WHERE id=? AND next_index=? AND completed_at IS NULL AND ${guard}`).bind(file?index+1:index,file?null:new Date().toISOString(),request,index).run();
  const current=(await rows(env,'SELECT * FROM cloud_backup_checks WHERE id=?',request))[0]!;
  if(!current.completed_at&&Number(current.next_index)===index)fail('BACKUP_BUSY');
  return {id,requestId:request,verified:Boolean(current.completed_at),checked:current.next_index,checkedAt:current.completed_at};
}

