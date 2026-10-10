// Explicit F7 private clone smoke. Always removes owned cloud resources; never
// binds the real production bucket, sends real provider requests or deploys live.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {productionMigrations} from './production-management-prepare.mjs';
import {metaFingerprint} from '../src/cloud/meta.ts';
import {businessDate} from '../src/domain/policy.ts';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {SIMULATION_META,runSimulatedActionsRunner,simulatedClient} from './production-actions-runner.mjs';
import {scanRunnerStock} from './production-runner-stock.mjs';
import {assertF5Usage} from './f5-cloud-budget.mjs';
const root='tmp/step38/f7',account='4d46e32e5c27ff522ee857308a53e729',liveDB='09cdecc7-36a2-4196-950e-ef68b1ecd834';mkdirSync(root,{recursive:true});
const usage=JSON.parse(readFileSync(root+'/account-usage.json'));assertF5Usage(usage);
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
if(!/^[a-f0-9]{40}$/.test(sha)||spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).stdout.trim())throw Error('F7_CLEAN_HEAD_REQUIRED');
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];
const ciResponse=await fetch('https://api.github.com/repos/johntroger/nttu-digital-economics-publisher/actions/workflows/ci.yml/runs?head_sha='+sha+'&event=pull_request&status=completed&per_page=10',{redirect:'error',headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
const ci=ciResponse.ok?await ciResponse.json():null;
if(!ci?.workflow_runs?.some(r=>r.head_sha===sha&&r.conclusion==='success'))throw Error('F7_EXACT_HEAD_CI_REQUIRED');
assertF5Usage(usage);
const ledgerPath=root+'/cloud-smoke-load.json';
let ledger;try{ledger=JSON.parse(readFileSync(ledgerPath));}catch(error){if(error.code!=='ENOENT')throw error;}
if(ledger&&(!/^\d{4}-\d{2}-\d{2}$/.test(ledger.utcDate)||!Number.isSafeInteger(ledger.reservedCycles)||ledger.reservedCycles<0||ledger.reservedCycles>2))throw Error('F7_SMOKE_LEDGER_INVALID');
const utcDate=new Date().toISOString().slice(0,10),reserved=ledger?.utcDate===utcDate?ledger.reservedCycles:0;
if(reserved>=2)throw Error('F7_SMOKE_DAILY_LOAD_LIMIT');
writeFileSync(ledgerPath,JSON.stringify({utcDate,reservedCycles:reserved+1},null,2));
const conf=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'),cfToken=conf.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!cfToken)throw Error('F7_CF_AUTH_UNAVAILABLE');
const name='nttu-f7-cpu-'+randomUUID().replaceAll('-','').slice(0,10),token=randomBytes(32).toString('hex'),origin='https://'+name+'.nttu-kts-johntroger.workers.dev';
const resources={worker:name,bucket:name,databaseName:name,release:sha,databaseId:null,workerAttempted:false,bucketAttempted:false,imageAttempted:false,imageKey:null,deleted:false};
const save=()=>writeFileSync(root+'/cloud-smoke-resources.json',JSON.stringify(resources,null,2));save();
async function cf(path,method='GET',body){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,redirect:'error',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok||data.success!==true)throw Error('F7_CF_OPERATION_'+response.status);return data.result;
}
function guard(){if(!/^nttu-f7-cpu-[a-f0-9]{10}$/.test(resources.worker)||resources.bucket!==name||resources.databaseName!==name||resources.databaseId&&(!/^[a-f0-9-]{36}$/.test(resources.databaseId)||[liveDB,'83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(resources.databaseId)))throw Error('F7_RESOURCE_OWNERSHIP_INVALID');}
function wrangler(args,label,input){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',input,timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});writeFileSync(root+'/cloud-smoke-'+label+'.log',(r.stdout??'')+(r.stderr??''));if(r.status!==0)throw Error('F7_WRANGLER_'+label);}
let fixture,failure;const report={release:sha,realMetaPosts:0,realTelegramMessages:0,cloudCPUAccepted:false,cpuEvidence:'NOT_MEASURED',cleanupErrors:[]};
try{
 const backup=readFileSync('tmp/step38/f4/backup/production-schema14.sql');if(backup.length<1000||backup.includes(Buffer.from('CREATE TABLE production_runner_sessions')))throw Error('F7_SCHEMA14_BACKUP_REQUIRED');
 const local=new DatabaseSync(':memory:');let image;
 try{local.exec(backup.toString());image=local.prepare("SELECT l.storage_key,l.checksum FROM posts p JOIN content_entries c ON c.post_id=p.id JOIN post_versions v ON v.id=c.active_version_id JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE p.content_key='P01'").get();}finally{local.close();}
 if(!image||! /^[a-zA-Z0-9_./-]{1,200}$/.test(image.storage_key)||image.storage_key.includes('..')||image.checksum!==createHash('sha256').update(readFileSync('assets/batch/v1/P01.png')).digest('hex'))throw Error('F7_APPROVED_IMAGE_MISMATCH');
 resources.imageKey=image.storage_key;save();
 const db=await cf('/d1/database','POST',{name});resources.databaseId=db.uuid;save();guard();
 resources.bucketAttempted=true;save();await cf('/r2/buckets','POST',{name});
 const config={name,account_id:account,main:'../../../tests/helpers/production-f7-cpu-worker.ts',compatibility_date:'2026-10-07',workers_dev:true,preview_urls:false,limits:{cpu_ms:10},triggers:{crons:[]},vars:{APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_PUBLISHER_ENABLED:'false',RELEASE_SHA:sha,PRODUCTION_DATABASE_ID:liveDB,PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',META_PAGE_ID:'817593604765443',CPU_TEST_MODE:'private-f7',CPU_TEST_NAME:name,CPU_TEST_DATABASE_ID:db.uuid,CPU_TEST_ASSET_BUCKET:name,CPU_DEPLOYMENT:'1'},d1_databases:[{binding:'DB',database_name:name,database_id:db.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:name}],observability:{enabled:true,head_sampling_rate:1}};
 const configPath=root+'/cloud-smoke-config.json';writeFileSync(configPath,JSON.stringify(config,null,2));
 wrangler(['d1','execute',name,'--remote','--config',configPath,'--file','tmp/step38/f4/backup/production-schema14.sql','--yes'],'import');
 const at=Date.now(),day=businessDate(new Date(at)),fingerprint=await metaFingerprint(SIMULATION_META);
 const seed=`DROP TRIGGER production_usage_no_delete;
 DELETE FROM production_send_permits;
 UPDATE application_state SET paused_by_user=0,maintenance_owner=NULL,blocked_reasons='[]' WHERE environment='production';
 UPDATE production_publisher_config SET enabled=1,start_date='${day}',active_job=NULL,blocked=NULL,stock_pending=0,connection_hash='${fingerprint}' WHERE id=1;
 INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at)
 SELECT 'f7-private-permit','817593604765443',v.id,r.caption_snapshot,a.checksum,'${day}',${at},${at+3600000},'test','tranthanhtung37@gmail.com',${at-1000}
 FROM posts p JOIN content_entries c ON c.post_id=p.id JOIN post_versions v ON v.id=c.active_version_id JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version JOIN assets a ON a.id=v.asset_id WHERE p.content_key='P01';`;
 writeFileSync(root+'/cloud-smoke-seed.sql',productionMigrations(liveDB,{publisherRunner:true}).slice(14).map(m=>m.sql).join('\n')+seed);
 wrangler(['d1','execute',name,'--remote','--config',configPath,'--file',root+'/cloud-smoke-seed.sql','--yes'],'seed');
 resources.imageAttempted=true;save();wrangler(['r2','object','put',name+'/'+resources.imageKey,'--remote','--file','assets/batch/v1/P01.png','--config',configPath],'image');
 resources.workerAttempted=true;save();wrangler(['deploy','--config',configPath],'deploy');wrangler(['secret','put','CPU_TEST_TOKEN','--config',configPath],'secret',token);
 const deployments=await cf('/workers/scripts/'+name+'/deployments');resources.version=deployments.deployments?.[0]?.versions?.[0]?.version_id;save();
 const requests=[];
 fixture=await runnerFixture({open:false,graphHook:async(_url,request)=>{if(request.method==='POST')fixture.setTime(Date.now());},apiHandler:async request=>{
  const path=new URL(request.url).pathname;
  const response=await fetch(origin+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:await request.text(),signal:AbortSignal.timeout(20000)});
  requests.push({path,status:response.status});const bytes=await response.arrayBuffer(),headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(bytes,{status:response.status,headers});
 }});fixture.setTime(Date.now());
 const result=await runSimulatedActionsRunner({...fixture.options,expectedRelease:sha});assert.equal(result.state,'confirmed',JSON.stringify(result));assert.equal(fixture.postCount(),1);
 const stock=await scanRunnerStock(simulatedClient(fixture.options),{expectedRelease:sha});assert.equal(stock.remaining,39);
 const heartbeat=await fixture.request('/runner/heartbeat',{runId:'12345',state:'started'});assert.equal(heartbeat.status,200);await heartbeat.arrayBuffer();
 const complete=await fixture.request('/runner/heartbeat',{runId:'12345',state:'completed'});assert.equal(complete.status,200);await complete.arrayBuffer();
 const watchdog=await fixture.request('/runner/watchdog');assert.equal(watchdog.status,200);await watchdog.arrayBuffer();
 Object.assign(report,{version:resources.version,result,stock,requests,mockPosts:fixture.postCount(),backupSHA256:createHash('sha256').update(backup).digest('hex')});
}catch(error){failure=error instanceof Error?error.message:'F7_CLOUD_SMOKE_FAILED';}
finally{
 try{await fixture?.dispose();}catch{failure??='F7_FIXTURE_CLEANUP_FAILED';}
 guard();
 if(resources.workerAttempted)try{await cf('/workers/scripts/'+name,'DELETE');}catch{report.cleanupErrors.push('worker');}
 if(resources.bucketAttempted){if(resources.imageAttempted)try{wrangler(['r2','object','delete',name+'/'+resources.imageKey,'--remote','--config',root+'/cloud-smoke-config.json'],'delete-image');}catch{report.cleanupErrors.push('image');}
  try{await cf('/r2/buckets/'+name,'DELETE');}catch{report.cleanupErrors.push('bucket');}}
 if(resources.databaseId)try{await cf('/d1/database/'+resources.databaseId,'DELETE');}catch{report.cleanupErrors.push('database');}
 resources.deleted=report.cleanupErrors.length===0;save();report.failure=failure??null;writeFileSync(root+'/cloud-smoke-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(failure||report.cleanupErrors.length)process.exitCode=1;
