import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {productionMigrations} from './production-management-prepare.mjs';
import {productionWarehouseStatements} from './production-warehouse-import.mjs';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {LIVE_TEST_TIME as now} from '../tests/helpers/production-live-fixture.mjs';
import {runSimulatedActionsRunner,runSimulatedRunnerMonitor} from './production-actions-runner.mjs';
const dir=resolve('tmp/production-test-'+randomUUID());mkdirSync(dir,{recursive:true});
writeFileSync(resolve(dir,'wrangler.json'),JSON.stringify({name:'f5-local-runner-test',main:relative(dir,resolve('tests/helpers/production-runner-worker.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07'}));
const build=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',resolve(dir,'wrangler.json'),'--outdir',resolve(dir,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});if(build.status!==0)throw Error('F5 native build failed');
let mf,db;
const f=await runnerFixture({apiHandler:async request=>mf.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),body:await request.arrayBuffer()})}),cases=[];
try{
 const bindings={...Object.fromEntries(Object.entries(f.env).filter(([key])=>!['DB','MEDIA'].includes(key))),RUNNER_SIMULATION_MODE:'local-only',RUNNER_SIMULATION_TIME:String(now)};
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'f5-local-runner-test',modules:true,scriptPath:resolve(dir,'bundle/production-runner-worker.js'),compatibilityDate:'2026-10-07',d1Databases:['DB'],r2Buckets:['MEDIA'],bindings,outboundService:()=>{throw Error('F5_WORKER_OUTBOUND_DENIED');}}]}));
 db=await mf.getD1Database('DB');const initial=new DatabaseSync(':memory:');
 try{
  for(const m of productionMigrations(f.env.PRODUCTION_DATABASE_ID))initial.exec(m.sql);
  for(const row of initial.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const {name} of initial.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const row of initial.prepare('SELECT * FROM '+name).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 }finally{initial.close();}
 for(const name of ['cloud_library','assets'])for(const row of f.db.prepare('SELECT * FROM '+name).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+name+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 await db.batch(productionWarehouseStatements(f.approved,f.library,'f'.repeat(64),'2026-10-07T03:00:00Z').map(sql=>db.prepare(sql)));
 const journal=new DatabaseSync(':memory:');try{
  const migrations=productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherRunner:true});for(const migration of migrations)journal.exec(migration.sql);
  // Native D1 exec splits by line; enumerate complete SQLite trigger statements.
  for(const row of journal.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name IN ('production_publisher_preparation','production_publisher_stock_scan','production_runner_sessions','production_runner_grants') ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const migration of migrations.slice(14))await db.prepare('INSERT INTO schema_migrations VALUES(?,?)').bind(migration.name,migration.checksum).run();
 }finally{journal.close();}
 const config=f.db.prepare('SELECT * FROM production_publisher_config').get();await db.prepare('UPDATE production_publisher_config SET enabled=1,start_date=?,connection_hash=? WHERE id=1').bind(config.start_date,config.connection_hash).run();await db.prepare("UPDATE application_state SET paused_by_user=0 WHERE environment='production'").run();
 const permit=f.db.prepare('SELECT * FROM production_send_permits').get(),cols=Object.keys(permit);await db.prepare('INSERT INTO production_send_permits('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(permit)).run();
 const media=await mf.getR2Bucket('MEDIA');for(const p of f.approved)await media.put('private/'+p.id,f.imageBytes.get(p.id));
 const reset=async()=>{
  for(const table of ['production_runner_grants','production_runner_sessions','production_publisher_preparation','production_publisher_stock_scan','production_publisher_usage','production_publisher_evidence','production_publisher_attempts','production_publisher_jobs'])await db.prepare('DELETE FROM '+table).run();
  await db.prepare('UPDATE production_publisher_config SET active_job=NULL,enabled=1,blocked=NULL,stock_pending=0 WHERE id=1').run();await db.prepare("UPDATE application_state SET paused_by_user=0,blocked_reasons='[]' WHERE environment='production'").run();await db.prepare('UPDATE production_send_permits SET revoked=0').run();
 };
 const before=await db.prepare('SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM assets) assets').first();
 const complete=await runSimulatedActionsRunner(f.options);assert.equal(complete.state,'confirmed',JSON.stringify(complete));assert.equal(f.postCount(),1);cases.push({name:'compiled Worker + native D1/R2 + Node HTTP multipart',runnerMs:complete.runnerMs});
 // Only the disposable fixture loses this deletion guard, never production.
 await db.prepare('DROP TRIGGER production_usage_no_delete').run();
 await reset();const atRace=f.postCount(),race=await Promise.all([runSimulatedActionsRunner(f.options),runSimulatedActionsRunner(f.options)]);assert.equal(race.filter(r=>r.state==='confirmed').length,1);assert.equal(f.postCount()-atRace,1);cases.push({name:'native concurrent runner claim/intent fence'});
 await reset();const sent=f.postCount();const paused=await runSimulatedActionsRunner({...f.options,hook:async point=>{if(point==='after_intent')await db.prepare("UPDATE application_state SET paused_by_user=1 WHERE environment='production'").run();}});assert.equal(paused.state,'unknown',JSON.stringify(paused));assert.equal(f.postCount(),sent);cases.push({name:'native pause after durable intent blocks POST'});
 await reset();const crash=await runSimulatedActionsRunner({...f.options,hook:async point=>{if(point==='after_post')throw Error('SIMULATED_CRASH');}});assert.equal(crash.state,'needs_reconciliation');const afterCrash=f.postCount();assert.equal((await runSimulatedActionsRunner(f.options)).state,'unknown');assert.equal(f.postCount(),afterCrash);cases.push({name:'native crash after POST without hint never reposts'});
 await reset();await db.prepare("CREATE TRIGGER fail_f5_native BEFORE INSERT ON production_publisher_usage BEGIN SELECT RAISE(ABORT,'rollback finalizer'); END").run();const broken=await runSimulatedActionsRunner(f.options);assert.equal(broken.state,'needs_reconciliation');await db.prepare('DROP TRIGGER fail_f5_native').run();await db.prepare("UPDATE application_state SET paused_by_user=1 WHERE environment='production'").run();const finalSent=f.postCount();assert.equal((await runSimulatedActionsRunner(f.options)).state,'confirmed');assert.equal(f.postCount(),finalSent);cases.push({name:'native finalizer rollback + paused evidence recovery'});
 await reset();await db.prepare('UPDATE production_publisher_config SET enabled=0 WHERE id=1').run();await db.prepare("UPDATE application_state SET paused_by_user=1 WHERE environment='production'").run();const monitor=await runSimulatedRunnerMonitor(f.options);assert.equal(monitor.enabled,false);assert.equal(monitor.paused,true);cases.push({name:'cheap native status + Node mock provider monitor'});
 const after=await db.prepare('SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM assets) assets').first();assert.deepEqual(after,before);
 const report={runtime:'compiled workerd + native local D1/R2 + Node HTTP loopback',cases,warehouse:after,mockPosts:f.postCount(),realMetaPosts:0,realTelegramMessages:0,cloudCPUAcceptance:'NOT_RUN',realPublication:'NOT_RUN'};
 mkdirSync('tmp/step38/f5',{recursive:true});writeFileSync('tmp/step38/f5/native-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await f.dispose();if(mf)await mf.dispose();}
