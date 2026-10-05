import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {png,pdf} from './helpers/files.mjs';
import {uploadFile} from '../src/cloud/storage.ts';
import {cloudCatalog,cloudPost,saveCloudCaption} from '../src/cloud/catalog.ts';
import {BACKUP_SCHEMA} from '../src/cloud/backup-schema.ts';
import {createBackup,continueBackup,listBackups,backupManifest,backupFile,checkBackup} from '../src/cloud/backups.ts';
import {verifyCloudBundle,restoreCloudBundle} from '../scripts/cloud-backup-restore.mjs';
import {crc32,storedZip} from '../ui/cloud/zip.js';
import worker from '../src/cloud/worker.ts';
import {SignJWT} from 'jose';
import {POLICY} from '../src/domain/policy.ts';
const owner={email:POLICY.ownerEmail,sub:'backup-fixture',csrf:'c'.repeat(64)};
async function setup(){const f=cloudFixture();f.env.ASSETS={async fetch(request){const path=new URL(request.url).pathname.slice(1);return BACKUP_SCHEMA.extra.some(r=>r.path===path)?new Response(readFileSync('assets/'+path)):new Response('',{status:404});}};await uploadFile(f.env,owner,{kind:'document',filename:'Fixture.pdf',sourceKey:'BM03',contentType:'application/pdf'},pdf);const image=await uploadFile(f.env,owner,{kind:'image',filename:'Fixture.png',contentType:'image/png'},png());const post=(await cloudCatalog(f.env)).posts[0];await saveCloudCaption(f.env,owner,post.id,{requestId:crypto.randomUUID(),expectedVersion:post.versionId,title:'Bài được sao lưu',body:'Nội dung riêng của bản sao, không phải đề cương.',sourceNote:'Fixture'},false,image.file.id);f.post=await cloudPost(f.env,post.id);return f;}
async function finish(f,backup){for(let n=0;n<265;n++){backup=await continueBackup(f.env,backup.id,owner);if(backup.state==='complete')return backup;}throw Error('fixture backup stuck');}
export async function materializeBundle(f,id){const manifest=await backupManifest(f.env,id),bundle='tmp/tests/cloud-bundle-'+crypto.randomUUID();mkdirSync(bundle,{recursive:true});for(const [i,file] of manifest.files.entries()){const output=join(bundle,file.path);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,new Uint8Array(await(await backupFile(f.env,id,i)).arrayBuffer()));}writeFileSync(join(bundle,'manifest.json'),JSON.stringify(manifest));return bundle;}
test('Cloud snapshot captures all business tables atomically within 50 D1 queries and never changes after caption edits',async()=>{
  const f=await setup();try{let queries=0;const original=f.env.DB.prepare;f.env.DB.prepare=sql=>{queries++;return original(sql);};const request={requestId:crypto.randomUUID()},backup=await createBackup(f.env,owner,request);assert.ok(queries<=50,queries+' queries');assert.equal(backup.counts.posts,40);assert.equal(backup.state,'building');
    const pinned=f.db.prepare('SELECT snapshot_json FROM cloud_backups WHERE id=?').get(backup.id).snapshot_json;
    await saveCloudCaption(f.env,owner,f.post.id,{requestId:crypto.randomUUID(),expectedVersion:f.post.versionId,title:f.post.title,body:f.post.body+' Sửa sau snapshot.',sourceNote:f.post.sourceNote});
    assert.equal((await createBackup(f.env,owner,request)).id,backup.id);assert.equal(f.db.prepare('SELECT snapshot_json FROM cloud_backups WHERE id=?').get(backup.id).snapshot_json,pinned);
    const complete=await finish(f,backup);assert.equal(complete.files,8);assert.equal(complete.copied,8);assert.equal((await backupManifest(f.env,backup.id)).counts.versions,41);
    assert.throws(()=>f.db.prepare("UPDATE cloud_backups SET snapshot_json='{}' WHERE id=?").run(backup.id));assert.throws(()=>f.db.prepare('DELETE FROM cloud_backups WHERE id=?').run(backup.id));
    assert.equal(JSON.parse(new TextDecoder().decode(await(await backupFile(f.env,backup.id,0)).arrayBuffer())).tables.post_versions.some(v=>v.body.includes('Sửa sau snapshot')),false);
  }finally{f.db.close();}
});
test('Failed copy resumes, simultaneous copy has one progress increment, and corrupt backup is not downloadable or verified',async()=>{
  const f=await setup();try{const backup=await createBackup(f.env,owner,{requestId:crypto.randomUUID()});f.controls.failPut=true;await assert.rejects(continueBackup(f.env,backup.id,owner),{code:'BACKUP_WRITE_FAILED'});assert.equal(f.db.prepare('SELECT next_index FROM cloud_backups WHERE id=?').get(backup.id).next_index,0);
    f.controls.failPut=false;await Promise.all([continueBackup(f.env,backup.id,owner),continueBackup(f.env,backup.id,owner)]);assert.equal(f.db.prepare('SELECT next_index FROM cloud_backups WHERE id=?').get(backup.id).next_index,1);
    await finish(f,backup);const request={requestId:crypto.randomUUID()};let report;for(let n=0;n<10;n++){report=await checkBackup(f.env,backup.id,request);if(report.verified)break;}assert.equal(report.verified,true);assert.equal((await checkBackup(f.env,backup.id,request)).checkedAt,report.checkedAt);
    const manifest=await backupManifest(f.env,backup.id),key='backups/v1/'+backup.id+'/'+manifest.files[1].path;f.objects.get(key).fill(0);
    await assert.rejects(backupFile(f.env,backup.id,1),{code:'BACKUP_INTEGRITY_FAILED'});const next={requestId:crypto.randomUUID()};await checkBackup(f.env,backup.id,next);await assert.rejects(checkBackup(f.env,backup.id,next),{code:'BACKUP_INTEGRITY_FAILED'});
    assert.equal(f.db.prepare('SELECT completed_at FROM cloud_backup_checks WHERE id=?').get(next.requestId).completed_at,null);
  }finally{f.db.close();}
});
test('Backups reject maintenance, pending files, unknown schema and quota; incomplete manifests cannot be downloaded',async()=>{
  const f=await setup();try{f.db.prepare("UPDATE application_state SET maintenance_owner='fixture' WHERE environment='staging'").run();await assert.rejects(createBackup(f.env,owner,{requestId:crypto.randomUUID()}),{code:'BACKUP_BUSY'});f.db.prepare("UPDATE application_state SET maintenance_owner=NULL WHERE environment='staging'").run();
    f.controls.failPut=true;await assert.rejects(uploadFile(f.env,owner,{kind:'logo',filename:'Pending.png',contentType:'image/png'},png(500,500)));f.controls.failPut=false;
    await assert.rejects(createBackup(f.env,owner,{requestId:crypto.randomUUID()}),{code:'BACKUP_PENDING_FILES'});
    await uploadFile(f.env,owner,{kind:'logo',filename:'Pending.png',contentType:'image/png'},png(500,500));f.db.exec('CREATE TABLE unexpected(x TEXT)');await assert.rejects(createBackup(f.env,owner,{requestId:crypto.randomUUID()}),{code:'BACKUP_SCHEMA_UNSUPPORTED'});f.db.exec('DROP TABLE unexpected');
    const backup=await createBackup(f.env,owner,{requestId:crypto.randomUUID()});await assert.rejects(backupManifest(f.env,backup.id),{code:'BACKUP_INCOMPLETE'});
    while(f.db.prepare('SELECT count(*) n FROM cloud_backups').get().n<10)await createBackup(f.env,owner,{requestId:crypto.randomUUID()});await assert.rejects(createBackup(f.env,owner,{requestId:crypto.randomUUID()}),{code:'BACKUP_QUOTA_OR_BUSY'});
  }finally{f.db.close();}
});
test('Downloaded cloud data restores to a separate trusted SQLite schema with all assets, preserved history and quarantine',async()=>{
  const f=await setup();try{const complete=await finish(f,await createBackup(f.env,owner,{requestId:crypto.randomUUID()})),bundle=await materializeBundle(f,complete.id);assert.equal(verifyCloudBundle(bundle).manifest.counts.posts,40);
    const request={bundle,requestId:crypto.randomUUID(),confirmQuarantine:true},restored=restoreCloudBundle(request);assert.equal(restored.quarantined,true);assert.equal(restored.remoteModified,false);assert.equal(restoreCloudBundle(request).replayed,true);
    const db=new DatabaseSync(restored.database,{readOnly:true});try{assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,40);assert.equal(db.prepare('SELECT count(*) n FROM post_versions').get().n,41);assert.equal(db.prepare("SELECT count(*) n FROM post_versions WHERE status!='quarantined'").get().n,0);assert.equal(db.prepare("SELECT paused_by_user,blocked_reasons FROM application_state WHERE environment='staging'").get().paused_by_user,1);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{db.close();}
    assert.equal((await cloudPost(f.env,f.post.id)).status,'needs_review');assert.equal(f.db.prepare('SELECT count(*) n FROM editor_requests').get().n,1);
    writeFileSync(join(bundle,'extra.txt'),'unexpected');assert.throws(()=>restoreCloudBundle({...request,requestId:crypto.randomUUID()}),{code:'BACKUP_FILES_MISSING_OR_EXTRA'});
  }finally{f.db.close();}
});
test('Recovery refuses checksum corruption, unsafe paths, missing resources and absent quarantine confirmation',async()=>{
  const f=await setup();try{const backup=await finish(f,await createBackup(f.env,owner,{requestId:crypto.randomUUID()})),bundle=await materializeBundle(f,backup.id),manifest=JSON.parse(readFileSync(bundle+'/manifest.json','utf8'));assert.throws(()=>restoreCloudBundle({bundle,requestId:crypto.randomUUID()}),{code:'BACKUP_RESTORE_CONFIRMATION_REQUIRED'});
    writeFileSync(bundle+'/database.json','{}');assert.throws(()=>verifyCloudBundle(bundle),{code:'BACKUP_INTEGRITY_FAILED'});
    manifest.files[0].path='../outside';writeFileSync(bundle+'/manifest.json',JSON.stringify(manifest));assert.throws(()=>verifyCloudBundle(bundle),{code:'BACKUP_MANIFEST_INVALID'});
  }finally{f.db.close();}
});
test('ZIP uses known standard CRC32, refuses traversal/duplicates and produces the expected archive headers',async()=>{
  const bytes=new TextEncoder().encode('123456789');assert.equal(crc32(bytes),0xcbf43926);assert.throws(()=>storedZip([{path:'../unsafe',bytes}]));assert.throws(()=>storedZip([{path:'safe',bytes},{path:'safe',bytes}]));const archive=new Uint8Array(await storedZip([{path:'database.json',bytes}]).arrayBuffer()),view=new DataView(archive.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(14,true),0xcbf43926);assert.equal(view.getUint32(archive.length-22,true),0x06054b50);
});
test('Resuming a previously uninitialized backup stays within the free D1 invocation query budget',async()=>{
  const f=await setup();try{const requestId=crypto.randomUUID();f.db.exec('CREATE TABLE unexpected(x TEXT)');await assert.rejects(createBackup(f.env,owner,{requestId}),{code:'BACKUP_SCHEMA_UNSUPPORTED'});f.db.exec('DROP TABLE unexpected');let queries=0;const original=f.env.DB.prepare;f.env.DB.prepare=sql=>{queries++;return original(sql);};const resumed=await continueBackup(f.env,'backup-'+requestId,owner);assert.ok(queries<=50,queries+' queries');assert.equal(resumed.files,8);assert.equal(resumed.copied,0);}finally{f.db.close();}
});
test('Recovery rejects a dangling foreign key even when archive JSON hashes were recomputed',async()=>{
  const f=await setup();try{const backup=await finish(f,await createBackup(f.env,owner,{requestId:crypto.randomUUID()})),bundle=await materializeBundle(f,backup.id),snapshot=JSON.parse(readFileSync(bundle+'/database.json','utf8')),manifest=JSON.parse(readFileSync(bundle+'/manifest.json','utf8'));
    snapshot.tables.post_versions.find(v=>v.asset_id).asset_id='missing-asset';const bytes=Buffer.from(JSON.stringify(snapshot));writeFileSync(bundle+'/database.json',bytes);Object.assign(manifest.files[0],{size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});writeFileSync(bundle+'/manifest.json',JSON.stringify(manifest));assert.throws(()=>restoreCloudBundle({bundle,requestId:crypto.randomUUID(),confirmQuarantine:true}),{code:'BACKUP_DATABASE_INVALID'});
  }finally{f.db.close();}
});
test('Backup scripts, metadata and downloads require Google owner; mutations require Origin and CSRF',async()=>{
  const f=cloudFixture();try{const origin='https://nttu-publisher-staging.example.workers.dev';Object.assign(f.env,{AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret',SESSION_SIGNING_KEY:'a'.repeat(64)});for(const path of ['/api/backups','/api/backups/create','/backups.js','/zip.js'])assert.equal((await worker.fetch(new Request(origin+path),f.env)).status,401);
    const jwt=await new SignJWT({email:owner.email,csrf:owner.csrf}).setSubject(owner.sub).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));const headers={Cookie:'__Host-nttu_session='+jwt,'Content-Type':'application/json'};
    assert.equal((await worker.fetch(new Request(origin+'/api/backups/create',{method:'POST',headers,body:'{}'}),f.env)).status,403);assert.equal((await worker.fetch(new Request(origin+'/api/backups',{headers}),f.env)).status,200);assert.equal((await worker.fetch(new Request(origin+'/api/backups/backup-'+crypto.randomUUID()+'/continue',{headers}),f.env)).status,405);
  }finally{f.db.close();}
});
