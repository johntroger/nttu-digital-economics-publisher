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
import {approvedPack} from './cloud-batch-import.mjs';
import {productionWarehouseStatements,PRODUCTION_DB} from './production-warehouse-import.mjs';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
// Actual ID is metadata only: all bindings below are isolated in-memory fixtures.
const databaseId=PRODUCTION_DB,origin='https://nttu-publisher-production.example.workers.dev',signing='e'.repeat(64);
mkdirSync('tmp',{recursive:true});
const output='tmp/production-smoke-'+randomUUID();
const {directory}=prepareProductionManagement({databaseId,releaseSha:'a'.repeat(40),origin},{output,clientId:'fixture.apps.googleusercontent.com'});
const built=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',resolve(directory,'wrangler.json'),'--outdir',resolve(directory,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
if(built.status!==0)throw Error('Production Worker build failed');
let exchanges=0,metaReads=0,telegramSends=0;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'production-management-fixture',modules:true,
 scriptPath:resolve(directory,'bundle/worker.js'),compatibilityDate:'2026-10-05',d1Databases:['DB'],
 bindings:{APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_DATABASE_ID:databaseId,PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',
 RELEASE_SHA:'a'.repeat(40),AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret-only',SESSION_SIGNING_KEY:signing,
 META_APP_ID:'1125636386458970',META_PAGE_ID:'817593604765443',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_PAGE_ACCESS_TOKEN:'fixture-page-token-'+ 'x'.repeat(60),META_APP_SECRET:'fixture-app-secret-'+ 's'.repeat(30),TELEGRAM_ENABLED:'true',TELEGRAM_CHAT_ID:'1548618770',TELEGRAM_BOT_TOKEN:'123456789:'+ 't'.repeat(35),PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),PRODUCTION_TRIGGER_TOKEN:'d'.repeat(64)},
 serviceBindings:{ASSETS:async r=>{const name=new URL(r.url).pathname.slice(1);if(!['manager.html','management.js','management.css'].includes(name))return new Response('',{status:404});return new Response(readFileSync(resolve('ui/production',name)),{headers:{'Content-Type':name.endsWith('.html')?'text/html':name.endsWith('.js')?'text/javascript':'text/css'}});}},
 outboundService:async r=>{const url=new URL(r.url);if(url.hostname==='api.telegram.org'){assert.equal(r.method,'POST');assert.ok(url.pathname.endsWith('/sendMessage'));const p=JSON.parse(await r.text());assert.equal(p.chat_id,'1548618770');assert.match(p.text,/PRODUCTION/);telegramSends++;return Response.json({ok:true,result:{message_id:21,chat:{id:1548618770,type:'private'}}});}if(url.hostname==='graph.facebook.com'){assert.equal(r.method,'GET');assert.ok(['/v26.0/debug_token','/v26.0/me'].includes(url.pathname));metaReads++;return Response.json(url.pathname.endsWith('debug_token')?{data:{is_valid:true,type:'PAGE',app_id:'1125636386458970',expires_at:Math.floor(Date.now()/1000)+86400,data_access_expires_at:0,scopes:['pages_read_engagement','pages_manage_posts']}}:{id:'817593604765443',name:'Ngành Kinh tế số - NTTU'});}assert.equal(r.url,'https://oauth2.googleapis.com/token');assert.equal(r.method,'POST');const form=new URLSearchParams(await r.text());assert.equal(form.get('redirect_uri'),origin+'/auth/google/callback');exchanges++;return Response.json({error:'invalid_grant'},{status:400});}
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
 assert.equal(readFileSync(resolve(directory,'bundle/worker.js'),'utf8').includes('production_fixture_jobs'),false);
 for(const path of ['/api/me','/api/management','/api/production/preview','/api/production/preflight','/management.js','/manager.html'])assert.equal((await mf.dispatchFetch(origin+path)).status,401);
 const manager=await mf.dispatchFetch(origin+'/',{headers:{Cookie:cookie}});assert.equal(manager.status,200);assert.match(await manager.text(),/Kho nội dung/);
 const read=await mf.dispatchFetch(origin+'/api/management',{headers:{Cookie:cookie}});assert.equal(read.status,200);const data=await read.json();assert.equal(data.counts.posts,0);assert.equal(data.posts,undefined);assert.equal(data.history,undefined);assert.equal(data.paused,true);
 assert.equal((await mf.dispatchFetch(origin+'/api/meta/check',{method:'POST',headers:{Cookie:cookie},body:'{}'})).status,403);
 const requestId=randomUUID(),verification=await mf.dispatchFetch(origin+'/api/meta/check',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':'c'.repeat(64)},body:JSON.stringify({requestId})});assert.equal(verification.status,200);assert.equal((await verification.json()).verifiedReadOnly,true);assert.equal(metaReads,2);
 for(const table of ['page_connections','publish_jobs','schedule_slots','publications','notification_outbox'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
 assert.equal((await db.prepare('SELECT enabled FROM production_control').first()).enabled,0);
 for(const path of ['/api/daily/activate','/api/daily/publish'])assert.equal((await mf.dispatchFetch(origin+path,{method:'POST',headers:{Cookie:cookie}})).status,404);
 assert.equal((await mf.dispatchFetch(origin+'/auth/logout',{method:'POST',headers:{Cookie:cookie}})).status,403);
 const start=await mf.dispatchFetch(origin+'/auth/google/start',{redirect:'manual'});assert.equal(start.status,302);const url=new URL(start.headers.get('Location')),flow=start.headers.get('Set-Cookie').split(';')[0];
 const failed=await mf.dispatchFetch(origin+'/auth/google/callback?code=fixture&state='+url.searchParams.get('state'),{headers:{Cookie:flow},redirect:'manual'});
 assert.equal(failed.headers.get('Location'),'/?login=failed&reason=grant');assert.equal(exchanges,1);
 const json=p=>JSON.parse(readFileSync(p));
 const pack=approvedPack(json('content/batch-2026-v1.json'),json('content/batch-2026-v1.manifest.json'),json('content/samples/step22-approval.json'),json('content/batch/step23-approval.json'));
 const library=pack.map(p=>({id:p.id,kind:'image',state:'complete',checksum:p.entry.image_sha256,width:1080,height:1080}));
 library.push(...SOURCE_REGISTRY.filter(s=>s.authority==='document').map(s=>({id:s.id,kind:'document',state:'complete',source_key:s.id,checksum:s.sha256})));
 for(const f of library){await db.prepare('INSERT INTO cloud_library VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(f.id,f.kind,f.id,f.source_key??null,f.checksum,'private/'+f.id,f.kind==='image'?'image/png':'application/pdf',5000,f.width??null,f.height??null,'complete','owner','now').run();
  if(f.kind==='image')await db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').bind('library-'+f.id,'private/'+f.id,f.checksum,'image/png',1080,1080,5000,'complete').run();}
 await db.batch(productionWarehouseStatements(pack,library,'f'.repeat(64),'2026-10-07T03:00:00Z').map(sql=>db.prepare(sql)));
 const preflight=await mf.dispatchFetch(origin+'/api/production/preflight',{headers:{Cookie:cookie}});assert.equal(preflight.status,200);const gates=await preflight.json();assert.equal(gates.schemaReady,true);assert.equal(gates.state,'closed');assert.ok(Object.values(gates.gates).every(v=>v===false));
 for(const token of ['b','d'])assert.equal((await mf.dispatchFetch(origin+'/api/production/publisher/tick',{method:'POST',headers:{Authorization:'Bearer '+token.repeat(64)}})).status,401);
 assert.equal((await db.prepare('SELECT heartbeat_count FROM production_publisher_runtime').first()).heartbeat_count,0);
 let previewPath='/api/production/preview',previewItems=[],previewSnapshot;do{const previewResponse=await mf.dispatchFetch(origin+previewPath,{headers:{Cookie:cookie}});const preview=await previewResponse.json();assert.equal(previewResponse.status,200,JSON.stringify(preview));previewSnapshot??=preview.snapshot;assert.equal(preview.snapshot,previewSnapshot);assert.equal(preview.items.length,1);assert.equal(preview.valid,undefined);assert.equal(preview.publishingEnabled,false);previewItems.push(...preview.items);previewPath=preview.nextCursor?'/api/production/preview?cursor='+encodeURIComponent(preview.nextCursor):null;}while(previewPath);
 assert.equal(previewItems.length,40);assert.equal(previewItems.filter(p=>p.approvalValid).length,40);assert.equal(previewItems.filter(p=>p.pool==='scheduled').length,30);assert.equal(previewItems.filter(p=>p.pool==='reserve').length,10);
 assert.equal((await mf.dispatchFetch(origin+'/api/production/preview',{method:'POST',headers:{Cookie:cookie},body:'{}'})).status,405);
 const warehouse=await(await mf.dispatchFetch(origin+'/api/management',{headers:{Cookie:cookie}})).json();assert.equal(warehouse.counts.posts,40);assert.equal(warehouse.posts,undefined);assert.equal(warehouse.publishingEnabled,false);
 const list=await(await mf.dispatchFetch(origin+'/api/management/posts',{headers:{Cookie:cookie}})).json();assert.equal(list.items.length,5);assert.ok(list.items.every(p=>p.caption===undefined&&p.body===undefined));
 const detail=await(await mf.dispatchFetch(origin+'/api/management/posts/'+encodeURIComponent(list.items[0].id),{headers:{Cookie:cookie}})).json();assert.ok(detail.contentDesignApproved&&detail.imageUrl&&detail.caption.includes('============'));
 for(const section of ['schedule','history'])assert.deepEqual((await(await mf.dispatchFetch(origin+'/api/management/'+section,{headers:{Cookie:cookie}})).json()).items,[]);
 await assert.rejects(db.batch(productionWarehouseStatements(pack,library,'f'.repeat(64),'2026-10-07T03:00:00Z').map(sql=>db.prepare(sql))));
 assert.equal((await db.prepare('SELECT count(*) n FROM posts').first()).n,40);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 const telegramTest=await mf.dispatchFetch(origin+'/api/telegram/test',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':'c'.repeat(64)},body:JSON.stringify({requestId:randomUUID()})});assert.equal(telegramTest.status,200);
 await (await mf.getWorker()).scheduled({cron:'*/5 * * * *',scheduledTime:Date.now()});
 assert.equal(telegramSends,1);assert.equal((await db.prepare('SELECT state FROM notification_outbox').first()).state,'delivered');
 await db.prepare('UPDATE production_http_trigger SET enabled=1').run();
 const tickURL=origin+'/api/production/tick';
 assert.equal((await mf.dispatchFetch(tickURL,{method:'POST',headers:{Authorization:'Bearer '+ 'b'.repeat(64)}})).status,401);
 const tick=await mf.dispatchFetch(tickURL,{method:'POST',headers:{Authorization:'Bearer '+ 'd'.repeat(64)}});assert.equal(tick.status,200);assert.equal((await tick.json()).state,'idle');
 assert.equal((await db.prepare('SELECT heartbeat_count FROM production_http_trigger').first()).heartbeat_count,1);
 const duplicate=await mf.dispatchFetch(tickURL,{method:'POST',headers:{Authorization:'Bearer '+ 'd'.repeat(64)}});assert.equal((await duplicate.json()).state,'coalesced');
 assert.equal((await mf.dispatchFetch(origin+'/api/production/monitor',{headers:{Authorization:'Bearer '+ 'b'.repeat(64)}})).status,200);
 for(const table of ['publish_jobs','schedule_slots','publications','page_connections'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
 await db.prepare("UPDATE application_state SET paused_by_user=0 WHERE environment='production'").run();assert.equal((await mf.dispatchFetch(origin+'/api/management',{headers:{Cookie:cookie}})).status,503);
 console.log('Production workerd smoke passed: complete schema, isolated identity, owner/session privacy, ASSETS, disabled publication routes, logout CSRF, OAuth native exchange and fail-closed unpause. No external provider request.');
}finally{sqlite.close();await mf.dispose();}


