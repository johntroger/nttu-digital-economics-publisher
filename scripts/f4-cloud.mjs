// Explicit F4 administration. Never called by tests or scheduled jobs.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {productionMigrations,prepareProductionManagement} from './production-management-prepare.mjs';
const root='tmp/step38/f4';mkdirSync(root,{recursive:true});
const PRODUCTION='09cdecc7-36a2-4196-950e-ef68b1ecd834',ACCOUNT='4d46e32e5c27ff522ee857308a53e729';
const ledgerPath=root+'/resources.json',ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath)):{};
const save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));
const sha=()=>spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
function wrangler(args,label){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:180000});writeFileSync(root+'/'+label+'.log',r.stdout+'\n'+r.stderr);if(r.status!==0)throw Error(label+' failed; inspect retained local log');return r.stdout;}
async function cf(path,method='GET',body){const config=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('Cloudflare OAuth unavailable');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const j=await r.json();if(!r.ok||!j.success)throw Error('Cloudflare operation failed: HTTP '+r.status);return j.result;}
const query=(id,sql,params=[])=>cf('/d1/database/'+id+'/query','POST',{sql,params});
const counts="SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM cloud_library) assets,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM production_send_permits) permits,(SELECT count(*) FROM production_publisher_jobs) jobs,(SELECT count(*) FROM production_publisher_attempts) intents,(SELECT count(*) FROM production_publisher_usage) publications,c.enabled,a.paused_by_user FROM production_publisher_config c JOIN application_state a ON a.environment='production' WHERE c.id=1";
async function closedSnapshot(label){const r=await query(PRODUCTION,counts),row=r[0]?.results[0];writeFileSync(root+'/'+label+'.json',JSON.stringify(r,null,2));if(!row||row.posts!==40||row.assets!==56||row.permits||row.jobs||row.intents||row.publications||row.enabled!==0||row.paused_by_user!==1)throw Error('Production gates/data changed; operation refused');return row;}
function shadowGuard(){if(ledger.deleted||!ledger.created||!/^nttu-f4-cpu-[a-f0-9]+$/.test(ledger.databaseName??'')||!ledger.databaseId||[PRODUCTION,'83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(ledger.databaseId)||!/^nttu-f4-cpu-[a-f0-9]+$/.test(ledger.worker??'')||!/^nttu-f4-mock-[a-f0-9]+$/.test(ledger.mock??''))throw Error('Owned isolated F4 resources required');}
function backupRequired(){if(!existsSync(root+'/backup/production-schema14.sql')||!existsSync(root+'/backup/config-before.json'))throw Error('Real production backup required');}
function tested(){const current=sha(),ci=JSON.parse(readFileSync(root+'/ci.json'));if(!ci.some(x=>x.sha===current&&x.conclusion==='success')||spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).stdout.trim())throw Error('Clean CI-tested HEAD required');return current;}
const mode=process.argv[2];
if(mode==='backup'){
 const row=await closedSnapshot('production-before');if(row.migrations!==14)throw Error('Expected production schema14');mkdirSync(root+'/backup',{recursive:true});
 wrangler(['d1','export','nttu-publisher-production','--remote','--config','tmp/production-management/wrangler.json','--output',root+'/backup/production-schema14.sql'],'backup');
 writeFileSync(root+'/backup/config-before.json',readFileSync('tmp/production-management/wrangler.json'));console.log('Production schema14 backup retained; all publication gates closed.');
}else if(mode==='create'){
 tested();await closedSnapshot('production-before-shadow');if(ledger.created)throw Error('Existing F4 resources must be reused or cleaned');
 const suffix=randomBytes(5).toString('hex');ledger.databaseName='nttu-f4-cpu-'+suffix;ledger.worker=ledger.databaseName;ledger.mock='nttu-f4-mock-'+suffix;ledger.token=randomBytes(32).toString('hex');save();
 const db=await cf('/d1/database','POST',{name:ledger.databaseName});ledger.databaseId=db.uuid;ledger.created=true;save();shadowGuard();
 console.log(JSON.stringify({database:ledger.databaseName,databaseId:ledger.databaseId,worker:ledger.worker,mock:ledger.mock}));
}else if(mode==='seed'){
 shadowGuard();backupRequired();if(ledger.seeded)throw Error('F4 database already seeded');
 const config={name:ledger.worker,compatibility_date:'2026-10-05',account_id:ACCOUNT,d1_databases:[{binding:'DB',database_name:ledger.databaseName,database_id:ledger.databaseId}]};writeFileSync(root+'/seed-config.json',JSON.stringify(config));
 wrangler(['d1','execute',ledger.databaseName,'--remote','--config',root+'/seed-config.json','--file',root+'/backup/production-schema14.sql','--yes'],'shadow-import');
 const m=productionMigrations(PRODUCTION,{publisherStages:true}).at(-1);writeFileSync(root+'/shadow-migration15.sql',m.sql);wrangler(['d1','execute',ledger.databaseName,'--remote','--config',root+'/seed-config.json','--file',root+'/shadow-migration15.sql','--yes'],'shadow-migration');
 await query(ledger.databaseId,'DROP TRIGGER production_usage_no_delete');ledger.seeded=true;save();console.log('Isolated clone seeded; test-only reset trigger removed, production untouched.');
}else if(mode==='deploy-shadow'){
 shadowGuard();const release=tested(),base=JSON.parse(readFileSync('tmp/production-management/wrangler.json'));
 ledger.origin='https://'+ledger.worker+'.nttu-kts-johntroger.workers.dev';ledger.mockOrigin='https://'+ledger.mock+'.nttu-kts-johntroger.workers.dev';ledger.release=release;ledger.deployment=(ledger.deployment??0)+1;save();
 for(const [name,entry,label] of [[ledger.mock,'production-cpu-mock.ts','mock'],[ledger.worker,'production-cpu-worker.ts','cpu']]){
  const config={name,account_id:ACCOUNT,compatibility_date:'2026-10-05',workers_dev:true,preview_urls:false,main:'../../../tests/helpers/'+entry,vars:{...base.vars,RELEASE_SHA:release,CPU_TEST_MODE:'isolated-f4',CPU_TEST_DATABASE_ID:ledger.databaseId,CPU_MOCK_ORIGIN:ledger.mockOrigin,CPU_DEPLOYMENT:String(ledger.deployment)},d1_databases:[{binding:'DB',database_name:ledger.databaseName,database_id:ledger.databaseId}],r2_buckets:label==='cpu'?[{binding:'MEDIA',bucket_name:'nttu-publisher-production-assets'}]:[],observability:{enabled:true,head_sampling_rate:1}};
  const path=root+'/'+label+'-config.json';writeFileSync(path,JSON.stringify(config,null,2));const out=wrangler(['deploy','--config',path],'deploy-'+label);ledger[label+'Version']=out.match(/Current Version ID: ([a-f0-9-]+)/)?.[1];save();
  if(!ledger[label+'SecretConfigured']){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','put','CPU_TEST_TOKEN','--config',path],{input:ledger.token,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:60000});if(r.status!==0)throw Error('F4 private secret configuration failed');ledger[label+'SecretConfigured']=true;save();}
  const current=await cf('/workers/scripts/'+name+'/deployments');ledger[label+'Version']=current.deployments?.[0]?.versions?.[0]?.version_id??ledger[label+'Version'];save();
 }console.log(JSON.stringify({release,worker:ledger.worker,deployment:ledger.deployment}));
}else if(mode==='migrate-production'){
 const release=tested();backupRequired();const deployed=JSON.parse(readFileSync(root+'/production-version.json'));if(deployed.release!==release)throw Error('Deploy schema14/15 compatible closed Worker before migration');const row=await closedSnapshot('production-before-migration');if(row.migrations!==14)throw Error('Expected migration14 baseline');
 const m=productionMigrations(PRODUCTION,{publisherStages:true}).at(-1);writeFileSync(root+'/production-migration15.sql',m.sql);wrangler(['d1','execute','nttu-publisher-production','--remote','--config','tmp/production-management/wrangler.json','--file',root+'/production-migration15.sql','--yes'],'production-migration');
 const after=await closedSnapshot('production-after-migration');if(after.migrations!==15)throw Error('Production migration15 not observed');console.log('Production schema15 installed; publisher disabled and no permit/job/publication.');
}else if(mode==='deploy-production'){
 const release=tested(),before=JSON.parse(readFileSync('tmp/production-management/wrangler.json'));backupRequired();await closedSnapshot('production-before-deploy');
 prepareProductionManagement({databaseId:PRODUCTION,releaseSha:release,origin:before.vars.AUTH_ORIGIN},{clientId:before.vars.GOOGLE_CLIENT_ID,publisherStages:true});
 const out=wrangler(['deploy','--config','tmp/production-management/wrangler.json'],'deploy-production');writeFileSync(root+'/production-version.json',JSON.stringify({release,version:out.match(/Current Version ID: ([a-f0-9-]+)/)?.[1],publishingEnabled:false}));await closedSnapshot('production-after-deploy');console.log('CI-tested production deployed with publication gates closed.');
}else if(mode==='snapshot')console.log(JSON.stringify(await closedSnapshot('production-final')));
else if(mode==='cleanup-shadow'){
 shadowGuard();for(const name of [ledger.worker,ledger.mock]){const r=await cf('/workers/scripts/'+name,'DELETE');}await cf('/d1/database/'+ledger.databaseId,'DELETE');ledger.deleted=true;delete ledger.token;save();console.log('Owned F4 test Workers/database removed; real backup and acceptance evidence retained.');
}else throw Error('Choose an explicit authorized F4 operation');
