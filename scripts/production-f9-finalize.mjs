// Approved monthly policy storage and closed-state readback. No dispatch or posting.
import {readFileSync,writeFileSync,cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {quotaDecision} from './production-runner-quota.mjs';
import {composeCaption} from '../src/domain/footer.ts';
const root='tmp/step38/f9',base='/repos/johntroger/nttu-digital-economics-publisher';
const token=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];assert(token);
async function gh(path,method='GET',body){const r=await fetch('https://api.github.com'+base+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('F9 GitHub operation failed HTTP '+r.status);return r.status===204?null:r.json();}
assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
const names=(await gh('/environments/production-runner/secrets?per_page=100')).secrets.map(s=>s.name);
for(const name of ['PRODUCTION_META_APP_SECRET','PRODUCTION_META_PAGE_ACCESS_TOKEN','PRODUCTION_RUNNER_TOKEN'])assert(names.includes(name));
assert(JSON.parse(readFileSync(root+'/capability-setup.json')).completedAt);
const observation=JSON.parse(readFileSync(root+'/billing-ui-observation.json'));
assert(observation.budgetUSD===0&&observation.stopUsage===true&&observation.plan==='free');
assert(Date.now()-Date.parse(observation.capturedAt)<1800000,'Fresh reviewed budget observation required');
const policy=JSON.parse(readFileSync(root+'/billing-policy-review.json'));policy.ownerApproved=true;
assert.equal(policy.releaseSha,'9ce88cc7be80755a6b4c57a95a94964c79de2e1e');
const validation=quotaDecision({usageItems:[{date:new Date().toISOString().slice(0,10),product:'actions',sku:'actions_linux',unitType:'Minutes',quantity:1184,netAmount:0}]},policy);assert(validation.allowed,'Policy validation failed');
// Above usage is validation input only, not a new API receipt.
const variables=await gh('/actions/variables?per_page=100');const found=variables.variables.some(v=>v.name==='PRODUCTION_BILLING_POLICY');
const value=JSON.stringify(policy);await gh('/actions/variables'+(found?'/PRODUCTION_BILLING_POLICY':''),found?'PATCH':'POST',{name:'PRODUCTION_BILLING_POLICY',value});
assert.equal((await gh('/actions/variables/PRODUCTION_BILLING_POLICY')).value,value);writeFileSync(root+'/billing-policy-applied.json',JSON.stringify(policy,null,2));
const cfToken=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert(cfToken);
const cfBase='https://api.cloudflare.com/client/v4/accounts/4d46e32e5c27ff522ee857308a53e729';
async function cf(path,body){const r=await fetch(cfBase+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success);return j.result;}
for(const name of ['nttu-publisher-production','nttu-publisher-runner']){const bindings=(await cf('/workers/scripts/'+name+'/settings')).bindings;for(const key of ['PRODUCTION_RUNNER_ENABLED','PRODUCTION_PUBLISHER_ENABLED','DAILY_PUBLISHING_ENABLED'])assert.equal(bindings.find(b=>b.name===key)?.text,'false');}
const rows=await cf('/d1/database/09cdecc7-36a2-4196-950e-ef68b1ecd834/query',{sql:"SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM cloud_library) assets,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM production_publisher_jobs) jobs,(SELECT count(*) FROM production_publisher_attempts) attempts,(SELECT count(*) FROM production_publisher_usage) publications,c.enabled,a.paused_by_user FROM production_publisher_config c JOIN application_state a ON a.environment='production' WHERE c.id=1",params:[]});
const state=rows[0].results[0];assert.deepEqual(state,{posts:40,assets:56,migrations:16,jobs:0,attempts:0,publications:0,enabled:0,paused_by_user:1});
const db=new DatabaseSync(':memory:');let sample;
try{db.exec(readFileSync('tmp/step38/f8/backup/production-schema14.sql','utf8'));sample={...db.prepare("SELECT p.id post_id,p.content_key,v.id version_id,v.version,v.caption_title,v.body,l.checksum image_sha256 FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE p.content_key='P01'").get()};}finally{db.close();}
assert(sample.post_id);const image=readFileSync('assets/batch/v1/P01.png');assert.equal(createHash('sha256').update(image).digest('hex'),sample.image_sha256);
sample.caption=composeCaption(sample.body);sample.caption_sha256=createHash('sha256').update(sample.caption).digest('hex');sample.pageId='817593604765443';sample.postingApproved=false;sample.scheduledAt=null;sample.source='fresh F8 backup; protected content unchanged after rollout';
cpSync('assets/batch/v1/P01.png',root+'/P01.png');writeFileSync(root+'/sample-P01.json',JSON.stringify(sample,null,2));writeFileSync(root+'/sample-P01-caption.txt',sample.caption);
const branch=await gh('/branches/main');
const result={completedAt:new Date().toISOString(),secretNames:names,monthlyPolicyApplied:true,ownerApproval:'explicit current-conversation confirmation for 2026-10/release9ce88cc7',releaseSha:policy.releaseSha,mainSha:branch.commit.sha,mainMatchesRelease:branch.commit.sha===policy.releaseSha,liveState:state,actionsEnabled:false,postingApproved:false,scheduleEnabled:false,realFacebookCalls:0,realTelegramCalls:0,newBillingAPIReceipt:false,nextRequired:'approved main/workflow/release promotion while gates remain closed'};
writeFileSync(root+'/acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
