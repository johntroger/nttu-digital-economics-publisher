import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approvedPack,batchImportSQL,BATCH_IMPORT_ID} from '../scripts/cloud-batch-import.mjs';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
import {composeCaption} from '../src/domain/footer.ts';
import {readCatalog} from '../src/storage/catalog.ts';
import {WORKFLOW_FIXTURE_SCHEMA} from '../src/cloud/workflow-fixture-schema.ts';
import {FakeCloudPublisher,runCloudSimulation} from '../src/cloud/workflow-simulation.ts';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const inputs=()=>[json('content/batch-2026-v1.json'),json('content/batch-2026-v1.manifest.json'),json('content/samples/step22-approval.json'),json('content/batch/step23-approval.json')];
function setup(){
 const f=cloudFixture(),pack=approvedPack(...inputs()),library=[];
 for(const p of pack){const file={id:'fixture-image-'+p.id,kind:'image',state:'complete',checksum:p.entry.image_sha256,width:1080,height:1080};library.push(file);f.db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)').run('library-'+file.id,'private/'+p.id,file.checksum,'image/png',1080,1080,5000,'complete');}
 for(const s of SOURCE_REGISTRY.filter(s=>s.authority==='document'))library.push({source_key:s.id,checksum:s.sha256,state:'complete'});
 const current=f.db.prepare('SELECT p.id,p.content_key,p.topic_group,p.pool,e.active_version_id,v.version FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id ORDER BY p.content_key').all();
 const sql=()=>batchImportSQL(pack,current,library,'f'.repeat(64),'2026-10-06T10:00:00.000Z');
 const apply=()=>{f.db.exec('BEGIN');try{f.db.exec(sql());f.db.exec('COMMIT');}catch(e){f.db.exec('ROLLBACK');throw e;}};
 return {...f,pack,current,library,sql,apply};
}
test('approved import preserves previous versions, binds forty current owner reviews and never grants publishing readiness',()=>{
 const f=setup();try{
  const before=f.db.prepare('SELECT count(*) n FROM post_versions').get().n;f.apply();
  assert.equal(f.db.prepare('SELECT count(*) n FROM post_versions').get().n,before+40);
  assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews r JOIN post_versions v ON v.id=r.version_id JOIN content_entries e ON e.active_version_id=v.id WHERE r.check_version=v.check_version').get().n,40);
  for(const p of f.pack){const v=f.db.prepare('SELECT * FROM post_versions WHERE id=?').get(BATCH_IMPORT_ID+':'+p.id),review=f.db.prepare('SELECT * FROM cloud_reviews WHERE version_id=?').get(v.id);assert.equal(v.body,p.body);assert.equal(JSON.parse(v.metadata_json).angle,p.reader_outcome);assert.equal(f.db.prepare('SELECT angle FROM content_entries WHERE post_id=?').get(v.post_id).angle,p.reader_outcome);assert.equal(review.caption_snapshot,composeCaption(p.body));assert.equal(review.asset_checksum,p.entry.image_sha256);assert.equal(v.status,'needs_review');assert.deepEqual(JSON.parse(review.source_snapshot).map(r=>r.id),p.source_refs.map(r=>r.id));}
  assert.equal(f.db.prepare('SELECT count(*) n FROM publish_jobs').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM publications').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,0);assert.equal(f.db.prepare("SELECT paused_by_user FROM application_state WHERE environment='staging'").get().paused_by_user,1);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>f.apply());assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,40);
 }finally{f.db.close();}
});
test('paused, version-conflict and halfway failure guards roll back the entire caption import',()=>{
 for(const mode of ['unpaused','changed-parent','blocked-image','blocked-source','halfway']){const f=setup();try{
  if(mode==='unpaused')f.db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'");
  if(mode==='changed-parent')f.current[39].active_version_id='unexpected-parent';
  if(mode==='blocked-image')f.db.exec("UPDATE assets SET status='blocked' WHERE id='library-fixture-image-P01'");
  if(mode==='blocked-source')f.db.exec("UPDATE sources SET status='blocked' WHERE id IN (SELECT source_id FROM version_sources WHERE version_id IN (SELECT active_version_id FROM content_entries))");
  if(mode==='halfway')f.db.exec("CREATE TRIGGER fail_batch BEFORE INSERT ON cloud_reviews WHEN NEW.version_id LIKE '%:P20' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  const before=f.db.prepare('SELECT count(*) n FROM post_versions').get().n;assert.throws(()=>f.apply());assert.equal(f.db.prepare('SELECT count(*) n FROM post_versions').get().n,before);assert.equal(f.db.prepare('SELECT count(*) n FROM cloud_reviews').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM editor_imports').get().n,0);
 }finally{f.db.close();}}
});
test('import rejects changed approvals, altered content, missing image or source and mismatched identities before SQL',()=>{
 for(const mutate of [a=>{a[3].samples[0].caption_sha256='0'.repeat(64);},a=>{a[3].publication_authorized=true;},a=>{a[3].samples.pop();},a=>{a[0].posts[0].body+=' Thay đổi.';}]){const a=inputs();mutate(a);assert.throws(()=>approvedPack(...a));}
 const f=setup();try{assert.throws(()=>batchImportSQL(f.pack,f.current,f.library.filter(r=>r.id!=='fixture-image-P01'),'hash','now'));assert.throws(()=>batchImportSQL(f.pack,f.current,f.library.filter(r=>r.source_key!=='BM03'),'hash','now'));f.current[0].topic_group='wrong';assert.throws(()=>f.sql());}finally{f.db.close();}
});
test('actual forty-post pack simulates thirty daily publications with same-day reserve after three five-minute retries',async()=>{
 const f=setup();try{
  f.apply();f.db.exec(WORKFLOW_FIXTURE_SCHEMA);
  f.db.exec("INSERT INTO fixture_flow_config(id,identity,target,start_date,paused) VALUES(1,'isolated-d1-fixture','fixture:approved-pack','2026-11-01',0)");
  const posts=readCatalog({all:(sql,...args)=>f.db.prepare(sql).all(...args)});
  for(const p of posts){const r=f.db.prepare('SELECT * FROM cloud_reviews WHERE version_id=?').get(p.versionId);const simulated={...p,status:'ready',check:{checkVersion:r.check_version,checksum:r.asset_checksum,footerVersion:r.footer_version,checkedAt:r.checked_at,passed:true}};f.db.prepare('INSERT INTO fixture_flow_posts(id,payload) VALUES(?,?)').run(p.postId,JSON.stringify(simulated));}
  const mains=posts.filter(p=>p.pool==='scheduled').sort((a,b)=>a.order-b.order),failed=mains[0];
  for(let day=0;day<30;day++)f.db.prepare('INSERT INTO fixture_flow_slots VALUES(?,?,?)').run('2026-11-'+String(day+1).padStart(2,'0'),mains[day].postId,'open');
  let time=Date.parse('2026-11-01T03:00:00Z');
  const publisher=new FakeCloudPublisher(async r=>r.postId===failed.postId?{kind:'retryable'}:{kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:time});
  const env={...f.env,APP_ENV:'test',INTEGRATION_MODE:'fake'},run=()=>runCloudSimulation(env,{publisher,now:()=>time});
  assert.equal((await run()).status,'retry_wait');time+=300000;assert.equal((await run()).status,'retry_wait');time+=300000;assert.equal((await run()).status,'confirmed');
  const used=f.db.prepare('SELECT post FROM fixture_flow_usage').get().post;
  assert.equal(posts.find(p=>p.postId===used).pool,'reserve');assert.equal(posts.find(p=>p.postId===used).group,failed.group);assert.equal(publisher.calls.filter(c=>c.postId===failed.postId).length,3);
  assert.equal((await run()).status,'day_complete');
  for(let day=1;day<30;day++){time=Date.parse('2026-11-'+String(day+1).padStart(2,'0')+'T03:00:00Z');assert.equal((await run()).status,'confirmed');assert.equal((await run()).status,'day_complete');}
  assert.equal(f.db.prepare('SELECT count(*) n FROM fixture_flow_usage').get().n,30);assert.equal(f.db.prepare('SELECT count(DISTINCT day) n FROM fixture_flow_usage').get().n,30);assert.equal(new Set(f.db.prepare('SELECT post FROM fixture_flow_usage').all().map(r=>r.post)).size,30);
  for(const c of publisher.calls)assert.equal(c.caption,composeCaption(posts.find(p=>p.postId===c.postId).body));
  assert.equal(f.db.prepare('SELECT count(*) n FROM publications').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM publish_jobs').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM notification_outbox').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM post_versions WHERE status=\'ready\'').get().n,0);
 }finally{f.db.close();}
});
