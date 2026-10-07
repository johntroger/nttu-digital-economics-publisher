import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {SignJWT} from 'jose';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {productionMetaConfigured,productionMetaStatus,verifyProductionMeta} from '../src/production/meta.ts';
import {productionState} from '../src/production/management.ts';
import worker from '../src/production/worker.ts';
const now=Date.parse('2026-10-07T04:00:00Z'),PAGE='817593604765443',APP='1125636386458970',TOKEN='fixture-production-token-'+'x'.repeat(60),SECRET='fixture-app-secret-'+'s'.repeat(30),origin='https://nttu-publisher-production.example.workers.dev';
const owner={email:'tranthanhtung37@gmail.com',sub:'owner',csrf:'c'.repeat(64)};
function fixture({legacy=false}={}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of productionMigrations('09cdecc7-36a2-4196-950e-ef68b1ecd834'))if(!legacy||!f.name.startsWith('0011'))db.exec(f.sql);
 const env={APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:'09cdecc7-36a2-4196-950e-ef68b1ecd834',RELEASE_SHA:'a'.repeat(40),AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only',SESSION_SIGNING_KEY:'b'.repeat(64),META_APP_ID:APP,META_PAGE_ID:PAGE,META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_PAGE_ACCESS_TOKEN:TOKEN,META_APP_SECRET:SECRET,DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}}};return{db,env};
}
function transport(changes={},page={id:PAGE,name:'Ngành Kinh tế số - NTTU'}){const calls=[];return{calls,fetch:async(url,init)=>{calls.push({url,init});assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');return Response.json(url.includes('debug_token')?{data:{is_valid:true,type:'PAGE',app_id:APP,expires_at:Math.floor(now/1000)+864000,data_access_expires_at:Math.floor(now/1000)+1728000,scopes:['pages_read_engagement','pages_manage_posts'],...changes}}:page);}};}
test('production verification is pinned to official Page and app, persists only safe receipts, never activates',async()=>{
 const f=fixture();try{assert.equal(productionMetaConfigured(f.env),true);const t=transport(),request={requestId:crypto.randomUUID()},r=await verifyProductionMeta(f.env,owner,request,{now,transport:t.fetch});assert.equal(r.verifiedReadOnly,true);assert.equal(r.pageId,PAGE);assert.equal(t.calls.length,2);
  const repeat=await verifyProductionMeta(f.env,owner,request,{now,transport:t.fetch});assert.equal(repeat.replayed,true);assert.equal(t.calls.length,2);assert.equal((await productionMetaStatus(f.env,now)).lastCheck.verifiedReadOnly,true);
  assert.equal((await productionMetaStatus(f.env,now+600000)).lastCheck.verifiedReadOnly,false);
  assert.equal((await productionMetaStatus({...f.env,META_PAGE_ACCESS_TOKEN:TOKEN+'new'},now)).lastCheck.current,false);
  await assert.rejects(verifyProductionMeta({...f.env,META_PAGE_ACCESS_TOKEN:TOKEN+'new'},owner,request,{now,transport:t.fetch}),/REQUEST_REUSED/);
  const text=JSON.stringify(f.db.prepare('SELECT * FROM cloud_meta_checks').all());assert.ok(!text.includes(TOKEN)&&!text.includes(SECRET));
  for(const table of ['page_connections','publish_jobs','schedule_slots','publications','notification_outbox'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+table).get().n,0);
  assert.equal(f.db.prepare('SELECT enabled FROM production_control').get().enabled,0);
  assert.throws(()=>f.db.exec("UPDATE cloud_meta_checks SET reason='changed'"));
 }finally{f.db.close();}
});
test('wrong environment/test Page/app/token type/scopes/identity/expiry cannot verify official production',async()=>{
 const f=fixture();try{
  for(const changes of [{APP_ENV:'staging'},{META_CONNECTION_PURPOSE:'test'},{DAILY_PUBLISHING_ENABLED:'true'},{META_PAGE_ID:'551227411605506'},{META_APP_ID:'123456789'}]){assert.equal(productionMetaConfigured({...f.env,...changes}),false);await assert.rejects(verifyProductionMeta({...f.env,...changes},owner,{requestId:crypto.randomUUID()},{now}));}
  for(const changes of [{type:'USER'},{app_id:'123456789'},{scopes:['pages_read_engagement']},{expires_at:Math.floor(now/1000)-1},{granular_scopes:[{scope:'pages_manage_posts',target_ids:['551227411605506']}]}]){const t=transport(changes),r=await verifyProductionMeta(f.env,owner,{requestId:crypto.randomUUID()},{now,transport:t.fetch});assert.equal(r.verifiedReadOnly,false);}
  const t=transport({},{id:'551227411605506',name:'Tập Viết'}),r=await verifyProductionMeta(f.env,owner,{requestId:crypto.randomUUID()},{now,transport:t.fetch});assert.equal(r.reason,'META_PAGE_MISMATCH');
 }finally{f.db.close();}
});
test('legacy schema remains readable while Meta routes wait for migration; missing base migration stays blocked',async()=>{
 const f=fixture({legacy:true});try{await productionState(f.env);assert.equal((await productionMetaStatus(f.env)).schemaReady,false);await assert.rejects(verifyProductionMeta(f.env,owner,{requestId:crypto.randomUUID()}),/META_NOT_CONFIGURED/);
  f.db.exec("DELETE FROM schema_migrations WHERE name='0010_source_review.sql'");await assert.rejects(productionState(f.env));
 }finally{f.db.close();}
});
test('production Meta routes require Google owner and same-origin CSRF; no publish route exists',async()=>{
 const f=fixture();try{for(const p of ['/api/meta','/api/meta/check'])assert.equal((await worker.fetch(new Request(origin+p),f.env)).status,401);
  const jwt=await new SignJWT({...owner}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setSubject('owner').setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
  const headers={Cookie:'__Host-nttu_session='+jwt};assert.equal((await worker.fetch(new Request(origin+'/api/meta',{headers}),f.env)).status,200);
  assert.equal((await worker.fetch(new Request(origin+'/api/meta/check',{method:'POST',headers,body:'{}'}),f.env)).status,403);
  assert.equal((await worker.fetch(new Request(origin+'/api/meta/check',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':owner.csrf},body:'{}'}),f.env)).status,422);
  assert.equal((await worker.fetch(new Request(origin+'/api/daily/publish',{method:'POST',headers}),f.env)).status,404);
 }finally{f.db.close();}
});
