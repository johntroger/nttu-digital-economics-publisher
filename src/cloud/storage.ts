import type { CloudBindings } from './runtime.ts';
import type { OwnerSession } from './auth.ts';
import { readStatus } from './runtime.ts';
import { CatalogError } from './catalog.ts';
type Row = Record<string, unknown>;
const MAX_TOTAL = 100 * 1024 * 1024, MAX_FILES = 256;
export const MAX_UPLOAD = 12 * 1024 * 1024;
async function query(env: CloudBindings, sql: string, ...args: (string|number|null)[]) {
  const statement = env.DB!.prepare(sql).bind(...args);
  if (!statement.all) throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);
  return (await statement.all<Row>()).results;
}
export async function checksum(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');
}
function model(row: Row) {
  return {id:row.id,kind:row.kind,filename:row.filename,sourceKey:row.source_key,checksum:row.checksum,
    contentType:row.content_type,size:row.size_bytes,width:row.width,height:row.height,state:row.state,
    createdAt:row.created_at,url:row.state==='complete'?'/api/library/files/'+row.id:null};
}
export async function library(env: CloudBindings) {
  await readStatus(env);
  const rows=await query(env,'SELECT * FROM cloud_library ORDER BY created_at DESC,id');
  return {configured:Boolean(env.MEDIA),files:rows.map(model),usedBytes:rows.reduce((n,row)=>n+Number(row.size_bytes),0),maxBytes:MAX_TOTAL,maxFiles:MAX_FILES};
}
export async function readUpload(request: Request) {
  const declared=request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared)||Number(declared)>MAX_UPLOAD)) throw new CatalogError('FILE_TOO_LARGE',413);
  const reader=request.body?.getReader();if(!reader)throw new CatalogError('FILE_EMPTY',422);
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;
    if(length>MAX_UPLOAD){await reader.cancel();throw new CatalogError('FILE_TOO_LARGE',413);}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
