import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {productionMigrations} from './production-management-prepare.mjs';
import {productionWarehouseStatements} from './production-warehouse-import.mjs';
import {scanRunnerStock} from './production-runner-stock.mjs';
import {RUNNER_ORIGIN} from '../src/production/runner-boundary.ts';
const directory=resolve('tmp/production-test-'+randomUUID());mkdirSync(directory);
for(const entry of ['runner-worker','worker']){
 const config=resolve(directory,entry+'.json');writeFileSync(config,JSON.stringify({name:'f6-local-'+entry,main:relative(directory,resolve('src/production/'+entry+'.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07'}));
 const r=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',config,'--outdir',resolve(directory,entry)],{encoding:'utf8',timeout:120000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
 if(r.status!==0)throw Error('F6_LOCAL_BUILD_FAILED');
}
const f=await runnerFixture({open:false});let mf;
try{
 const bindings={...Object.fromEntries(Object.entries(f.env).filter(([key])=>!['DB','MEDIA'].includes(key))),RUNNER_ORIGIN};
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'f6-local-runner',modules:true,scriptPath:resolve(directory,'runner-worker/runner-worker.js'),compatibilityDate:'2026-10-07',bindings,d1Databases:['DB'],r2Buckets:['MEDIA'],outboundService:()=>{throw Error('F6_NATIVE_OUTBOUND_DENIED');}}]}));
 const db=await mf.getD1Database('DB'),initial=new DatabaseSync(':memory:');
 try{
  for(const m of productionMigrations(f.env.PRODUCTION_DATABASE_ID))initial.exec(m.sql);
  for(const row of initial.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const {name} of initial.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const row of initial.prepare('SELECT * FROM '+name).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 }finally{initial.close();}
 for(const name of ['cloud_library','assets'])for(const row of f.db.prepare('SELECT * FROM '+name).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 await db.batch(productionWarehouseStatements(f.approved,f.library,'f'.repeat(64),'2026-10-07T03:00:00Z').map(sql=>db.prepare(sql)));
 const journal=new DatabaseSync(':memory:');try{
  const migrations=productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherRunner:true});for(const m of migrations)journal.exec(m.sql);
  for(const row of journal.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name IN ('production_publisher_preparation','production_publisher_stock_scan','production_runner_sessions','production_runner_grants') ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const m of migrations.slice(14))await db.prepare('INSERT INTO schema_migrations VALUES(?,?)').bind(m.name,m.checksum).run();
 }finally{journal.close();}
 const call=async(route,body={})=>{
  const r=await mf.dispatchFetch(RUNNER_ORIGIN+route,{method:'POST',headers:{Authorization:'Bearer '+f.env.PRODUCTION_RUNNER_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
 };
 assert.equal((await call('/runner/status')).enabled,false);
 assert.equal((await mf.dispatchFetch('https://other.invalid/runner/status')).status,403);
 const stock=await scanRunnerStock({call},{expectedRelease:f.env.RELEASE_SHA});assert.equal(stock.remaining,40);assert.equal(stock.main,30);assert.equal(stock.reserve,10);
 const start=await call('/runner/stock-start');await assert.rejects(call('/runner/stock-finalize',{scan:start.scan,remaining:40,main:30,reserve:10,ready:40}));
 const report={runtime:'compiled production entrypoint + local workerd/D1',builds:['runner-worker','management-worker'],stock,realMetaPosts:0,realTelegramMessages:0,cloudCPUAcceptance:'NOT_RUN'};
 mkdirSync('tmp/step38/f6',{recursive:true});writeFileSync('tmp/step38/f6/native-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await f.dispose();if(mf)await mf.dispose();}
