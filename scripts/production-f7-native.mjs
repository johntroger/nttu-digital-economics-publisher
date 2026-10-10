// Compile the unchanged final entrypoint through the private F7 harness and
// exercise all protocol phases with native workerd/D1/R2, no external provider.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {productionMigrations} from './production-management-prepare.mjs';
import {productionWarehouseStatements} from './production-warehouse-import.mjs';
import {runSimulatedActionsRunner,simulatedClient} from './production-actions-runner.mjs';
import {scanRunnerStock} from './production-runner-stock.mjs';
const directory=resolve('tmp/production-test-'+randomUUID());mkdirSync(directory);
const name='nttu-f7-cpu-'+randomUUID().replaceAll('-','').slice(0,10),origin='https://'+name+'.nttu-kts-johntroger.workers.dev';
const config=resolve(directory,'harness.json');writeFileSync(config,JSON.stringify({name,main:relative(directory,resolve('tests/helpers/production-f7-cpu-worker.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07'}));
const build=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',config,'--outdir',resolve(directory,'bundle')],{encoding:'utf8',timeout:120000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
if(build.status!==0)throw Error('F7_LOCAL_BUILD_FAILED');
let mf;const routes=new Map();
const f=await runnerFixture({open:false,graphHook:async(_url,request)=>{if(request.method==='POST')f.setTime(Date.now());},apiHandler:async request=>{
 const path=new URL(request.url).pathname;routes.set(path,(routes.get(path)??0)+1);
 return mf.dispatchFetch(origin+path,{method:request.method,headers:request.headers,body:await request.text()});
}});
try{
 const bindings={...Object.fromEntries(Object.entries(f.env).filter(([key])=>!['DB','MEDIA'].includes(key))),CPU_TEST_MODE:'private-f7',CPU_TEST_NAME:name,CPU_TEST_DATABASE_ID:randomUUID(),CPU_TEST_ASSET_BUCKET:name,CPU_TEST_TOKEN:f.options.token,CPU_DEPLOYMENT:'1'};
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name,modules:true,scriptPath:resolve(directory,'bundle/production-f7-cpu-worker.js'),compatibilityDate:'2026-10-07',bindings,d1Databases:['DB'],r2Buckets:['MEDIA'],outboundService:()=>{throw Error('F7_NATIVE_OUTBOUND_DENIED');}}]}));
 const db=await mf.getD1Database('DB'),initial=new DatabaseSync(':memory:');
 try{
  for(const m of productionMigrations(f.env.PRODUCTION_DATABASE_ID))initial.exec(m.sql);
  for(const row of initial.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const {name:table} of initial.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all())for(const row of initial.prepare('SELECT * FROM '+table).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 }finally{initial.close();}
 for(const table of ['cloud_library','assets'])for(const row of f.db.prepare('SELECT * FROM '+table).all()){const cols=Object.keys(row);await db.prepare('INSERT INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').bind(...Object.values(row)).run();}
 await db.batch(productionWarehouseStatements(f.approved,f.library,'f'.repeat(64),'2026-10-07T03:00:00Z').map(sql=>db.prepare(sql)));
 const journal=new DatabaseSync(':memory:');try{
  const migrations=productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherRunner:true});for(const m of migrations)journal.exec(m.sql);
  for(const row of journal.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name IN ('production_publisher_preparation','production_publisher_stock_scan','production_runner_sessions','production_runner_grants') ORDER BY rowid").all())await db.prepare(row.sql).run();
  for(const m of migrations.slice(14))await db.prepare('INSERT INTO schema_migrations VALUES(?,?)').bind(m.name,m.checksum).run();
 }finally{journal.close();}
 await db.prepare('DROP TRIGGER production_usage_no_delete').run();
 const bucket=await mf.getR2Bucket('MEDIA');for(const [key,bytes] of f.imageBytes)await bucket.put('private/'+key,bytes);
 const call=async(path,body={})=>{const response=await f.request(path,body),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
 assert.equal((await mf.dispatchFetch('https://unowned.invalid/runner/status',{method:'POST',headers:{Authorization:'Bearer '+f.options.token},body:'{}'})).status,403);
 assert.equal((await mf.dispatchFetch(origin+'/runner/status',{method:'POST',body:'{}'})).status,401);
 assert.equal((await f.request('/runner/not-a-route')).status,404);
 await call('/reset');f.setTime(Date.now());
 assert.equal((await f.request('/runner/watchdog')).status,503);
 await call('/runner/heartbeat',{runId:'12345',state:'started'});
 const client=simulatedClient(f.options),result=await runSimulatedActionsRunner({...f.options,expectedRelease:f.env.RELEASE_SHA});
 assert.equal(result.state,'confirmed',JSON.stringify(result));assert.equal(f.postCount(),1);
 const stock=await scanRunnerStock(client,{expectedRelease:f.env.RELEASE_SHA});assert.equal(stock.remaining,39);
 await call('/runner/heartbeat',{runId:'12345',state:'completed'});
 assert.equal((await f.request('/runner/watchdog')).status,200);
 const replay=await runSimulatedActionsRunner(f.options);assert.ok(['day_complete','closed'].includes(replay.state),JSON.stringify(replay));assert.equal(f.postCount(),1);
 // A stock receipt cannot be committed after the owner changes generation.
 const stale=await call('/runner/stock-start');await db.prepare("UPDATE application_state SET operation_generation=operation_generation+1,paused_by_user=1 WHERE environment='production'").run();
 assert.notEqual((await f.request('/runner/stock-finalize',{scan:stale.scan,remaining:39,main:29,reserve:10,ready:39})).status,200);
 assert.equal((await call('/runner/status')).paused,true);
 assert.ok(['day_complete','closed'].includes((await runSimulatedActionsRunner(f.options)).state));assert.equal(f.postCount(),1);
 // Crash after intent leaves durable reconciliation work, never another POST.
 await call('/reset');f.setTime(Date.now());
 const crashed=await runSimulatedActionsRunner({...f.options,hook:stage=>{if(stage==='after_intent')throw Error('F7_SIMULATED_CRASH');}});
 assert.equal(crashed.state,'needs_reconciliation');assert.equal(f.postCount(),1);
 const recovered=await runSimulatedActionsRunner(f.options);assert.equal(recovered.state,'unknown');assert.equal(f.postCount(),1);
 const row=await db.prepare('SELECT count(*) count FROM posts').first();assert.equal(row.count,40);
 const report={runtime:'compiled final entrypoint + isolated harness + native workerd/D1/R2',bundleSHA256:createHash('sha256').update(readFileSync(resolve(directory,'bundle/production-f7-cpu-worker.js'))).digest('hex'),result,stock,replay:replay.state,crash:crashed.state,recovery:recovered.state,routes:Object.fromEntries(routes),warehousePosts:row.count,mockPosts:f.postCount(),realMetaPosts:0,realTelegramMessages:0,cloudCPUAccepted:false};
 mkdirSync('tmp/step38/f7',{recursive:true});writeFileSync('tmp/step38/f7/native-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await f.dispose();if(mf)await mf.dispose();}
