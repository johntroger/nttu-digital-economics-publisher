// Explicit administrative import from private local files. Never run in GitHub Actions.
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, basename, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSourceLibrary } from './source-library.mjs';
import { checksum, validateFile } from '../src/cloud/storage.ts';
import { prepareCloud } from './cloud-prepare.mjs';

export function parseD1Output(output) {
  // Wrangler --json still prefixes file-upload progress on stdout.
  const match=output.match(/(?:^|\n)(\[\s*\{[\s\S]*\])\s*$/);
  if(!match)throw new Error('D1 did not return a JSON result');
  const data=JSON.parse(match[1]);
  if(!Array.isArray(data)||!data.length||data.some(r=>r.success!==true||!Array.isArray(r.results)))throw new Error('D1 import failed');
  return data.flatMap(r=>r.results);
}

export async function privateImportFiles() {
  const manifest=JSON.parse(readFileSync('content/samples-2026-v1.manifest.json','utf8'));
  const report=JSON.parse(readFileSync('assets/samples/v1/render-report.json','utf8'));
  const sources=createSourceLibrary(), files=[];
  for(const source of sources.list().filter(s=>s.pdfUrl)) {
    if(!source.available)throw new Error('Source checksum unavailable: '+source.id);
    files.push({metadata:{kind:'document',filename:source.name,contentType:'application/pdf',sourceKey:source.id},bytes:sources.pdf(source.id)});
  }
  const assetRoot=realpathSync('assets');
  const readAsset=path=>{const resolved=realpathSync(path),rel=relative(assetRoot,resolved);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Private asset path escaped');return readFileSync(resolved);};
  for(const logo of manifest.renderInputs.logos) {
    if(!['nttu.png','fba.png','digital-economics.jpg'].includes(logo.file))throw new Error('Unexpected logo');
    const bytes=readAsset('assets/brand/originals/'+logo.file);
    if(await checksum(bytes)!==logo.sha256)throw new Error('Logo checksum changed');
    files.push({metadata:{kind:'logo',filename:logo.file,contentType:logo.file.endsWith('.jpg')?'image/jpeg':'image/png'},bytes});
  }
  for(const sample of report.samples) {
    if(!/^P\d{2}$/.test(sample.id))throw new Error('Unexpected sample ID');
    const bytes=readAsset('assets/samples/v1/'+sample.id+'.png');
    if(await checksum(bytes)!==sample.sha256||manifest.samples.find(s=>s.id===sample.id)?.image_sha256!==sample.sha256)throw new Error('Sample checksum changed');
    files.push({metadata:{kind:'image',filename:sample.id+'.png',contentType:'image/png'},bytes});
  }
  if(files.length!==21)throw new Error('Expected 13 documents, 3 logos, 5 images');
  return Promise.all(files.map(async file=>({...file,info:validateFile(file.metadata,file.bytes),sha:await checksum(file.bytes)})));
}

export async function importPrivateAssets() {
  if(process.env.CI)throw new Error('Private import must run only on the owner workstation');
  if(!process.env.STAGING_D1_DATABASE_ID)throw new Error('Explicit staging D1 ID required');
  const files=await privateImportFiles(), directory=resolve('tmp/step-14/import');mkdirSync(directory,{recursive:true});
  const {directory:prepared}=prepareCloud({databaseId:process.env.STAGING_D1_DATABASE_ID,output:'tmp/step-14/import/config',storageEnabled:true});
  const config=resolve(prepared,'wrangler.json'),cli=resolve('node_modules/wrangler/bin/wrangler.js');
  const run=args=>{const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(result.status!==0)throw new Error('Private import CLI operation failed: '+args.slice(0,3).join(' '));return result.stdout;};
  // --file uses D1 bulk import and does not return SELECT rows. Direct argv is not a shell.
  const sql=text=>parseD1Output(run(['d1','execute','DB','--remote','--config',config,'--command',text,'--json']));
  const state=sql("SELECT environment,paused_by_user,maintenance_owner FROM application_state WHERE environment='staging';");
  if(state.length!==1||state[0].environment!=='staging'||state[0].paused_by_user!==1||state[0].maintenance_owner!==null)throw new Error('Staging must be paused and idle');
  // Require the deployed storage migration before uploading any bytes.
  sql('SELECT id FROM cloud_library LIMIT 1;');
  const bucket='nttu-publisher-staging-assets',quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'",evidence=[];
  for(const file of files) {
    const {info,bytes,sha}=file,key='private/v1/'+info.kind+'/'+sha,local=resolve(directory,sha+'.input'),readback=resolve(directory,sha+'.readback');
    writeFileSync(local,bytes);
    // List is bounded to this exact hash key. Existing objects are verified and never overwritten.
    const existing=sql(`SELECT * FROM cloud_library WHERE kind=${quote(info.kind)} AND checksum=${quote(sha)};`)[0];
    if(existing && (existing.storage_key!==key||existing.size_bytes!==bytes.length))throw new Error('Existing metadata mismatch');
    const id=existing?.id??randomUUID();
    if(!existing)sql(`INSERT INTO cloud_library(id,kind,filename,source_key,checksum,storage_key,content_type,size_bytes,width,height,state,actor,created_at)
      SELECT ${[id,info.kind,info.filename,info.sourceKey,sha,key,info.contentType,bytes.length,info.width,info.height,'pending','tranthanhtung37@gmail.com',new Date().toISOString()].map(quote).join(',')}
      WHERE (SELECT count(*) FROM cloud_library)<256 AND (SELECT coalesce(sum(size_bytes),0) FROM cloud_library)+${bytes.length}<=104857600
      AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
      ON CONFLICT(kind,checksum) DO NOTHING;`);
    const reserved=sql(`SELECT * FROM cloud_library WHERE kind=${quote(info.kind)} AND checksum=${quote(sha)};`)[0];
    if(!reserved)throw new Error('Import quota or maintenance block');
    // Wrangler cannot conditionally put. A missing object is uploaded only after an explicit 404.
    const get=spawnSync(process.execPath,[cli,'r2','object','get',bucket+'/'+key,'--remote','--file',readback],{encoding:'utf8',timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    if(get.status!==0) {
      if(reserved.state==='complete'||!/(404|object does not exist|object not found|specified key does not exist)/i.test(get.stdout+get.stderr))throw new Error('Cannot verify existing R2 object; import stopped');
      run(['r2','object','put',bucket+'/'+key,'--remote','--file',local,'--content-type',info.contentType]);
      run(['r2','object','get',bucket+'/'+key,'--remote','--file',readback]);
    }
    if(!existsSync(readback)||await checksum(readFileSync(readback))!==sha)throw new Error('R2 readback checksum failed');
    sql(`UPDATE cloud_library SET state='complete' WHERE id=${quote(reserved.id)} AND state='pending'
      AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL);
      INSERT INTO assets(id,storage_key,checksum,content_type,width,height,size_bytes,status)
      SELECT 'library-'||id,storage_key,checksum,content_type,width,height,size_bytes,'complete' FROM cloud_library
      WHERE id=${quote(reserved.id)} AND state='complete' AND kind='image' ON CONFLICT(storage_key) DO NOTHING;`);
    const completed=sql(`SELECT id,state,checksum FROM cloud_library WHERE id=${quote(reserved.id)};`)[0];
    if(completed?.state!=='complete'||completed.checksum!==sha)throw new Error('Metadata completion failed');
    evidence.push({id:reserved.id,kind:info.kind,filename:info.filename,sha,size:bytes.length});
    writeFileSync(resolve(directory,'evidence.json'),JSON.stringify(evidence,null,2));
    console.log('Verified private file '+evidence.length+'/'+files.length+': '+basename(info.filename));
  }
  console.log('Private import complete; no captions, reviews, schedules or publishing settings changed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await importPrivateAssets();
