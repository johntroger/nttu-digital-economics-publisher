import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {png} from './helpers/files.mjs';
import {DESIGN_REGISTRY} from '../src/cloud/design-registry.ts';
import {validateDesign,designResources,saveArtwork,contrast} from '../src/cloud/artwork.ts';
import {validateSpec} from '../ui/cloud/artwork.js';
import {checksum,uploadFile} from '../src/cloud/storage.ts';
import {cloudPost,cloudCatalog,saveCloudCaption} from '../src/cloud/catalog.ts';
import worker from '../src/cloud/worker.ts';
import {POLICY} from '../src/domain/policy.ts';
import {SignJWT} from 'jose';
const owner={email:POLICY.ownerEmail,sub:'artwork-fixture',csrf:'c'.repeat(64)};
const spec={layout:'infographic',motif:'network',headline:'Ba bước xây dựng hồ sơ năng lực',points:['Chọn một vấn đề cụ thể','Làm thử và kiểm chứng kết quả','Ghi lại điều học được'],note:'Thực hành nhỏ, bằng chứng rõ',paper:'#F2F6FA',ink:'#163348',accent:'#07559D'};
async function setup(){const f=cloudFixture();f.registry=structuredClone(DESIGN_REGISTRY);for(const [i,logo] of f.registry.logos.entries()){const bytes=png(500+i*100,500);logo.sha256=await checksum(bytes);await uploadFile(f.env,owner,{kind:'logo',filename:logo.file,contentType:'image/png'},bytes);}const post=(await cloudCatalog(f.env)).posts[0];await saveCloudCaption(f.env,owner,post.id,{requestId:crypto.randomUUID(),expectedVersion:post.versionId,title:'Hồ sơ năng lực',body:'Một caption đã biên tập để xây dựng hồ sơ năng lực.',sourceNote:'Đối chiếu cẩm nang.'});f.post=await cloudPost(f.env,post.id);return f;}
const metadata=f=>({requestId:crypto.randomUUID(),expectedVersion:f.post.versionId,spec});
test('Canvas and server reject unsupported glyphs, missing points, multiline text and low contrast',()=>{
  assert.ok(contrast(spec.ink,spec.paper)>4.5);assert.deepEqual(validateDesign(spec).points,spec.points);assert.doesNotThrow(()=>validateSpec(spec,DESIGN_REGISTRY));
  for(const d of [{...spec,ink:'#f2f6fa'},{...spec,points:['Only one']},{...spec,headline:'Học\nAI'},{...spec,headline:'Học 📚'},{...spec,accent:'#zzzzzz'},{...spec,layout:'unknown'}]){assert.throws(()=>validateDesign(d));assert.throws(()=>validateSpec(d,DESIGN_REGISTRY));}
  assert.deepEqual(validateDesign({...spec,layout:'illustration',points:[]}).points,[]);
});
test('Artwork requires all pinned logos and verified R2 bytes before creating a post version',async()=>{
  const f=await setup();try{
    const resources=await designResources(f.env,true,f.registry);assert.equal(resources.logos.filter(l=>l.available).length,3);
    f.controls.corrupt=true;await assert.rejects(saveArtwork(f.env,owner,f.post.id,metadata(f),png(),f.registry),{code:'FILE_INTEGRITY_FAILED'});f.controls.corrupt=false;
    const registry=structuredClone(f.registry);registry.logos[0].sha256='a'.repeat(64);await assert.rejects(saveArtwork(f.env,owner,f.post.id,metadata(f),png(),registry),{code:'DESIGN_LOGO_MISSING'});
    assert.equal((await cloudPost(f.env,f.post.id)).versionId,f.post.versionId);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_library').get().n,3);
  }finally{f.db.close();}
});
test('Artwork retry pins bytes, design, fonts and logos to exactly one new version and preserves old caption',async()=>{
  const f=await setup();try{
    const m=metadata(f),first=await saveArtwork(f.env,owner,f.post.id,m,png(),f.registry),replay=await saveArtwork(f.env,owner,f.post.id,m,png(),f.registry);
    assert.equal(first.versionId,replay.versionId);assert.equal(replay.replayed,true);
    const active=await cloudPost(f.env,f.post.id);assert.equal(active.body,f.post.body);assert.equal(active.version,3);assert.equal(active.ready,false);assert.equal(active.imageDesign.imageChecksum,await checksum(png()));assert.equal(active.imageDesign.logos.length,3);assert.equal(active.imageDesign.fonts.length,3);
    await assert.rejects(saveArtwork(f.env,owner,f.post.id,{...m,spec:{...spec,note:'Khác'}},png(),f.registry),{code:'REQUEST_REUSED'});
    assert.equal(f.db.prepare('SELECT count(*) n FROM content_checks').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,0);
    await saveCloudCaption(f.env,owner,f.post.id,{requestId:crypto.randomUUID(),expectedVersion:active.versionId,title:active.title,body:active.body+' Đã sửa.',sourceNote:active.sourceNote});
    const edited=await cloudPost(f.env,f.post.id);assert.equal(edited.imageDesign,null);assert.equal(edited.imageAvailable,false);
    const historical=JSON.parse(f.db.prepare('SELECT metadata_json FROM post_versions WHERE id=?').get(first.versionId).metadata_json);assert.equal(historical.imageDesign.spec.headline,spec.headline);
  }finally{f.db.close();}
});
test('Artwork refuses stale versions, briefs and wrong image shape; competing requests have one winner',async()=>{
  const f=await setup();try{
    await assert.rejects(saveArtwork(f.env,owner,f.post.id,metadata(f),png(300,300),f.registry),{code:'IMAGE_MUST_BE_SQUARE'});
    const brief=(await cloudCatalog(f.env)).posts[1];await assert.rejects(saveArtwork(f.env,owner,brief.id,{...metadata(f),expectedVersion:brief.versionId},png(),f.registry),{code:'SAVE_CAPTION_FIRST'});
    const a=metadata(f),b=metadata(f);const result=await Promise.allSettled([saveArtwork(f.env,owner,f.post.id,a,png(),f.registry),saveArtwork(f.env,owner,f.post.id,b,png(),f.registry)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    await assert.rejects(saveArtwork(f.env,owner,f.post.id,metadata(f),png(),f.registry),{code:'VERSION_CONFLICT'});
    assert.equal((await cloudPost(f.env,f.post.id)).version,3);
  }finally{f.db.close();}
});
test('Artwork upload failure preserves caption and can resume with same request; maintenance blocks mutation',async()=>{
  const f=await setup();try{
    const m=metadata(f);f.controls.failPut=true;await assert.rejects(saveArtwork(f.env,owner,f.post.id,m,png(),f.registry),{code:'STORAGE_WRITE_FAILED'});assert.equal((await cloudPost(f.env,f.post.id)).version,2);
    f.controls.failPut=false;await saveArtwork(f.env,owner,f.post.id,m,png(),f.registry);assert.equal((await cloudPost(f.env,f.post.id)).version,3);
    const current=await cloudPost(f.env,f.post.id);f.db.prepare("UPDATE application_state SET maintenance_owner='fixture' WHERE environment='staging'").run();await assert.rejects(saveArtwork(f.env,owner,f.post.id,{...m,requestId:crypto.randomUUID(),expectedVersion:current.versionId},png(),f.registry));assert.equal(f.db.prepare('SELECT count(*) n FROM post_versions WHERE post_id=?').get(f.post.id).n,3);
  }finally{f.db.close();}
});
test('Artwork resources, scripts and fonts require owner; binary upload requires Origin and CSRF',async()=>{
  const f=cloudFixture();try{
    const origin='https://nttu-publisher-staging.example.workers.dev',key='a'.repeat(64);Object.assign(f.env,{AUTH_ORIGIN:origin,SESSION_SIGNING_KEY:key,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret'});
    for(const path of ['/api/design/resources','/artwork.js','/artwork-ui.js','/fonts/WorkSans-Regular.ttf','/api/posts/id/artwork'])assert.equal((await worker.fetch(new Request(origin+path),f.env)).status,401);
    const jwt=await new SignJWT({email:owner.email,csrf:owner.csrf}).setSubject(owner.sub).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(key));
    const headers={Cookie:'__Host-nttu_session='+jwt,'Content-Type':'application/octet-stream'};
    assert.equal((await worker.fetch(new Request(origin+'/api/posts/id/artwork',{method:'POST',headers,body:png()}),f.env)).status,403);
    const invalid=await worker.fetch(new Request(origin+'/api/posts/id/artwork',{method:'POST',headers:{...headers,Origin:origin,'X-CSRF-Token':owner.csrf,'X-Design-Metadata':'invalid'},body:png()}),f.env);assert.equal(invalid.status,422);
    assert.equal((await worker.fetch(new Request(origin+'/api/design/resources',{headers}),f.env)).status,200);
  }finally{f.db.close();}
});

