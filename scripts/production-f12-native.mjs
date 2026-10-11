// Actual compiled management Worker, isolated local D1, fixture credentials.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {productionMigrations} from './production-management-prepare.mjs';
import {metaFingerprint} from '../src/cloud/meta.ts';
const directory=resolve('tmp/production-test-'+randomUUID());mkdirSync(directory);
const name='nttu-f12-local',origin='https://'+name+'.example.workers.dev',config=resolve(directory,'config.json');
writeFileSync(config,JSON.stringify({name,main:relative(directory,resolve('src/production/worker.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07'}));
const build=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',config,'--outdir',resolve(directory,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
if(build.status!==0)throw Error('F12_NATIVE_BUILD_FAILED');
const bindings={APP_ENV:'production',INTEGRATION_MODE:'management',AUTH_ORIGIN:origin,DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_ENABLED:'false',PRODUCTION_DATABASE_ID:'09cdecc7-36a2-4196-950e-ef68b1ecd834',PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',RELEASE_SHA:'a'.repeat(40),PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),META_CONNECTION_PURPOSE:'production_verify',META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_APP_SECRET:'s'.repeat(4096),META_PAGE_ACCESS_TOKEN:'t'.repeat(4096)};
let mf;const sqlite=new DatabaseSync(':memory:');
try{
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name,modules:true,scriptPath:resolve(directory,'bundle/worker.js'),compatibilityDate:'2026-10-07',bindings,d1Databases:['DB'],outboundService:()=>{throw Error('F12_OUTBOUND_DENIED');}}]}));
 for(const migration of productionMigrations(bindings.PRODUCTION_DATABASE_ID,{publisherRunner:true}))sqlite.exec(migration.sql);
 const db=await mf.getD1Database('DB');
 for(const object of sqlite.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(object.sql).run();
 for(const {name:table} of sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const row of sqlite.prepare('SELECT * FROM '+table).all()){const keys=Object.keys(row);await db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 const request=()=>mf.dispatchFetch(origin+'/api/production/monitor',{headers:{Authorization:'Bearer '+bindings.PRODUCTION_MONITOR_TOKEN}});
 assert.equal((await mf.dispatchFetch(origin+'/api/production/monitor')).status,401);
 const response=await request();assert.equal(response.status,200);const status=await response.json();
 assert.equal(status.metaConfigurationHash,await metaFingerprint(bindings));assert.equal(status.release,bindings.RELEASE_SHA);assert.equal(status.metaVerified,false);assert.equal(status.metaVerificationSource,'node_required');assert.equal(status.publisher.state,'closed');
 for(let i=0;i<3;i++){const r=await request();assert.equal(r.status,200);assert.equal((await r.json()).metaConfigurationHash,status.metaConfigurationHash);}
 for(const table of ['cloud_meta_checks','production_send_permits','production_publisher_jobs','production_publisher_attempts','production_publisher_usage','notification_outbox'])assert.equal((await db.prepare('SELECT count(*) n FROM '+table).first()).n,0);
 mkdirSync('tmp/step38/f12',{recursive:true});const report={runtime:'compiled management Worker + native workerd/D1',schema:16,fixtureCredentialBytes:8192,authenticatedReads:4,unauthenticatedStatus:401,providerCalls:0,facebookPosts:0,telegramSends:0,cloudCPUAccepted:false};writeFileSync('tmp/step38/f12/native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{sqlite.close();await mf?.dispose();}
