// F9 capability setup only. Gates remain false. No Meta or Telegram calls.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root='tmp/step38/f9',base='/repos/johntroger/nttu-digital-economics-publisher';
const ghToken=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];assert(ghToken);
const auth=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','whoami'],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:60000});assert.equal(auth.status,0,'Existing Cloudflare session refresh failed');
const cfToken=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert(cfToken);
async function request(origin,path,token,method='GET',body){const r=await fetch(origin+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Capability administration failed HTTP '+r.status);return r.status===204?null:r.json();}
const gh=(p,m,b)=>request('https://api.github.com',base+p,ghToken,m,b);
const cf=(p,m,b)=>request('https://api.cloudflare.com/client/v4/accounts/4d46e32e5c27ff522ee857308a53e729',p,cfToken,m,b);
assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
const names=['nttu-publisher-production','nttu-publisher-runner'];
for(const name of names){const settings=(await cf('/workers/scripts/'+name+'/settings')).result;for(const k of ['PRODUCTION_RUNNER_ENABLED','PRODUCTION_PUBLISHER_ENABLED','DAILY_PUBLISHING_ENABLED'])assert.equal(settings.bindings.find(b=>b.name===k)?.text,'false');assert(!settings.bindings.some(b=>b.name==='PRODUCTION_RUNNER_TOKEN'),'Existing capability must not be silently rotated');}
assert(!(await gh('/environments/production-runner/secrets?per_page=100')).secrets.some(s=>s.name==='PRODUCTION_RUNNER_TOKEN'));
// Temporary registry dependency and npm cache belong to this run; run-clean removes them.
const temporary='tmp/tests/f9-crypto-'+randomUUID();mkdirSync(temporary,{recursive:true});
const install=spawnSync('powershell.exe',['-NoProfile','-Command',"npm install --prefix '"+temporary+"' --cache '"+temporary+"/cache' --ignore-scripts --no-audit --no-fund --package-lock=false libsodium-wrappers@0.7.15"],{encoding:'utf8',timeout:120000});assert.equal(install.status,0,'Temporary encryption library installation failed');
const sodium=createRequire(resolve(temporary,'package.json'))('libsodium-wrappers');await sodium.ready;
const key=await gh('/environments/production-runner/secrets/public-key');
const capability=randomBytes(32).toString('hex');
const encrypted=sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(capability),sodium.from_base64(key.key,sodium.base64_variants.ORIGINAL)),sodium.base64_variants.ORIGINAL);
const report={startedAt:new Date().toISOString(),capabilitySha256:createHash('sha256').update(capability).digest('hex'),targets:[],actionsEnabled:false,workerEnabled:false,postingApproved:false,secretValuesSavedLocally:false};
mkdirSync(root,{recursive:true});const save=()=>writeFileSync(root+'/capability-setup.json',JSON.stringify(report,null,2));save();
await gh('/environments/production-runner/secrets/PRODUCTION_RUNNER_TOKEN','PUT',{encrypted_value:encrypted,key_id:key.key_id});report.targets.push('github:environment:production-runner');save();
for(const name of names){const r=await cf('/workers/scripts/'+name+'/secrets','PUT',{name:'PRODUCTION_RUNNER_TOKEN',type:'secret_text',text:capability});assert(r.success);report.targets.push('cloudflare:'+name);save();}
for(const name of names){const bindings=(await cf('/workers/scripts/'+name+'/settings')).result.bindings;assert(bindings.some(b=>b.type==='secret_text'&&b.name==='PRODUCTION_RUNNER_TOKEN'));assert.equal(bindings.find(b=>b.name==='PRODUCTION_RUNNER_ENABLED').text,'false');}
const denied=await fetch('https://nttu-publisher-runner.nttu-kts-johntroger.workers.dev/runner/status',{method:'POST',headers:{Authorization:'Bearer '+capability,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});assert.equal(denied.status,503);
report.completedAt=new Date().toISOString();report.closedHTTPStatus=denied.status;save();console.log(JSON.stringify({completed:true,targets:report.targets,closedHTTPStatus:denied.status,actionsEnabled:false,secretValuesSavedLocally:false}));
