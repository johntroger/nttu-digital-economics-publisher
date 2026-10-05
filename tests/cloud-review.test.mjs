import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {png,pdf} from './helpers/files.mjs';
import {createCloudReview,REVIEW_KEYS} from '../src/cloud/review.ts';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
import {checksum,uploadFile} from '../src/cloud/storage.ts';
import {cloudCatalog,cloudPost,saveCloudCaption} from '../src/cloud/catalog.ts';
import {POLICY} from '../src/domain/policy.ts';
import worker from '../src/cloud/worker.ts';
import {SignJWT} from 'jose';
import {composeCaption} from '../src/domain/footer.ts';
const owner={email:POLICY.ownerEmail,sub:'fixture-owner',csrf:'c'.repeat(64)};
const ref={id:'CAREER-01',pages:[1],section:'Mục thử',supports:'Căn cứ trong tài liệu.',adaptation:'Áp dụng vào bài tập sinh viên.'};
async function setup(group) {
  const f=cloudFixture(),registry=[{id:ref.id,name:'Tài liệu fixture',pages:2,sha256:await checksum(pdf),authority:'document'},SOURCE_REGISTRY.find(s=>s.id==='OWNER-2026')];
  const doc=await uploadFile(f.env,owner,{kind:'document',filename:'Fixture.pdf',contentType:'application/pdf',sourceKey:ref.id},pdf);
  const image=await uploadFile(f.env,owner,{kind:'image',filename:'Fixture.png',contentType:'image/png'},png());
  const post=(await cloudCatalog(f.env)).posts.find(p=>group?p.group===group:p.group!=='I');
  const save=(p,refs=[ref])=>saveCloudCaption(f.env,owner,p.id,{expectedVersion:p.versionId,requestId:crypto.randomUUID(),title:p.title,body:'Bài kiểm thử riêng: '+p.key,sourceNote:'Đã đối chiếu nguồn.',sourceRefs:refs},false,undefined,registry);
  await save(post);const active=await cloudPost(f.env,post.id);
  await saveCloudCaption(f.env,owner,post.id,{expectedVersion:active.versionId,requestId:crypto.randomUUID(),title:active.title,body:active.body,sourceNote:active.sourceNote},false,image.file.id,registry);
  return {...f,registry,doc,image,postId:post.id,save,service:()=>createCloudReview(f.env,registry)};
}
const reviewInput=audit=>({requestId:crypto.randomUUID(),expectedVersion:audit.versionId,expectedCheck:audit.checkVersion,rubric:Object.fromEntries(REVIEW_KEYS.map(key=>[key,true]))});
test('Cloud source references enforce pages, checksums and immutable provenance per version',async()=>{
  const f=await setup();try {
    const service=f.service();assert.equal((await service.listSources())[0].available,true);
    const preview=await service.openPDF(ref.id);assert.match(preview.headers.get('Content-Disposition'),/^inline/);assert.equal(preview.headers.get('Cache-Control'),'private, no-store');assert.deepEqual(new Uint8Array(await preview.arrayBuffer()),pdf);
    for(const invalid of [{...ref,pages:[]},{...ref,pages:[3]},{...ref,pages:[1,1]},{...ref,pages:[1.5]},{...ref,id:'UNKNOWN'},{...ref,id:'OWNER-2026',pages:[1]}])await assert.rejects(service.resolveReferences([invalid]));
    const old=await cloudPost(f.env,f.postId),oldCount=f.db.prepare('SELECT count(*) n FROM version_sources WHERE version_id=?').get(old.versionId).n;
    await f.save(old,[]);const after=await cloudPost(f.env,f.postId);assert.deepEqual(after.sourceRefs,[]);assert.equal(after.imageUrl,null);
    assert.equal(f.db.prepare('SELECT count(*) n FROM version_sources WHERE version_id=?').get(old.versionId).n,oldCount);
    assert.equal(f.db.prepare('SELECT count(*) n FROM version_sources WHERE version_id=?').get(after.versionId).n,0);
    f.controls.corrupt=true;await assert.rejects(service.resolveReferences([ref]),{code:'SOURCE_FILE_CHANGED'});
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{f.db.close();}
});
test('A source or image blocked after audit cannot receive a review or lose its block in the D1 batch',async()=>{
  for(const target of ['source','image']){
    const f=await setup();try {
      const audit=await f.service().auditPost(f.postId),batch=f.env.DB.batch;
      f.env.DB.batch=async statements=>{
        if(target==='source')f.db.prepare("UPDATE sources SET status='blocked' WHERE authority='document' AND id IN (SELECT source_id FROM version_sources WHERE version_id=?)").run(audit.versionId);
        else f.db.prepare("UPDATE assets SET status='blocked' WHERE id=?").run('library-'+f.image.file.id);
        return batch(statements);
      };
      await assert.rejects(f.service().reviewPost(f.postId,owner,reviewInput(audit)),{code:'VERSION_CONFLICT_OR_BUSY'});
      assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_review_requests').get().n,0);
      if(target==='source')assert.equal(f.db.prepare("SELECT count(*) n FROM sources WHERE status='blocked'").get().n,1);
    }finally{f.db.close();}
  }
});
test('Owner review pins version, source, image and footer, retries safely and never creates publishing readiness',async()=>{
  const f=await setup();try {
    const audit=await f.service().auditPost(f.postId);assert.deepEqual(audit.issues,[]);assert.equal(audit.reviewed,false);
    const input=reviewInput(audit);await assert.rejects(f.service().reviewPost(f.postId,owner,{...input,rubric:{accuracy:true}}),{code:'REVIEW_INCOMPLETE'});
    const review=await f.service().reviewPost(f.postId,owner,input);assert.equal(review.replayed,false);
    assert.equal((await f.service().reviewPost(f.postId,owner,input)).replayed,true);
    const after=await f.service().auditPost(f.postId);assert.equal(after.reviewed,true);assert.equal(after.ready,false);
    assert.equal((await cloudPost(f.env,f.postId)).status,'needs_review');assert.equal(f.db.prepare('SELECT count(*) n FROM content_checks').get().n,0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM publish_jobs').get().n,0);
    assert.throws(()=>f.db.prepare("UPDATE cloud_reviews SET reviewer='changed'").run());assert.throws(()=>f.db.prepare('DELETE FROM cloud_reviews').run());
    const active=await cloudPost(f.env,f.postId);await f.save(active);await assert.rejects(f.service().reviewPost(f.postId,owner,{...input,requestId:crypto.randomUUID()}),{code:'VERSION_CONFLICT'});
    const latest=await f.service().auditPost(f.postId);assert.equal(latest.reviewed,false);assert.ok(latest.issues.some(i=>i.code==='IMAGE_NOT_CURRENT'));
  }finally{f.db.close();}
});
test('Review detects corrupted files, blocked sources, published duplicates and program confirmation requirements',async()=>{
  const f=await setup('I');try {
    assert.ok((await f.service().auditPost(f.postId)).issues.some(i=>i.code==='PROGRAM_SOURCE_REQUIRED'));
    const active=await cloudPost(f.env,f.postId),programRegistry=[...f.registry,{id:'BM03',name:'CTĐT fixture',pages:2,sha256:await checksum(pdf),authority:'document'}];
    // Same bytes with another source code are deduplicated; a different code cannot relabel an immutable file.
    await assert.rejects(createCloudReview(f.env,programRegistry).resolveReferences([{...ref,id:'BM03'}]),{code:'SOURCE_FILE_UNAVAILABLE'});
    f.db.prepare("UPDATE sources SET status='blocked' WHERE authority='document' AND id IN (SELECT source_id FROM version_sources WHERE version_id=?)").run(active.versionId);
    assert.ok((await f.service().auditPost(f.postId)).issues.some(i=>i.code==='SOURCE_BLOCKED'));
    f.controls.corrupt=true;const broken=await f.service().auditPost(f.postId);assert.ok(broken.issues.some(i=>i.code==='SOURCE_FILE_CHANGED'));assert.ok(broken.issues.some(i=>i.code==='IMAGE_FILE_CHANGED'));
  }finally{f.db.close();}
  const g=await setup();try {
    const audit=await g.service().auditPost(g.postId);await g.service().reviewPost(g.postId,owner,reviewInput(audit));
    const body=(await cloudPost(g.env,g.postId)).body;
    const historical={...g.env,DB:{...g.env.DB,prepare(sql){if(sql==='SELECT caption_snapshot FROM publications')return {bind(){return this;},async all(){return {results:[{caption_snapshot:composeCaption(body).replace('1900 2039','hotline phiên bản cũ')}]};}};return g.env.DB.prepare(sql);}}};
    assert.ok((await createCloudReview(historical,g.registry).auditPost(g.postId)).issues.some(i=>i.code==='DUPLICATE_PUBLISHED_CAPTION'));
    const key=g.db.prepare('SELECT storage_key FROM cloud_library WHERE id=?').get(g.doc.file.id).storage_key;g.objects.delete(key);
    const changed=await g.service().auditPost(g.postId);assert.equal(changed.reviewed,false);assert.ok(changed.issues.some(i=>i.code==='SOURCE_FILE_CHANGED'));
  }finally{g.db.close();}
});
test('Program references require official PDF plus owner confirmation and warehouse audit stays within free query budget',async()=>{
  const f=await setup('I');try {
    const programPDF=new TextEncoder().encode('%PDF-1.7\n% Program fixture\n%%EOF'),program={id:'BM03',name:'CTĐT fixture',pages:2,sha256:await checksum(programPDF),authority:'document'},registry=[...f.registry,program];
    await uploadFile(f.env,owner,{kind:'document',filename:'Program.pdf',contentType:'application/pdf',sourceKey:'BM03'},programPDF);
    const active=await cloudPost(f.env,f.postId);
    await saveCloudCaption(f.env,owner,f.postId,{expectedVersion:active.versionId,requestId:crypto.randomUUID(),title:active.title,body:active.body,sourceNote:'Khóa 2026, 3,5 năm.',sourceRefs:[{...ref,id:'BM03'},{...ref,id:'OWNER-2026',pages:[]}]},false,undefined,registry);
    const saved=await cloudPost(f.env,f.postId);await saveCloudCaption(f.env,owner,f.postId,{expectedVersion:saved.versionId,requestId:crypto.randomUUID(),title:saved.title,body:saved.body,sourceNote:saved.sourceNote},false,f.image.file.id);
    assert.deepEqual((await createCloudReview(f.env,registry).auditPost(f.postId)).issues,[]);
    let queries=0;const bounded={...f.env,DB:{...f.env.DB,prepare(sql){queries++;if(queries>50)throw Error('Free plan query limit');return f.env.DB.prepare(sql);}}};
    const all=await createCloudReview(bounded,registry).warehouseAudit();assert.equal(all.total,40);assert.equal(all.canReview,1);assert.ok(queries<=12);
  }finally{f.db.close();}
});
test('Concurrent reviews yield one receipt and maintenance forbids review',async()=>{
  const f=await setup();try {
    const audit=await f.service().auditPost(f.postId),input=reviewInput(audit);
    const competing={...input,requestId:crypto.randomUUID()};
    const results=await Promise.all([f.service().reviewPost(f.postId,owner,input),f.service().reviewPost(f.postId,owner,competing)]);
    assert.equal(results[0].reviewId,results[1].reviewId);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_review_requests').get().n,2);
    await assert.rejects(f.service().reviewPost(f.postId,owner,{...competing,expectedCheck:99}),{code:'REQUEST_REUSED'});
    await assert.rejects(f.service().reviewPost(f.postId,owner,{...input,expectedCheck:99}),{code:'REQUEST_REUSED'});
  }finally{f.db.close();}
  const g=await setup();try {g.db.prepare("UPDATE application_state SET maintenance_owner='fixture' WHERE environment='staging'").run();const audit=await g.service().auditPost(g.postId);await assert.rejects(g.service().reviewPost(g.postId,owner,reviewInput(audit)),{code:'VERSION_CONFLICT_OR_BUSY'});assert.equal(g.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,0);}finally{g.db.close();}
});
test('Cloud source and audit routes require owner; review rejects missing CSRF before writing',async()=>{
  const f=cloudFixture();try {
    const origin='https://nttu-publisher-staging.example.workers.dev';Object.assign(f.env,{AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret',SESSION_SIGNING_KEY:'a'.repeat(64)});
    const jwt=await new SignJWT({email:owner.email,csrf:owner.csrf}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setSubject(owner.sub).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
    for(const path of ['/api/sources','/api/audit','/api/sources/BM03/pdf'])assert.equal((await worker.fetch(new Request(origin+path),f.env)).status,401);
    const cookie='__Host-nttu_session='+jwt;
    const sources=await worker.fetch(new Request(origin+'/api/sources',{headers:{Cookie:cookie}}),f.env);assert.equal(sources.status,200);assert.equal((await sources.json()).length,14);
    const post=(await cloudCatalog(f.env)).posts[0];
    const response=await worker.fetch(new Request(origin+'/api/posts/'+post.id+'/review',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:'{}'}),f.env);assert.equal(response.status,403);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,0);
    const all=await createCloudReview(f.env).warehouseAudit();assert.equal(all.total,40);assert.equal(all.canReview,0);
  }finally{f.db.close();}
});
