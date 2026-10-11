// One bounded disposable closed-monitor measurement. Always removes owned
// Worker/D1 and local token/config. No production bindings or provider sends.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {productionMigrations} from './production-management-prepare.mjs';
import {assertF5Usage} from './f5-cloud-budget.mjs';
const root='tmp/step38/f12',account='4d46e32e5c27ff522ee857308a53e729',liveDB='09cdecc7-36a2-4196-950e-ef68b1ecd834';mkdirSync(root,{recursive:true});
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();assert.equal(spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).stdout.trim(),'');
const ci=JSON.parse(readFileSync(root+'/ci.json'));assert(ci.some(r=>r.sha===sha&&r.conclusion==='success'),'Exact release CI required');
const who=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','whoami'],{encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});assert.equal(who.status,0,'Cloudflare session unavailable');
const token=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert(token);
async function cf(path,method='GET',body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'Cloudflare HTTP '+r.status);return j.result;}
const at=new Date(),query='query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{rowsRead rowsWritten}}}}}';
const usageResponse=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{account,start:at.toISOString().slice(0,10)+'T00:00:00Z',end:at.toISOString()}}),redirect:'error',signal:AbortSignal.timeout(30000)});const analytics=await usageResponse.json(),groups=analytics.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;assert(usageResponse.ok&&!analytics.errors?.length&&Array.isArray(groups),'D1 quota unavailable');
const usage={accountId:account,source:'cloudflare-account-usage',utcDate:at.toISOString().slice(0,10),capturedAt:Date.now(),rowsRead:groups.reduce((s,g)=>s+g.sum.rowsRead,0),rowsWritten:groups.reduce((s,g)=>s+g.sum.rowsWritten,0),analyticsMayLag:true};assertF5Usage(usage);writeFileSync(root+'/cloud-usage.json',JSON.stringify(usage,null,2));
const name='nttu-f12-cpu-'+randomUUID().replaceAll('-','').slice(0,10),directory=resolve('tmp/production-test-'+randomUUID());mkdirSync(directory);
const privateToken=randomBytes(32).toString('hex'),origin='https://'+name+'.nttu-kts-johntroger.workers.dev';
const resources={worker:name,databaseName:name,databaseId:null,workerAttempted:false,deleted:false};
const report={release:sha,realMetaPosts:0,realTelegramMessages:0,cloudCPUAccepted:false,cleanupErrors:[],requests:[],samples:[]};let tail,pending='',failure;
const save=()=>writeFileSync(root+'/cpu-resources.json',JSON.stringify(resources,null,2));
function guard(){assert(/^nttu-f12-cpu-[a-f0-9]{10}$/.test(resources.worker)&&resources.databaseName===resources.worker);if(resources.databaseId)assert(/^[a-f0-9-]{36}$/.test(resources.databaseId)&&![liveDB,'83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(resources.databaseId));}
const wrangler=args=>{const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',timeout:180000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});assert.equal(r.status,0,'F12 isolated build/deploy failed; provider output suppressed');};
function parse(){const start=pending.indexOf('{');if(start<0){pending=pending.slice(-1000);return;}pending=pending.slice(start);let depth=0,quoted=false,escaped=false;for(let i=0;i<pending.length;i++){const c=pending[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{const e=JSON.parse(pending.slice(0,i+1));let marker;for(const l of e.logs??[])if(l.message?.[0]==='F12_OBSERVATION')marker=JSON.parse(l.message[1]);if(marker)report.samples.push({version:e.scriptVersion?.id??null,cold:marker.cold,outcome:e.outcome??null,cpuTime:e.cpuTime??e.metrics?.cpuTime??null,at:e.eventTimestamp??null});}catch{}pending=pending.slice(i+1);return parse();}}}
try{
 const db=await cf('/d1/database','POST',{name});resources.databaseId=db.uuid;save();guard();
 const config=resolve(directory,'config.json');writeFileSync(config,JSON.stringify({name,account_id:account,main:relative(directory,resolve('tests/helpers/production-f12-cpu-worker.ts')).replaceAll('\\','/'),compatibility_date:'2026-10-07',workers_dev:true,preview_urls:false,triggers:{crons:[]},vars:{APP_ENV:'production',INTEGRATION_MODE:'management',RELEASE_SHA:sha,DAILY_PUBLISHING_ENABLED:'false',PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_ENABLED:'false',PRODUCTION_DATABASE_ID:liveDB,PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',CPU_TEST_MODE:'private-f12',CPU_TEST_NAME:name,CPU_TEST_DATABASE_ID:db.uuid,CPU_TEST_TOKEN:privateToken},d1_databases:[{binding:'DB',database_name:name,database_id:db.uuid}],observability:{enabled:true,head_sampling_rate:1}}));
 const sql=resolve(directory,'schema.sql');writeFileSync(sql,productionMigrations(liveDB,{publisherRunner:true}).map(m=>m.sql).join('\n')+'\n'+Array.from({length:100},(_,i)=>`INSERT INTO notification_outbox(event_id,payload_json) VALUES('f12-fixture-${i}','{}');`).join('\n'));
 wrangler(['d1','execute',name,'--remote','--config',config,'--file',sql,'--yes']);resources.workerAttempted=true;save();wrangler(['deploy','--config',config]);
 resources.version=(await cf('/workers/scripts/'+name+'/deployments')).deployments?.[0]?.versions?.[0]?.version_id;save();
 tail=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','tail',name,'--format','json','--sampling-rate','0.999'],{env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});tail.stdout.on('data',data=>{pending+=data.toString();if(pending.length>2000000){pending='';failure='F12_TAIL_TOO_LARGE';}parse();});tail.stderr.on('data',()=>{});
 await new Promise(r=>setTimeout(r,5000));
 for(let i=0;i<36;i++){const r=await fetch(origin+'/api/production/monitor',{headers:{Authorization:'Bearer '+privateToken},redirect:'error',signal:AbortSignal.timeout(15000)});const status=r.ok?await r.json():null;report.requests.push({status:r.status});assert.equal(r.status,200,'F12 clone unavailable');assert(status.metaConfigurationHash&&status.metaVerificationSource==='node_required'&&status.metaVerified===false&&status.publisher.state==='closed');}
 await new Promise(r=>setTimeout(r,5000));
 const samples=report.samples.filter(s=>s.version===resources.version);assert(samples.some(s=>s.cold===true),'F12 cold observation absent');assert(samples.filter(s=>s.cold===false).length>=30,'F12 warm observations incomplete');
 const measured=samples.every(s=>Number.isFinite(s.cpuTime)&&s.cpuTime>=0);report.cpuEvidence=measured?'TAIL_MEASURED':'CPU_NOT_IN_TAIL';
 if(measured){assert(samples.every(s=>s.outcome==='ok'&&s.cpuTime<=10),'F12 CPU limit exceeded');report.cloudCPUAccepted=true;report.maxCpuMs=Math.max(...samples.map(s=>s.cpuTime));}
}catch(error){failure??=error instanceof Error?error.message:'F12_CPU_FAILED';}
finally{
 tail?.kill();if(tail?.exitCode===null)await Promise.race([new Promise(r=>tail.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);guard();
 if(resources.workerAttempted)try{await cf('/workers/scripts/'+name,'DELETE');}catch{report.cleanupErrors.push('worker');}
 if(resources.databaseId)try{await cf('/d1/database/'+resources.databaseId,'DELETE');}catch{report.cleanupErrors.push('database');}
 resources.deleted=report.cleanupErrors.length===0;save();report.failure=failure??null;writeFileSync(root+'/cpu.json',JSON.stringify(report,null,2));
 // Exact newly created directory, verified under the workspace fixture root.
 assert(directory.startsWith(resolve('tmp')+'\\production-test-'));rmSync(directory,{recursive:true,force:true});
 console.log(JSON.stringify({release:sha,requests:report.requests.length,samples:report.samples.length,cloudCPUAccepted:report.cloudCPUAccepted,cpuEvidence:report.cpuEvidence??null,failure:report.failure,resourcesDeleted:resources.deleted}));
}
if(failure||!report.cloudCPUAccepted||report.cleanupErrors.length)process.exitCode=1;
