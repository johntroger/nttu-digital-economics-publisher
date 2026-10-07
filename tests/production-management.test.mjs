import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet} from 'jose';
import {productionMigrations,prepareProductionManagement} from '../scripts/production-management-prepare.mjs';
import {productionState,managementData} from '../src/production/management.ts';
import worker from '../src/production/worker.ts';
import {startGoogle,completeGoogle,ownerSession,authConfigured} from '../src/cloud/auth.ts';
const databaseId='09cdecc7-36a2-4196-950e-ef68b1ecd834';
const origin='https://nttu-publisher-production.example.workers.dev';
const base={APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:'a'.repeat(40),
 AUTH_ORIGIN:origin,PRODUCTION_DATABASE_ID:databaseId,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',
 GOOGLE_CLIENT_SECRET:'fixture-secret-only',SESSION_SIGNING_KEY:'b'.repeat(64)};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of productionMigrations(databaseId))db.exec(f.sql);
 const env={...base,DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}},
 ASSETS:{async fetch(r){return new Response(new URL(r.url).pathname==='/'?'':readFileSync('ui/production/'+(new URL(r.url).pathname.endsWith('.js')?'management.js':'manager.html'),'utf8'),{headers:{'Content-Type':'text/html'}});}}};
 return {db,env};
}
async function session(issuer=origin,changes={}) {return new SignJWT({email:'tranthanhtung37@gmail.com',csrf:'c'.repeat(64),...changes}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setSubject('owner').setIssuer(issuer).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(base.SESSION_SIGNING_KEY));}
const request=(path,cookie='',init={})=>new Request(origin+path,{...init,headers:{Cookie:cookie,...init.headers}});
test('production schema is empty, identified, paused and enforces unavailable activation',async()=>{
 const {db,env}=fixture();try{
  assert.equal((await productionState(env)).environment,'production');
  assert.deepEqual(db.prepare('SELECT environment FROM application_state').all().map(x=>x.environment),['production']);
  const data=await managementData(env);assert.deepEqual(data.posts,[]);assert.deepEqual(data.history,[]);assert.deepEqual(data.schedule,[]);assert.equal(data.publishingEnabled,false);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>db.exec('UPDATE production_control SET enabled=1'));assert.throws(()=>db.exec('UPDATE production_identity SET schema_version=2'));
  assert.throws(()=>productionMigrations('83881fd7-88e6-4835-b616-6f4f8f2d25cd'));
 }finally{db.close();}
});
test('wrong environment, DB identity, schema and unpause fail closed before data access',async()=>{
 const {db,env}=fixture();try{
  for(const bad of [{APP_ENV:'staging'},{PRODUCTION_DATABASE_ID:'11111111-1111-1111-1111-111111111111'},{DAILY_PUBLISHING_ENABLED:'true'},{INTEGRATION_MODE:'bootstrap'}])assert.equal((await worker.fetch(request('/health'),{...env,...bad})).status,503);
  db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='production'");assert.equal((await worker.fetch(request('/'),env)).status,503);
  db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='production'; DELETE FROM schema_migrations WHERE name='0010_source_review.sql'");await assert.rejects(productionState(env));
 }finally{db.close();}
});
test('anonymous and bearer cannot read production data, assets HTML or mutate',async()=>{
 const {db,env}=fixture();try{
  assert.equal((await worker.fetch(request('/health'),env)).status,200);
  assert.match(await(await worker.fetch(request('/'),env)).text(),/Môi trường chính thức/);
  for(const path of ['/api/me','/api/management','/management.js','/manager.html','/api/library','/api/daily/activate']) {
   for(const headers of [{},{Authorization:'Bearer fixture-only-token'}])assert.equal((await worker.fetch(request(path,'',{headers}),env)).status,401,path);
  }
  assert.equal((await worker.fetch(new Request('https://other.invalid/'),env)).status,403);
  assert.ok(!(await(await worker.fetch(request('/?login=failed&reason=%3Cscript%3E'),env)).text()).includes('<script>'));
 }finally{db.close();}
});
test('production owner can read data and assets; activation and editing routes remain unavailable',async()=>{
 const {db,env}=fixture();try{
  const cookie='__Host-nttu_session='+await session();
  for(const path of ['/','/api/me','/api/management','/management.js'])assert.equal((await worker.fetch(request(path,cookie),env)).status,200,path);
  for(const path of ['/api/daily/activate','/api/daily/publish','/api/posts/save'])assert.equal((await worker.fetch(request(path,cookie,{method:'POST'}),env)).status,404);
  const response=await worker.fetch(request('/',cookie),env);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.equal((await worker.fetch(request('/api/me','__Host-nttu_session='+await session('https://nttu-publisher-staging.example.workers.dev')),env)).status,401);
  assert.equal((await worker.fetch(request('/api/me','__Host-nttu_session='+await session(origin,{email:'other@example.com'})),env)).status,401);
 }finally{db.close();}
});
test('production logout requires owner, same origin and session CSRF token',async()=>{
 const {db,env}=fixture();try{
  const cookie='__Host-nttu_session='+await session();
  assert.equal((await worker.fetch(request('/auth/logout',cookie,{method:'POST'}),env)).status,403);
  assert.equal((await worker.fetch(request('/auth/logout',cookie,{method:'POST',headers:{Origin:'https://other.invalid','Content-Type':'application/json','X-CSRF-Token':'c'.repeat(64)}}),env)).status,403);
  const response=await worker.fetch(request('/auth/logout',cookie,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-CSRF-Token':'c'.repeat(64)}}),env);
  assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
 }finally{db.close();}
});
test('production OAuth uses separate issuer/PKCE, validates Google owner and rejects staging origin',async()=>{
 const {env,db}=fixture();try{
  assert.equal(authConfigured(env),true);assert.equal(authConfigured({...env,AUTH_ORIGIN:'https://nttu-publisher-staging.example.workers.dev'}),false);
  assert.equal(authConfigured({...env,DAILY_PUBLISHING_ENABLED:'true'}),false);
  const start=await startGoogle(request('/auth/google/start'),env);const url=new URL(start.headers.get('Location'));
  assert.equal(url.searchParams.get('redirect_uri'),origin+'/auth/google/callback');assert.equal(url.searchParams.get('scope'),'openid email');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const flow=start.headers.getSetCookie()[0].split(';')[0];
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='fixture';const keys=createLocalJWKSet({keys:[jwk]});
  async function complete(email){return completeGoogle(request('/auth/google/callback?code=fixture&state='+url.searchParams.get('state'),flow),env,{keys,fetcher:async()=>{
   const id_token=await new SignJWT({nonce:url.searchParams.get('nonce'),email,email_verified:true}).setSubject('owner').setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://accounts.google.com').setAudience(base.GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime('5m').sign(privateKey);return Response.json({id_token});
  }});}
  const success=await complete('tranthanhtung37@gmail.com');assert.equal(success.headers.get('Location'),'/');
  const cookie=success.headers.getSetCookie().find(x=>x.startsWith('__Host-nttu_session=')).split(';')[0];assert.equal((await ownerSession(request('/',cookie),env)).email,'tranthanhtung37@gmail.com');
  assert.equal((await complete('other@example.com')).headers.get('Location'),'/?login=failed&reason=owner');
 }finally{db.close();}
});
test('production preparation packages management only, no credentials, seed posts or cron',()=>{
 mkdirSync('tmp',{recursive:true});const output=mkdtempSync(resolve('tmp','production-management-test-'));
 try{const r=prepareProductionManagement({databaseId,releaseSha:base.RELEASE_SHA,origin},{output,clientId:base.GOOGLE_CLIENT_ID});
  assert.deepEqual(r.config.triggers.crons,[]);assert.equal(r.config.vars.DAILY_PUBLISHING_ENABLED,'false');assert.equal(r.config.vars.INTEGRATION_MODE,'management');assert.equal(r.config.keep_vars,false);
  assert.equal(r.config.vars.SESSION_SIGNING_KEY,undefined);assert.equal(r.config.vars.GOOGLE_CLIENT_SECRET,undefined);assert.equal(r.config.vars.META_PAGE_ACCESS_TOKEN,undefined);
  assert.ok(!productionMigrations(databaseId).some(x=>x.name.includes('staging_briefs')));
 }finally{rmSync(output,{recursive:true,force:true});}
});
