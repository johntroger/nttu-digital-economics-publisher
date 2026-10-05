import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudFixture } from './helpers/cloud-fixture.mjs';
import { png,pdf } from './helpers/files.mjs';
import { library,uploadFile,downloadFile,validateFile,readUpload,MAX_UPLOAD } from '../src/cloud/storage.ts';
import { cloudCatalog,cloudPost,saveCloudCaption } from '../src/cloud/catalog.ts';
import worker from '../src/cloud/worker.ts';
import { SignJWT } from 'jose';
import { POLICY } from '../src/domain/policy.ts';
const owner={email:POLICY.ownerEmail,sub:'fixture-owner',csrf:'c'.repeat(64)};
const document={kind:'document',filename:'Tài liệu.pdf',contentType:'application/pdf',sourceKey:'BM03'};
const image={kind:'image',filename:'Ảnh bài.png',contentType:'image/png'};
test('Private upload verifies bytes, deduplicates and preserves completed metadata',async()=>{
  const f=cloudFixture();try{
    const uploaded=await uploadFile(f.env,owner,document,pdf);assert.equal(uploaded.file.state,'complete');assert.equal(f.objects.size,1);
    const duplicate=await uploadFile(f.env,owner,{...document,filename:'Tên khác.pdf'},pdf);assert.equal(duplicate.reused,true);assert.equal(duplicate.file.filename,document.filename);
    const response=await downloadFile(f.env,uploaded.file.id);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(response.headers.get('Content-Disposition'),/^attachment/);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),pdf);
    assert.throws(()=>f.db.prepare("UPDATE cloud_library SET filename='changed' WHERE id=?").run(uploaded.file.id));
    assert.throws(()=>f.db.prepare('DELETE FROM cloud_library WHERE id=?').run(uploaded.file.id));
  }finally{f.db.close();}
});
test('Pending upload recovers on retry and corrupted R2 bytes are never served',async()=>{
  const f=cloudFixture();try{
    f.controls.failPut=true;await assert.rejects(uploadFile(f.env,owner,document,pdf),{code:'STORAGE_WRITE_FAILED'});
    const pending=(await library(f.env)).files[0];assert.equal(pending.state,'pending');await assert.rejects(downloadFile(f.env,pending.id),{code:'FILE_NOT_FOUND'});
    f.controls.failPut=false;const complete=await uploadFile(f.env,owner,document,pdf);assert.equal(complete.file.id,pending.id);
    f.controls.corrupt=true;await assert.rejects(downloadFile(f.env,pending.id),{code:'FILE_INTEGRITY_FAILED'});
    await assert.rejects(uploadFile(f.env,owner,document,pdf),{code:'FILE_INTEGRITY_FAILED'});
  }finally{f.db.close();}
});
test('Upload validation rejects wrong magic, paths, unsupported types, dimensions and oversize streams',async()=>{
  assert.throws(()=>validateFile({...document,filename:'../file.pdf'},pdf));
  assert.throws(()=>validateFile({...document,contentType:'text/html'},pdf));
  assert.throws(()=>validateFile(document,new TextEncoder().encode('<script>attack</script>')));
  assert.throws(()=>validateFile(image,png(360,360)),{code:'IMAGE_MUST_BE_SQUARE'});
  assert.throws(()=>validateFile(image,new Uint8Array(5*1048576+1)),{code:'FILE_TOO_LARGE'});
  await assert.rejects(readUpload(new Request('https://example.invalid',{method:'POST',headers:{'Content-Length':String(MAX_UPLOAD+1)},body:'x'})),{code:'FILE_TOO_LARGE'});
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_UPLOAD));controller.enqueue(new Uint8Array(1));}});
  await assert.rejects(readUpload(new Request('https://example.invalid',{method:'POST',body:stream,duplex:'half'})),{code:'FILE_TOO_LARGE'});
});
test('Concurrent uploads of the same file reserve one record and image attachment creates a new version',async()=>{
  const f=cloudFixture();try{
    const bytes=png(),result=await Promise.all([uploadFile(f.env,owner,image,bytes),uploadFile(f.env,owner,image,bytes)]);
    assert.equal(result[0].file.id,result[1].file.id);assert.equal((await library(f.env)).files.length,1);
    const post=(await cloudCatalog(f.env)).posts[0],draft={expectedVersion:post.versionId,requestId:crypto.randomUUID(),title:post.title,body:post.body,sourceNote:''};
    await saveCloudCaption(f.env,owner,post.id,draft,false,result[0].file.id);
    const after=await cloudPost(f.env,post.id);assert.equal(after.version,2);assert.ok(after.imageUrl);assert.equal(after.ready,false);assert.equal(after.status,'needs_review');
    assert.equal(f.db.prepare('SELECT asset_id FROM post_versions WHERE id=?').get(post.versionId).asset_id,null);
    assert.equal((await saveCloudCaption(f.env,owner,post.id,draft,false,result[0].file.id)).replayed,true);
    await assert.rejects(saveCloudCaption(f.env,owner,post.id,{...draft,requestId:crypto.randomUUID()},false,result[0].file.id),{code:'VERSION_CONFLICT'});
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{f.db.close();}
});
test('File endpoints require owner auth and upload requires Origin plus CSRF',async()=>{
  const f=cloudFixture();try{
    const origin='https://nttu-publisher-staging.example.workers.dev';Object.assign(f.env,{AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only-secret',SESSION_SIGNING_KEY:'a'.repeat(64)});
    const jwt=await new SignJWT({email:owner.email,csrf:owner.csrf}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setSubject(owner.sub).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
    const headers={Cookie:'__Host-nttu_session='+jwt,Origin:origin,'X-CSRF-Token':owner.csrf,'Content-Type':'application/octet-stream','X-File-Metadata':encodeURIComponent(JSON.stringify(document))};
    assert.equal((await worker.fetch(new Request(origin+'/api/library'),f.env)).status,401);
    const rejected=await worker.fetch(new Request(origin+'/api/library/upload',{method:'POST',headers:{...headers,Origin:'https://other.invalid'},body:pdf}),f.env);assert.equal(rejected.status,403);assert.equal(f.objects.size,0);
    const saved=await worker.fetch(new Request(origin+'/api/library/upload',{method:'POST',headers,body:pdf}),f.env);assert.equal(saved.status,200);
    const file=(await saved.json()).file;
    assert.equal((await worker.fetch(new Request(origin+file.url),f.env)).status,401);
    assert.equal((await worker.fetch(new Request(origin+file.url,{headers:{Cookie:headers.Cookie}}),f.env)).status,200);
  }finally{f.db.close();}
});

test('Library quotas and maintenance block new uploads before any R2 write',async()=>{
  const f=cloudFixture();try {
    f.db.prepare("UPDATE application_state SET maintenance_owner='fixture'").run();
    await assert.rejects(uploadFile(f.env,owner,document,pdf));assert.equal(f.objects.size,0);
    f.db.prepare('UPDATE application_state SET maintenance_owner=NULL').run();
    const insert=f.db.prepare("INSERT INTO cloud_library(id,kind,filename,checksum,storage_key,content_type,size_bytes,state,actor,created_at) VALUES (?,'document','fixture.pdf',?,?,'application/pdf',12582912,'pending','fixture','fixture')");
    for(let i=0;i<9;i++)insert.run(String(i),i.toString(16).padStart(64,'0'),'fixture/'+i);
    await assert.rejects(uploadFile(f.env,owner,document,pdf),{code:'LIBRARY_QUOTA_OR_BUSY'});assert.equal(f.objects.size,0);
  }finally{f.db.close();}
  const missing=cloudFixture();try {delete missing.env.MEDIA;await assert.rejects(uploadFile(missing.env,owner,document,pdf),{code:'STORAGE_NOT_CONFIGURED'});assert.equal((await library(missing.env)).configured,false);}finally{missing.db.close();}
});
