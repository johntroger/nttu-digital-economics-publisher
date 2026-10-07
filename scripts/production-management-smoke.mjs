// Full production schema and compiled worker in local workerd. Fixture cookies
// and mocked Google responses never reach either remote environment.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {SignJWT} from 'jose';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {productionMigrations,prepareProductionManagement} from './production-management-prepare.mjs';
const databaseId='11111111-1111-1111-1111-111111111111',origin='https://nttu-publisher-production.example.workers.dev',signing='e'.repeat(64);
mkdirSync('tmp',{recursive:true});
const output='tmp/production-smoke-'+randomUUID();
const {directory}=prepareProductionManagement({databaseId,releaseSha:'a'.repeat(40),origin},{output,clientId:'fixture.apps.googleusercontent.com'});
const built=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',resolve(directory,'wrangler.json'),'--outdir',resolve(directory,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
if(built.status!==0)throw Error('Production Worker build failed');
let exchanges=0;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'production-management-fixture',modules:true,
 scriptPath:resolve(directory,'bundle/worker.js'),compatibilityDate:'2026-10-05',d1Databases:['DB'],
 bindings:{APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:databaseId,
 RELEASE_SHA:'a'.repeat(40),AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret-only',SESSION_SIGNING_KEY:signing},
 serviceBindings:{ASSETS:async r=>{const name=new URL(r.url).pathname.slice(1);if(!['manager.html','management.js','management.css'].includes(name))return new Response('',{status:404});return new Response(readFileSync(resolve('ui/production',name)),{headers:{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'}});}},
 outboundService:async r=>{assert.equal(r.url,'https://oauth2.googleapis.com/token');assert.equal(r.method,'POST');const form=new URLSearchParams(await r.text());assert.equal(form.get('redirect_uri'),origin+'/auth/google/callback');exchanges++;return Response.json({error:'invalid_grant'},{status:400});}
}]}));
const sqlite=new DatabaseSync(':memory:');
try{
 for(const file of productionMigrations(databaseId))sqlite.exec(file.sql);
 const db=await mf.getD1Database('DB');
 // Copy each complete SQL object, preserving trigger bodies; do not split SQL on semicolons.
 for(const object of sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(object.sql).run();
 for(const {name} of sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
  for(const row of sqlite.prepare('SELECT * FROM '+name).all()){
   const columns=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();
  }
 }
 const jwt=await new SignJWT({email:'tranthanhtung37@gmail.com',csrf:'c'.repeat(64)}).setSubject('fixture').setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signing));
 const cookie='__Host-nttu_session='+jwt;
 const health=await mf.dispatchFetch(origin+'/health');assert.equal(health.status,200);assert.equal((await health.json()).publishingEnabled,false);
 for(const path of ['/api/me','/api/management','/management.js','/manager.html'])assert.equal((await mf.dispatchFetch(origin+path)).status,401);
 const manager=await mf.dispatchFetch(origin+'/',{headers:{Cookie:cookie}});assert.equal(manager.status,200);assert.match(await manager.text(),/Kho nội dung/);
 const read=await mf.dispatchFetch(origin+'/api/management',{headers:{Cookie:cookie}});assert.equal(read.status,200);const data=await read.json();assert.deepEqual(data.posts,[]);assert.deepEqual(data.history,[]);assert.equal(data.paused,true);
 for(const path of ['/api/daily/activate','/api/daily/publish'])assert.equal((await mf.dispatchFetch(origin+path,{method:'POST',headers:{Cookie:cookie}})).status,404);
 assert.equal((await mf.dispatchFetch(origin+'/auth/logout',{method:'POST',headers:{Cookie:cookie}})).status,403);
 const start=await mf.dispatchFetch(origin+'/auth/google/start',{redirect:'manual'});assert.equal(start.status,302);const url=new URL(start.headers.get('Location')),flow=start.headers.get('Set-Cookie').split(';')[0];
 const failed=await mf.dispatchFetch(origin+'/auth/google/callback?code=fixture&state='+url.searchParams.get('state'),{headers:{Cookie:flow},redirect:'manual'});
 assert.equal(failed.headers.get('Location'),'/?login=failed&reason=grant');assert.equal(exchanges,1);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 await db.prepare("UPDATE application_state SET paused_by_user=0 WHERE environment='production'").run();assert.equal((await mf.dispatchFetch(origin+'/api/management',{headers:{Cookie:cookie}})).status,503);
 console.log('Production workerd smoke passed: complete schema, isolated identity, owner/session privacy, ASSETS, disabled publication routes, logout CSRF, OAuth native exchange and fail-closed unpause. No external provider request.');
}finally{sqlite.close();await mf.dispose();}
