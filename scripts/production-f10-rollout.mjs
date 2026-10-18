// Approved F10 closed release synchronization. No publishing/notification transport.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root='tmp/step38/f10',sha='cd2dd2196d035e3c7e83e1d8959d8773ec2219a0',old='9ce88cc7be80755a6b4c57a95a94964c79de2e1e';
const account='4d46e32e5c27ff522ee857308a53e729',db='09cdecc7-36a2-4196-950e-ef68b1ecd834';
const git=(args,input)=>spawnSync('git',args,{input,encoding:'utf8'});
assert.equal(git(['rev-parse','HEAD']).stdout.trim(),sha);assert.equal(git(['diff',old,sha,'--','src','ui','assets','cloud','migrations']).stdout.trim(),'');
const token=git(['credential','fill'],'protocol=https\nhost=github.com\n\n').stdout.match(/^password=(.+)$/m)?.[1];assert(token);
async function gh(path,method='GET',body){const r=await fetch('https://api.github.com/repos/johntroger/nttu-digital-economics-publisher'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,'GitHub operation failed '+r.status);return r.status===204?null:r.json();}
assert.equal((await gh('/git/ref/heads/main')).object.sha,sha);assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
const promotion=JSON.parse(readFileSync(root+'/main-fast-forward.json'));assert.equal(promotion.to,sha);
const ci=JSON.parse(readFileSync(root+'/ci.json'));assert(ci.some(r=>r.sha===sha&&r.event==='pull_request'&&r.conclusion==='success'),'Exact reviewed SHA must have passed CI');
const refreshed=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','whoami'],{encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});assert.equal(refreshed.status,0,'Cloudflare session unavailable');
const cfToken=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert(cfToken);
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success,'Cloudflare administration failed '+r.status);return j.result;}
async function closed(){const row=(await cf('/d1/database/'+db+'/query',{sql:"SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM cloud_library) assets,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM production_send_permits) permits,(SELECT count(*) FROM production_publisher_jobs) jobs,(SELECT count(*) FROM production_publisher_attempts) attempts,(SELECT count(*) FROM production_publisher_usage) publications,c.enabled,a.paused_by_user FROM production_publisher_config c JOIN application_state a ON a.environment='production' WHERE c.id=1",params:[]}))[0].results[0];assert.deepEqual(row,{posts:40,assets:56,migrations:16,permits:0,jobs:0,attempts:0,publications:0,enabled:0,paused_by_user:1});return row;}
const gates=['DAILY_PUBLISHING_ENABLED','PRODUCTION_PUBLISHER_ENABLED','PRODUCTION_RUNNER_ENABLED'];
async function settings(name,release){const s=await cf('/workers/scripts/'+name+'/settings');const vars=Object.fromEntries(s.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));for(const key of gates)assert.equal(vars[key],'false');assert.equal(vars.RELEASE_SHA,release);const schedules=await cf('/workers/scripts/'+name+'/schedules');assert.deepEqual(schedules.schedules,[]);return {vars,bindings:s.bindings,secretNames:s.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort(),schedules:[]};}
const file=root+'/rollout.json',ledger=existsSync(file)?JSON.parse(readFileSync(file)):{sha,old,postingApproved:false,actionsEnabled:false,facebookSends:0,telegramSends:0,workers:{}};const save=()=>writeFileSync(file,JSON.stringify(ledger,null,2));
const mode=process.argv[2];
if(mode==='prepare'){
 assert(!ledger.preparedAt);ledger.before=await closed();mkdirSync(root+'/closed-config',{recursive:true});cpSync('tmp/step38/f8/closed-config/assets',root+'/closed-config/assets',{recursive:true});
 for(const [configFile,name] of [['management.json','nttu-publisher-production'],['runner.json','nttu-publisher-runner']]){
  ledger.workers[name]={before:await settings(name,old),beforeDeployments:await cf('/workers/scripts/'+name+'/deployments')};
  const config=JSON.parse(readFileSync('tmp/step38/f8/closed-config/'+configFile));config.vars.RELEASE_SHA=sha;config.keep_vars=true;for(const key of gates)assert.equal(config.vars[key],'false');assert.deepEqual(config.triggers.crons,[]);writeFileSync(root+'/closed-config/'+configFile,JSON.stringify(config,null,2));
 }ledger.preparedAt=new Date().toISOString();save();console.log('F10 configs prepared closed; existing secret names recorded.');
}else if(mode==='management'||mode==='runner'){
 assert(ledger.preparedAt);const name=mode==='management'?'nttu-publisher-production':'nttu-publisher-runner';assert(!ledger.workers[name].after);await closed();await settings(name,old);
 const deploy=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config',root+'/closed-config/'+mode+'.json'],{encoding:'utf8',timeout:180000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 assert.equal(deploy.status,0,'Closed deploy failed; provider output suppressed');const after=await settings(name,sha);assert.deepEqual(after.secretNames,ledger.workers[name].before.secretNames);assert.deepEqual(after.vars,{...ledger.workers[name].before.vars,RELEASE_SHA:sha},'Only release label may change');ledger.workers[name].after=after;ledger.workers[name].deployments=await cf('/workers/scripts/'+name+'/deployments');ledger.workers[name].deployedAt=new Date().toISOString();save();console.log(name+' deployed closed; secrets preserved.');
}else if(mode==='policy'){
 const approval=JSON.parse(readFileSync(root+'/owner-policy-confirmation.json'));assert.equal(approval.releaseSha,sha);assert.equal(approval.period,'2026-10');assert.equal(approval.postingApproved,false);assert.equal(approval.scheduleApproved,false);
 for(const name of Object.keys(ledger.workers))assert(ledger.workers[name].after);await closed();
 const policy=JSON.parse((await gh('/actions/variables/PRODUCTION_BILLING_POLICY')).value);assert.equal(policy.releaseSha,old);assert.equal(policy.period,'2026-10');assert.equal(policy.expiresAt,Date.UTC(2026,10,1));assert(policy.ownerApproved&&policy.budgetUSD===0&&policy.stopUsage===true&&policy.reserveMinutes===600&&policy.autoRenew===false);
 policy.releaseSha=sha;policy.verifiedAt=Date.now();
 // Owner explicitly re-attested this same monthly policy for cd2dd21 on 11 October.
 for(const [name,value] of [['PRODUCTION_RUNNER_RELEASE',sha],['PRODUCTION_BILLING_POLICY',JSON.stringify(policy)]]){await gh('/actions/variables/'+name,'PATCH',{name,value});assert.equal((await gh('/actions/variables/'+name)).value,value);}
 ledger.policy={...policy,confirmation:'Owner confirmed F10 cd2dd21; full SHA corrected in commentary before reply',budgetReadFreshThisMode:false};ledger.policyAppliedAt=new Date().toISOString();save();console.log('Owner monthly policy and runner release synchronized; Actions remains false.');
}else if(mode==='verify'){
 assert(ledger.policyAppliedAt);ledger.final=await closed();for(const name of Object.keys(ledger.workers)){const s=await settings(name,sha);assert.deepEqual(s.secretNames,ledger.workers[name].before.secretNames);}
 assert.equal((await gh('/actions/variables/PRODUCTION_RUNNER_RELEASE')).value,sha);assert.equal(JSON.parse((await gh('/actions/variables/PRODUCTION_BILLING_POLICY')).value).releaseSha,sha);assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 const health=await fetch('https://nttu-publisher-production.nttu-kts-johntroger.workers.dev/health',{redirect:'error',signal:AbortSignal.timeout(20000)});assert(health.ok);const h=await health.json();assert.equal(h.release,sha);assert.equal(h.publishingEnabled,false);ledger.health=h;
 const runner=await fetch('https://nttu-publisher-runner.nttu-kts-johntroger.workers.dev/runner/status',{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(runner.status,503);ledger.closedRunnerStatus=503;ledger.verifiedAt=new Date().toISOString();save();console.log(JSON.stringify({sha,state:ledger.final,runnerStatus:503,actionsEnabled:false,facebookSends:0,telegramSends:0}));
}else throw Error('Explicit closed F10 mode required');
