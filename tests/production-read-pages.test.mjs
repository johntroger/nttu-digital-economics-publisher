import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {productionWarehouseFixture} from './helpers/production-warehouse-fixture.mjs';
import {managementSummary,managementPostPage,managementPostDetail,managementSection} from '../src/production/management.ts';
import {productionPreview,productionPreviewPage} from '../src/production/preview.ts';
import {signCursor,readSnapshot} from '../src/production/read-pages.ts';
import worker from '../src/production/worker.ts';
const now=Date.parse('2026-10-08T01:00:00Z');
test('F1 summary and post pages omit bodies; details preserve approved caption and source links; all reads leave D1 unchanged',async()=>{
 const f=productionWarehouseFixture();try{const before=f.db.prepare('SELECT total_changes() n').get().n;
  const summary=await managementSummary(f.env);assert.equal(summary.counts.posts,40);assert.equal(summary.counts.reserve,10);assert.equal(summary.posts,undefined);
  let cursor,seen=[];do{const page=await managementPostPage(f.env,cursor,now);assert.ok(page.items.length<=5);assert.ok(page.items.every(p=>!('body'in p)&&!('metadata_json'in p)&&!('caption'in p)));seen.push(...page.items);cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(new Set(seen.map(p=>p.id)).size,40);
  const detail=await managementPostDetail(f.env,seen[0].id);assert.ok(detail.caption.includes('============'));assert.ok(detail.sourceRefs.length);assert.ok(detail.sourceFiles.length);assert.ok(detail.imageUrl);assert.equal(detail.contentDesignApproved,true);
  assert.equal((await managementSection(f.env,'history')).items.length,0);await assert.rejects(managementPostDetail(f.env,'missing'),/READ_POST_NOT_FOUND/);
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
 }finally{f.db.close();}
});
test('F1 forty paged preview items exactly match full fixture projection without granting publishing or claiming global validity per page',async()=>{
 const f=productionWarehouseFixture();try{const full=await productionPreview(f.env,'2026-10-09',now);let input={startDate:'2026-10-09'},seen=[],snapshot;
  while(true){const page=await productionPreviewPage(f.env,input,now);snapshot??=page.snapshot;assert.equal(page.snapshot,snapshot);assert.equal(page.publishingEnabled,false);assert.equal(page.valid,undefined);assert.equal(page.items.length,1);seen.push(...page.items);assert.equal(page.checkedThrough,seen.length);assert.equal(page.complete,seen.length===40);if(!page.nextCursor)break;input={cursor:page.nextCursor};}
  const removePrereq=p=>{const {prerequisitePreviewSatisfied,...rest}=p;return rest;};
  assert.deepEqual(seen.filter(p=>p.pool==='scheduled').map(removePrereq),full.calendar.map(removePrereq));assert.deepEqual(seen.filter(p=>p.pool==='reserve').map(removePrereq),full.reserves.map(removePrereq));
 }finally{f.db.close();}
});
test('F1 signed cursor rejects tampering, cross-endpoint use, release change and expiry',async()=>{
 const f=productionWarehouseFixture();try{const page=await productionPreviewPage(f.env,{},now),cursor=page.nextCursor;
  await assert.rejects(productionPreviewPage(f.env,{cursor:cursor.slice(0,-1)+(cursor.endsWith('0')?'1':'0')},now),/READ_CURSOR_INVALID/);
  await assert.rejects(managementPostPage(f.env,cursor,now),/READ_CURSOR_EXPIRED/);
  await assert.rejects(productionPreviewPage({...f.env,RELEASE_SHA:'c'.repeat(40)},{cursor},now),/READ_CURSOR_EXPIRED/);
  await assert.rejects(productionPreviewPage(f.env,{cursor},now+300000),/READ_CURSOR_EXPIRED/);
  await assert.rejects(productionPreviewPage(f.env,{cursor,startDate:'2026-10-10'},now),/PREVIEW_DATE_INVALID/);
  const wrong=await signCursor(f.env,{kind:'preview',owner:'other@example.com',release:f.env.RELEASE_SHA,snapshot:page.snapshot,offset:1,checkedAt:now,expiresAt:now+300000,startDate:'2026-10-09'});
  await assert.rejects(productionPreviewPage(f.env,{cursor:wrong},now),/READ_CURSOR_EXPIRED/);
 }finally{f.db.close();}
});
test('F1 changes to previous-page eligibility, sources, facts, links and document state invalidate remaining pages',async()=>{
 for(const sql of ["UPDATE post_versions SET status='quarantined' WHERE post_id LIKE '%:P01'","UPDATE sources SET status='blocked' WHERE id LIKE '%:P01:%'","UPDATE facts SET status='blocked'","UPDATE cloud_library SET state='pending' WHERE kind='document'"]){const f=productionWarehouseFixture();try{const page=await productionPreviewPage(f.env,{},now);if(sql.startsWith('UPDATE cloud_library')){assert.throws(()=>f.db.exec(sql),/immutable/);f.db.exec('DROP TRIGGER cloud_library_complete_immutable');}f.db.exec(sql);await assert.rejects(productionPreviewPage(f.env,{cursor:page.nextCursor},now),/READ_SNAPSHOT_CHANGED/);}finally{f.db.close();}}
});
test('F1 detects mutation during a page read and rejects malformed input via owner-only HTTP',async()=>{
 const f=productionWarehouseFixture();try{const original=f.env.DB.prepare.bind(f.env.DB);let changed=false;
  f.env.DB.prepare=q=>{if(q.includes('WHERE v.id IN')&&!changed){changed=true;f.db.exec("UPDATE sources SET status='blocked'");}return original(q);};
  await assert.rejects(productionPreviewPage(f.env,{},now),/READ_SNAPSHOT_CHANGED/);f.env.DB.prepare=original;
  Object.assign(f.env,{GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only'});
  const jwt=await new SignJWT({email:'tranthanhtung37@gmail.com',csrf:'c'.repeat(64)}).setSubject('owner').setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(f.env.AUTH_ORIGIN).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
  const paths=['/api/management','/api/management/posts','/api/management/posts/'+f.approved[0].entry.post_id,'/api/management/library','/api/production/preview'];
  for(const path of paths){assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+path),f.env)).status,401);assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+path,{headers:{Authorization:'Bearer '+ 'a'.repeat(64)}}),f.env)).status,401);}
  for(const path of ['/api/management/posts?cursor=a&cursor=b','/api/management?body=true','/api/production/preview?cursor=a&cursor=b'])assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+path,{headers:{Cookie:'__Host-nttu_session='+jwt}}),f.env)).status,422);
  const first=f.db.prepare('SELECT id FROM posts ORDER BY content_key LIMIT 1').get();
  const detail=await worker.fetch(new Request(f.env.AUTH_ORIGIN+'/api/management/posts/'+encodeURIComponent(first.id),{headers:{Cookie:'__Host-nttu_session='+jwt}}),f.env);assert.equal(detail.status,200);assert.ok((await detail.json()).caption.includes('============'));
  assert.ok((await readSnapshot(f.env)).length>0);
 }finally{f.db.close();}
});
test('F1 source expiry during a cursor chain invalidates the snapshot even without database writes',async()=>{
 const f=productionWarehouseFixture();try{f.db.prepare('UPDATE sources SET review_due_at=?').run(new Date(now+60000).toISOString());const page=await productionPreviewPage(f.env,{},now);await assert.rejects(productionPreviewPage(f.env,{cursor:page.nextCursor},now+61000),/READ_SNAPSHOT_CHANGED/);}finally{f.db.close();}
});