function shape(bytes: Uint8Array, type: string) {
  if(type==='application/pdf') {
    const start=new TextDecoder().decode(bytes.slice(0,8)),end=new TextDecoder().decode(bytes.slice(-2048));
    if(!/^%PDF-\d\.\d/.test(start)||!end.includes('%%EOF'))throw new CatalogError('FILE_FORMAT_INVALID');
    return {width:null,height:null};
  }
  if(type==='image/png') {
    const signature=[137,80,78,71,13,10,26,10];
    if(bytes.length<33||!signature.every((n,i)=>bytes[i]===n)||new TextDecoder().decode(bytes.slice(12,16))!=='IHDR')throw new CatalogError('FILE_FORMAT_INVALID');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return {width:view.getUint32(16),height:view.getUint32(20)};
  }
  if(type==='image/jpeg') {
    if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new CatalogError('FILE_FORMAT_INVALID');
    let pos=2;
    while(pos+4<bytes.length){
      if(bytes[pos]!==255)break;while(bytes[pos]===255)pos++;const marker=bytes[pos++]!;
      if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
      if(pos+2>bytes.length)break;const size=(bytes[pos]!<<8)|bytes[pos+1]!;
      if(size<2||pos+size>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8)
        return {height:(bytes[pos+3]!<<8)|bytes[pos+4]!,width:(bytes[pos+5]!<<8)|bytes[pos+6]!};
      pos+=size;
    }
  }
  throw new CatalogError('FILE_FORMAT_INVALID');
}
export function validateFile(input: unknown,bytes:Uint8Array) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new CatalogError('FILE_METADATA_INVALID');
  const data=input as Record<string,unknown>,kind=data.kind,type=data.contentType,name=data.filename;
  if(!['document','logo','image'].includes(String(kind))||typeof name!=='string'||!name.trim()||name.length>180||/[\x00-\x1f\x7f/\\]/.test(name))throw new CatalogError('FILE_METADATA_INVALID');
  const allowed=kind==='document'?['application/pdf']:kind==='logo'?['image/png','image/jpeg']:['image/png'];
  if(typeof type!=='string'||!allowed.includes(type))throw new CatalogError('FILE_TYPE_UNSUPPORTED',415);
  const max=kind==='document'?MAX_UPLOAD:5*1024*1024;
  if(!bytes.length)throw new CatalogError('FILE_EMPTY');if(bytes.length>max)throw new CatalogError('FILE_TOO_LARGE',413);
  const dimensions=shape(bytes,type);
  if(kind!=='document'&&(!dimensions.width||!dimensions.height||dimensions.width>8000||dimensions.height>8000))throw new CatalogError('FILE_DIMENSIONS_INVALID');
  if(kind==='image'&&(dimensions.width!==1080||dimensions.height!==1080))throw new CatalogError('IMAGE_MUST_BE_SQUARE');
  const source=data.sourceKey??null;
  if(source!==null&&(kind!=='document'||typeof source!=='string'||!/^([A-Z][A-Z0-9-]{0,63})$/.test(source)))throw new CatalogError('FILE_METADATA_INVALID');
  return {kind:String(kind),contentType:type,filename:name.trim(),sourceKey:source as string|null,...dimensions};
}
async function verifiedBytes(env:CloudBindings,row:Row) {
  if(!env.MEDIA)throw new CatalogError('STORAGE_NOT_CONFIGURED',503);
  const object=await env.MEDIA.get(String(row.storage_key));
  if(!object||object.size!==row.size_bytes||object.size>MAX_UPLOAD)throw new CatalogError('FILE_INTEGRITY_FAILED',409);
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.length!==row.size_bytes||await checksum(bytes)!==row.checksum)throw new CatalogError('FILE_INTEGRITY_FAILED',409);
  return bytes;
}
export async function uploadFile(env:CloudBindings,owner:OwnerSession,metadata:unknown,bytes:Uint8Array) {
  await readStatus(env);if(!env.MEDIA)throw new CatalogError('STORAGE_NOT_CONFIGURED',503);
  const info=validateFile(metadata,bytes),hash=await checksum(bytes),key='private/v1/'+info.kind+'/'+hash;
  const values=[crypto.randomUUID(),info.kind,info.filename,info.sourceKey,hash,key,info.contentType,bytes.length,info.width,info.height,owner.email,new Date().toISOString()];
  await env.DB!.prepare(`INSERT INTO cloud_library(id,kind,filename,source_key,checksum,storage_key,content_type,size_bytes,width,height,state,actor,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,'pending',?,? WHERE
    (SELECT count(*) FROM cloud_library)<? AND (SELECT coalesce(sum(size_bytes),0) FROM cloud_library)+?<=?
    AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
    ON CONFLICT(kind,checksum) DO NOTHING`).bind(...values,MAX_FILES,bytes.length,MAX_TOTAL).run();
  let row=(await query(env,'SELECT * FROM cloud_library WHERE kind=? AND checksum=?',info.kind,hash))[0];
  if(!row)throw new CatalogError('LIBRARY_QUOTA_OR_BUSY',409);
  if(row.state==='complete'){await verifiedBytes(env,row);return {file:model(row),reused:true};}
  // Conditional create never overwrites an object. If another retry created it, verify its bytes below.
  try {await env.MEDIA.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:info.contentType},customMetadata:{sha256:hash}});}
  catch {if(!await env.MEDIA.get(key))throw new CatalogError('STORAGE_WRITE_FAILED',503);}
  await verifiedBytes(env,row);
  if(!env.DB!.batch)throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);
  await env.DB!.batch([
    env.DB!.prepare(`UPDATE cloud_library SET state='complete' WHERE id=? AND state='pending'
      AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)`).bind(String(row.id)),
    env.DB!.prepare(`INSERT INTO assets(id,storage_key,checksum,content_type,width,height,size_bytes,status)
      SELECT 'library-'||id,storage_key,checksum,content_type,width,height,size_bytes,'complete'
      FROM cloud_library WHERE id=? AND kind='image' AND state='complete' ON CONFLICT(storage_key) DO NOTHING`).bind(String(row.id)),
  ]);
  row=(await query(env,'SELECT * FROM cloud_library WHERE id=?',String(row.id)))[0]!;
  if(row.state!=='complete')throw new CatalogError('LIBRARY_QUOTA_OR_BUSY',409);
  return {file:model(row),reused:false};
}
export async function downloadFile(env:CloudBindings,id:string) {
  await readStatus(env);
  const row=(await query(env,"SELECT * FROM cloud_library WHERE id=? AND state='complete'",id))[0];
  if(!row)throw new CatalogError('FILE_NOT_FOUND',404);
  const bytes=await verifiedBytes(env,row);
  return new Response(bytes,{headers:{'Content-Type':String(row.content_type),'Content-Length':String(bytes.length),
    'Content-Disposition':(row.kind==='document'?'attachment':'inline')+"; filename*=UTF-8''"+encodeURIComponent(String(row.filename)),
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; img-src 'self'; sandbox; frame-ancestors 'none'"}});
}
