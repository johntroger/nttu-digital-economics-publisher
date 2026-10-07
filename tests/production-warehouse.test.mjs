import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {SignJWT} from 'jose';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {approvedPack} from '../scripts/cloud-batch-import.mjs';
import {PRODUCTION_DB,PRODUCTION_IMPORT_ID,productionWarehouseSQL,verifyWarehouse,importConfig} from '../scripts/production-warehouse-import.mjs';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
import {batchHash} from '../scripts/batch-contract.mjs';
import {managementData} from '../src/production/management.ts';
import worker from '../src/production/worker.ts';
import {readCatalog} from '../src/storage/catalog.ts';
import {eligibility} from '../src/domain/content.ts';
import {FOOTER_VERSION} from '../src/domain/footer.ts';
const json=p=>JSON.parse(readFileSync(p));
const pack=()=>approvedPack(json('content/batch-2026-v1.json'),json('content/batch-2026-v1.manifest.json'),json('content/samples/step22-approval.json'),json('content/batch/step23-approval.json'));
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const m of productionMigrations(PRODUCTION_DB))db.exec(m.sql);
 const approved=pack(),library=approved.map(p=>({id:p.id,kind:'image',state:'complete',checksum:p.entry.image_sha256,width:1080,height:1080}));
 library.push(...SOURCE_REGISTRY.filter(s=>s.authority==='document').map(s=>({id:s.id,kind:'document',state:'complete',source_key:s.id,checksum:s.sha256})));
 for(const f of library){db.prepare('INSERT INTO cloud_library VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(f.id,f.kind,f.id,f.source_key??null,f.checksum,'private/'+f.id,f.kind==='image'?'image/png':'application/pdf',5000,f.width??null,f.height??null,'complete','owner','2026-10-07');if(f.kind==='image')db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run('library-'+f.id,'private/'+f.id,f.checksum,'image/png',1080,1080,5000,'complete');}
 const env={APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:'a'.repeat(40),PRODUCTION_DATABASE_ID:PRODUCTION_DB,AUTH_ORIGIN:'https://nttu-publisher-production.example.workers.dev',SESSION_SIGNING_KEY:'b'.repeat(64),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};}};}}};
 const sql=()=>productionWarehouseSQL(approved,library,'f'.repeat(64),'2026-10-07T03:00:00Z');
 const apply=()=>{db.exec('BEGIN');try{db.exec(sql());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 return {db,approved,library,env,sql,apply};
}
const rows=db=>db.prepare('SELECT p.*,e.active_version_id,v.body,v.caption_title,v.status,v.primary_audience,v.check_version FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id').all();
test('production imports exactly forty approved versions and reviews without operational history or readiness',async()=>{
 const f=fixture();try{f.apply();verifyWarehouse(f.approved,rows(f.db),f.db.prepare('SELECT * FROM cloud_reviews').all());
  const data=await managementData(f.env);assert.equal(data.posts.length,40);assert.equal(data.posts.filter(p=>p.pool==='reserve').length,10);assert.ok(data.posts.every(p=>p.contentDesignApproved&&p.imageUrl&&p.sourceRefs.length));
  assert.equal(f.db.prepare("SELECT count(*) n FROM post_versions WHERE primary_audience='student'").get().n,28);
  assert.equal(f.db.prepare("SELECT count(*) n FROM post_versions WHERE status='ready'").get().n,0);
  const catalog=readCatalog({all:(sql,...args)=>f.db.prepare(sql).all(...args)});
  const context={now:'2026-10-07T03:00:00Z',footerVersion:FOOTER_VERSION,cohort:2026,usedPostIds:new Set(),heldPostIds:new Set(),publishedPostIds:new Set(),recentAngles:new Set(),publishedBodies:new Set()};
  for(const p of catalog)assert.deepEqual(eligibility(p,context),['NOT_READY','CHECKS_INVALID']);
  for(const t of ['page_connections','schedule_slots','publish_jobs','publications','notification_outbox'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(f.apply);assert.equal(f.db.prepare('SELECT count(*) n FROM posts').get().n,40);
  const changed=rows(f.db);changed[0].body+='changed';assert.throws(()=>verifyWarehouse(f.approved,changed,f.db.prepare('SELECT * FROM cloud_reviews').all()));
 }finally{f.db.close();}
});
test('database state conflict, blocked asset and halfway failure roll back the entire caption transaction',()=>{
 for(const mode of ['unpaused','stage','asset','halfway']){const f=fixture();try{
  if(mode==='unpaused')f.db.exec("UPDATE application_state SET paused_by_user=0");
  if(mode==='stage')f.db.exec("INSERT INTO application_state(environment) VALUES('staging')");
  if(mode==='asset')f.db.exec("UPDATE assets SET status='blocked' WHERE id='library-P30'");
  if(mode==='halfway')f.db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON cloud_reviews WHEN NEW.post_id LIKE '%:P20' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.throws(f.apply);for(const t of ['posts','post_versions','cloud_reviews','editor_imports'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
 }finally{f.db.close();}}
});
test('production import rejects staging resources, missing sources and changed images',()=>{
 const config={name:'nttu-publisher-production',vars:{APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:PRODUCTION_DB},d1_databases:[{database_id:PRODUCTION_DB,database_name:'nttu-publisher-production'}],r2_buckets:[{bucket_name:'nttu-publisher-production-assets'}],triggers:{crons:[]}};
 importConfig(config);for(const change of [c=>c.name='nttu-publisher-staging',c=>c.d1_databases[0].database_id='83881fd7-88e6-4835-b616-6f4f8f2d25cd',c=>c.r2_buckets[0].bucket_name='nttu-publisher-staging-assets',c=>c.triggers.crons.push('* * * * *')]){const c=structuredClone(config);change(c);assert.throws(()=>importConfig(c));}
 const f=fixture();try{assert.throws(()=>productionWarehouseSQL(f.approved,f.library.filter(x=>x.id!=='BM03'),'f'.repeat(64),'now'));f.library[0].checksum='0'.repeat(64);assert.throws(f.sql);}finally{f.db.close();}
});
test('private file route requires owner and rejects missing or corrupted R2 bytes',async()=>{
 const f=fixture();try{
  const bytes=new TextEncoder().encode('%PDF-1.7 fixture'),sha=batchHash(bytes);f.db.prepare('INSERT INTO cloud_library VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('private-fixture','document','fixture.pdf','FIXTURE',sha,'private/test','application/pdf',bytes.length,null,null,'complete','owner','now');
  f.env.MEDIA={async get(){return{size:bytes.length,async arrayBuffer(){return bytes.buffer;}};}};
  f.env.GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com';f.env.GOOGLE_CLIENT_SECRET='fixture-only';
  const url=f.env.AUTH_ORIGIN+'/api/library/files/private-fixture';assert.equal((await worker.fetch(new Request(url),f.env)).status,401);
  const token=await new SignJWT({email:'tranthanhtung37@gmail.com',csrf:'c'.repeat(64)}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setSubject('owner').setIssuer(f.env.AUTH_ORIGIN).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
  const req=()=>new Request(url,{headers:{Cookie:'__Host-nttu_session='+token}});const r=await worker.fetch(req(),f.env);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);
  f.env.MEDIA={async get(){return{size:bytes.length,async arrayBuffer(){return new Uint8Array(bytes.length).buffer;}};}};assert.equal((await worker.fetch(req(),f.env)).status,503);
 }finally{f.db.close();}
});
