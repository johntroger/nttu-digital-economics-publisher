// Explicit F8 closed administration. No credential transfer, Actions dispatch or provider POST.
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const root='tmp/step38/f8',sha='9ce88cc7be80755a6b4c57a95a94964c79de2e1e';
const account='4d46e32e5c27ff522ee857308a53e729',id='09cdecc7-36a2-4196-950e-ef68b1ecd834';
const token=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert(token);
const git=(args,input)=>spawnSync('git',args,{input,encoding:'utf8'});
assert.equal(git(['diff',sha,'--','src','ui','assets','cloud','migrations']).stdout.trim(),'','Runtime must match CI/CPU accepted release');
const restore=JSON.parse(readFileSync(root+'/backup-restore.json'));assert(restore.migration14to16&&restore.rollback16to15);
assert.equal(createHash('sha256').update(readFileSync(root+'/backup/production-schema14.sql')).digest('hex'),restore.backupSha256);
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||!j.success)throw Error('Cloudflare administration failed: '+r.status);return j.result;}
const sql="SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM cloud_library) assets,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM production_send_permits) permits,(SELECT count(*) FROM production_publisher_jobs) jobs,(SELECT count(*) FROM production_publisher_attempts) intents,(SELECT count(*) FROM production_publisher_usage) publications,c.enabled,a.paused_by_user FROM production_publisher_config c JOIN application_state a ON a.environment='production' WHERE c.id=1";
async function closed(){const row=(await cf('/d1/database/'+id+'/query',{sql,params:[]}))[0].results[0];assert.equal(row.posts,40);assert.equal(row.assets,56);assert.equal(row.enabled,0);assert.equal(row.paused_by_user,1);for(const k of ['permits','jobs','intents','publications'])assert.equal(row[k],0);return row;}
function wrangler(args){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:180000});if(r.status!==0){console.error(r.stderr.replace(/Bearer\s+\S+/g,'Bearer [redacted]'));throw Error('Wrangler closed operation failed');}return r.stdout;}
const ledgerPath=root+'/rollout.json',ledger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath)):{releaseSha:sha,postingEnabled:false,credentialsCopied:false,actionsEnabled:false,steps:[]};
const save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger,null,2));
async function verifySettings(name){const settings=await cf('/workers/scripts/'+name+'/settings');const vars=Object.fromEntries(settings.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));for(const k of ['DAILY_PUBLISHING_ENABLED','PRODUCTION_PUBLISHER_ENABLED','PRODUCTION_RUNNER_ENABLED'])assert.equal(vars[k],'false');assert.equal(vars.RELEASE_SHA,sha);assert.equal(settings.bindings.find(b=>b.name==='DB').id??settings.bindings.find(b=>b.name==='DB').database_id,id);return {vars,secretNames:settings.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort()};}
const mode=process.argv[2];
if(mode==='prepare'){
 const credential=git(['credential','fill'],'protocol=https\nhost=github.com\n\n').stdout.match(/^password=(.+)$/m)?.[1];assert(credential);
 const r=await fetch('https://api.github.com/repos/johntroger/nttu-digital-economics-publisher/actions/runs/38058150134',{headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});assert(r.ok);const ci=await r.json();assert.equal(ci.head_sha,sha);assert.equal(ci.conclusion,'success');
 const before=await closed();assert.equal(before.migrations,14);
 mkdirSync(root+'/closed-config',{recursive:true});cpSync('tmp/step38/f7/closed-config/assets',root+'/closed-config/assets',{recursive:true});
 for(const file of ['management.json','runner.json']){const config=JSON.parse(readFileSync('tmp/step38/f7/closed-config/'+file));assert.equal(config.vars.RELEASE_SHA,sha);for(const key of ['DAILY_PUBLISHING_ENABLED','PRODUCTION_PUBLISHER_ENABLED','PRODUCTION_RUNNER_ENABLED'])assert.equal(config.vars[key],'false');assert.deepEqual(config.triggers.crons,[]);writeFileSync(root+'/closed-config/'+file,JSON.stringify(config,null,2));}
 ledger.preparedAt=new Date().toISOString();ledger.ci={id:ci.id,sha:ci.head_sha,conclusion:ci.conclusion};ledger.before=before;save();console.log('F8 exact runtime CI verified; configurations prepared closed.');
}else if(mode==='management'){
 assert(ledger.preparedAt&&!ledger.management);assert.equal((await closed()).migrations,14);
 wrangler(['deploy','--config',root+'/closed-config/management.json']);
 const settings=await verifySettings('nttu-publisher-production');const old=JSON.parse(readFileSync(root+'/backup/settings-before.json')).bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort();assert.deepEqual(settings.secretNames,old,'Existing secrets must remain');
 ledger.management={at:new Date().toISOString(),settings,deployments:await cf('/workers/scripts/nttu-publisher-production/deployments')};ledger.steps.push('management-closed');save();console.log('Management deployed closed; existing secret names preserved.');
}else if(mode==='migrate'){
 assert(ledger.management&&!ledger.migration);assert.equal((await closed()).migrations,14);await verifySettings('nttu-publisher-production');
 for(const file of ['0015_production_publisher_stages.sql','0016_production_publisher_runner.sql'])wrangler(['d1','execute','nttu-publisher-production','--remote','--config',root+'/closed-config/management.json','--file',root+'/'+file,'--yes']);
 const after=await closed();assert.equal(after.migrations,16);ledger.migration={at:new Date().toISOString(),after};ledger.steps.push('schema16-closed');save();console.log('Production schema16 verified closed; no jobs/intents/publications.');
}else if(mode==='runner'){
 assert(ledger.migration&&!ledger.runner);assert.equal((await closed()).migrations,16);
 wrangler(['deploy','--config',root+'/closed-config/runner.json']);const settings=await verifySettings('nttu-publisher-runner');assert.deepEqual(settings.secretNames,[]);
 ledger.runner={at:new Date().toISOString(),settings,deployments:await cf('/workers/scripts/nttu-publisher-runner/deployments')};ledger.steps.push('runner-closed-no-credentials');save();console.log('Dedicated runner deployed closed without outbound credentials.');
}else if(mode==='verify'){
 assert(ledger.runner);ledger.final=await closed();await verifySettings('nttu-publisher-production');await verifySettings('nttu-publisher-runner');
 const db=new DatabaseSync(':memory:');
 const canonical=rows=>JSON.stringify(rows.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))));
 try{db.exec(readFileSync(root+'/backup/production-schema14.sql','utf8'));ledger.dataChecks=[];
  for(const table of ['posts','post_versions','content_entries','cloud_library','cloud_reviews','production_publisher_jobs','production_publisher_attempts','production_publisher_usage']){
   const query='SELECT * FROM '+table+' ORDER BY rowid';
   const before=canonical(db.prepare(query).all()),after=canonical((await cf('/d1/database/'+id+'/query',{sql:query,params:[]}))[0].results);
   assert.equal(after,before,'Production data changed: '+table);ledger.dataChecks.push({table,sha256:createHash('sha256').update(after).digest('hex'),unchanged:true});
  }
 }finally{db.close();}
 ledger.schedules={};for(const name of ['nttu-publisher-production','nttu-publisher-runner']){const schedules=await cf('/workers/scripts/'+name+'/schedules');assert.deepEqual(schedules.schedules,[]);ledger.schedules[name]=[];}
 const ghToken=git(['credential','fill'],'protocol=https\nhost=github.com\n\n').stdout.match(/^password=(.+)$/m)?.[1];assert(ghToken);
 const gh=await fetch('https://api.github.com/repos/johntroger/nttu-digital-economics-publisher/actions/variables/PRODUCTION_ACTIONS_ENABLED',{headers:{Authorization:'Bearer '+ghToken,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
 assert([200,404].includes(gh.status));const variable=gh.status===200?await gh.json():null;assert(!variable||variable.value!=='true','GitHub production Actions gate must remain closed');
 ledger.actionsGate={capturedAt:new Date().toISOString(),status:gh.status,value:variable?.value??null,enabled:false,changed:false};
 const checks=[];for(const path of ['/runner/claim','/runner/status']){const r=await fetch('https://nttu-publisher-runner.nttu-kts-johntroger.workers.dev'+path,{method:path.endsWith('claim')?'POST':'GET',headers:{'Content-Type':'application/json'},body:path.endsWith('claim')?'{}':undefined,signal:AbortSignal.timeout(20000)});assert([401,403,503].includes(r.status));checks.push({path,status:r.status});}
 ledger.closedHTTP=checks;ledger.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({releaseSha:sha,final:ledger.final,checks,credentialsCopied:false,postingEnabled:false}));
}else throw Error('Explicit F8 mode required');
