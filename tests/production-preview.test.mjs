import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {productionWarehouseFixture} from './helpers/production-warehouse-fixture.mjs';
import {productionPreview} from '../src/production/preview.ts';
import worker from '../src/production/worker.ts';
const now=Date.parse('2026-10-07T10:00:00Z');
test('Read-only production preview validates 40 approvals, 30 main days and 10 reserves with no writes',async()=>{
 const f=productionWarehouseFixture();try{
  const before=f.db.prepare('SELECT total_changes() n').get().n;
  const p=await productionPreview(f.env,'2026-10-08',now);
  assert.equal(p.valid,40,JSON.stringify(p.calendar.filter(p=>p.reasons.length).map(p=>[p.key,p.reasons])));
  assert.equal(p.calendar.length,30);assert.equal(p.reserves.length,10);assert.equal(p.warehouseComplete,true);
  assert.equal(p.calendar[0].publishAt,'2026-10-08T03:00:00.000Z');assert.equal(p.calendar.at(-1).day,'2026-11-06');
  assert.ok(p.calendar.every(p=>p.caption.includes('============')&&p.imageUrl));assert.ok(Object.values(p.gates).every(x=>x===false));
  assert.equal(p.realPublication,'NOT_RUN');assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
  for(const t of ['schedule_slots','publish_jobs','publications','page_connections'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
 }finally{f.db.close();}
});
test('Altered body, footer, image, source revision or program duration invalidates preview approval',async()=>{
 for(const sql of ["UPDATE post_versions SET body=body||' changed' WHERE post_id LIKE '%:P01'","UPDATE cloud_reviews SET footer_version='old' WHERE post_id LIKE '%:P01'","UPDATE assets SET checksum='altered' WHERE id='library-P01'","UPDATE sources SET revision='altered' WHERE id LIKE '%:P01:%'","UPDATE facts SET value_json='4' WHERE fact_key='training_duration_years'"]){
  const f=productionWarehouseFixture();try{if(sql.startsWith('UPDATE post_versions')){assert.throws(()=>f.db.exec(sql),/save a new editor version/);f.db.exec('DROP TRIGGER editor_version_content_immutable');}
  if(sql.startsWith('UPDATE cloud_reviews')){assert.throws(()=>f.db.exec(sql),/immutable/);f.db.exec('DROP TRIGGER cloud_review_immutable');}
  if(sql.startsWith('UPDATE assets')){assert.throws(()=>f.db.exec(sql),/completed_asset_immutable/);f.db.exec('DROP TRIGGER completed_asset_immutable');}
  if(sql.startsWith('UPDATE sources')){assert.throws(()=>f.db.exec(sql),/new source revision/);f.db.exec('DROP TRIGGER source_revision_immutable');}
  if(sql.startsWith('UPDATE facts')){assert.throws(()=>f.db.exec(sql));f.db.exec('DROP TRIGGER fact_revision_immutable');}
  f.db.exec(sql);const p=await productionPreview(f.env,undefined,now);assert.ok(p.valid<40,sql);}finally{f.db.close();}
 }
});
test('Preview rejects malformed, repeated, past and excessive dates; owner only; POST cannot activate',async()=>{
 const f=productionWarehouseFixture();try{
  for(const date of ['2026-02-30','2026-10-06','2028-01-01','2026-10-08T03:00:00Z'])await assert.rejects(productionPreview(f.env,date,now),/PREVIEW_DATE_INVALID/);
  Object.assign(f.env,{GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only',PRODUCTION_TRIGGER_TOKEN:'t'.repeat(64)});
  const url=f.env.AUTH_ORIGIN+'/api/production/preview';
  for(const headers of [{},{Authorization:'Bearer '+f.env.PRODUCTION_TRIGGER_TOKEN}])assert.equal((await worker.fetch(new Request(url,{headers}),f.env)).status,401);
  const jwt=await new SignJWT({email:'tranthanhtung37@gmail.com',csrf:'c'.repeat(64)}).setSubject('owner').setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(f.env.AUTH_ORIGIN).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
  const headers={Cookie:'__Host-nttu_session='+jwt};
  assert.equal((await worker.fetch(new Request(url,{headers}),f.env)).status,200);
  for(const query of ['?startDate=2026-10-08&startDate=2026-10-09','?enabled=true'])assert.equal((await worker.fetch(new Request(url+query,{headers}),f.env)).status,422);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers,body:'{}'}),f.env)).status,405);
 }finally{f.db.close();}
});
