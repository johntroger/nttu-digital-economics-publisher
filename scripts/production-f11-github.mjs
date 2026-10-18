// F11 reviewed monitoring promotion administration. No Meta, Telegram or Worker transport.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='tmp/step38/f11',repo='johntroger/nttu-digital-economics-publisher';
mkdirSync(root,{recursive:true});
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];assert(credential);
async function gh(path,method='GET',body){const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,'GitHub HTTP '+r.status);return r.status===204?null:r.json();}
const save=(name,value)=>writeFileSync(root+'/'+name+'.json',JSON.stringify(value,null,2));
const mode=process.argv[2];
if(mode==='preflight'){
 const vars=(await gh('/actions/variables?per_page=100')).variables;
 assert.equal(vars.find(v=>v.name==='PRODUCTION_ACTIONS_ENABLED')?.value,'false');
 const before={capturedAt:new Date().toISOString(),main:(await gh('/git/ref/heads/main')).object.sha,stagingDeploy:vars.find(v=>v.name==='STAGING_DEPLOY_ENABLED')?.value??null,actionsGate:'false',runnerRelease:vars.find(v=>v.name==='PRODUCTION_RUNNER_RELEASE')?.value,policy:JSON.parse(vars.find(v=>v.name==='PRODUCTION_BILLING_POLICY').value)};
 if(!existsSync(root+'/github-before.json'))save('github-before',before);
 console.log(JSON.stringify(before));
}else if(mode==='billing'){
 assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 const startedAt=new Date().toISOString();
 await gh('/actions/workflows/ci.yml/dispatches','POST',{ref:'codex/step38-f7-closed-acceptance',inputs:{f7_billing_read:true}});
 save('billing-dispatch',{startedAt,ref:'codex/step38-f7-closed-acceptance',readOnly:true});console.log('Read-only billing workflow dispatched.');
}else if(mode==='runs'){
 const runs=(await gh('/actions/workflows/ci.yml/runs?per_page=20')).workflow_runs;
 console.log(JSON.stringify(runs.map(r=>({id:r.id,sha:r.head_sha,event:r.event,branch:r.head_branch,status:r.status,conclusion:r.conclusion,url:r.html_url,createdAt:r.created_at}))));
}else if(mode==='receipt'){
 const id=Number(process.argv[3]);assert(Number.isSafeInteger(id));const run=await gh('/actions/runs/'+id);
 assert.equal(run.head_branch,'codex/step38-f7-closed-acceptance');assert.equal(run.event,'workflow_dispatch');assert.equal(run.conclusion,'success');
 const jobs=(await gh('/actions/runs/'+id+'/jobs')).jobs;const job=jobs.find(j=>j.name==='f7-billing-read');assert(job?.conclusion==='success');
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers:{Authorization:'Bearer '+credential},redirect:'manual',signal:AbortSignal.timeout(20000)});
 let content;if(r.status===302){const url=new URL(r.headers.get('location'));assert.equal(url.protocol,'https:');assert(/\.blob\.core\.windows\.net$|\.githubusercontent\.com$/.test(url.hostname));const logs=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000)});assert(logs.ok);content=await logs.text();}else{assert(r.ok);content=await r.text();}
 const match=content.match(/F7_BILLING_RECEIPT (\{[^\r\n]+\})/);assert(match);const receipt=JSON.parse(match[1]);assert(receipt.quotaUsable&&receipt.netAmountUSD===0);assert(receipt.conservativeUsedMinutes+600+70<2000,'Insufficient free CI headroom');save('billing-receipt',{...receipt,runId:id,url:run.html_url,ciAllowanceMinutes:70});console.log(JSON.stringify(receipt));
}else if(mode==='pr'){
 const receipt=JSON.parse(readFileSync(root+'/billing-receipt.json'));assert(Date.now()-Date.parse(receipt.capturedAt)<1800000);assert(receipt.conservativeUsedMinutes+600+70<2000);
 assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 const branch='codex/step38-f11-free-monitor-meta';const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();assert.equal((await gh('/git/ref/heads/'+branch)).object.sha,sha);
 const prs=await gh('/pulls?head=johntroger:'+branch+'&state=open');
 const body='The half-hour monitor cadence can consume the remaining free Actions allowance before publishing is enabled. Change it to daily 10:30 Vietnam with a Sunday fallback, cap the shared job at three minutes, and check account-wide quota before provider probes or alerts. Daily monitoring alerts on the first failed observation and uses a 26-hour gap threshold; detection can take nearly a day.\n\nAdd a manual GET-only production Meta verifier in the existing restricted production-runner environment. It checks exact main/release/workflow identity, owner monthly policy, quota, Page, app, permissions and expiry; it never calls a Worker or a Facebook publishing endpoint. Production send and schedule gates remain closed.\n\nValidation: local portable checks, TypeScript and targeted negative-context/provider tests. Worker source and migrations are unchanged. Promotion requires exact PR CI, staging auto-deploy suppression and restoration, and explicit owner re-attestation of the October zero-USD policy for the final SHA. No real Facebook publication is included.';
 const pr=prs[0]??await gh('/pulls','POST',{base:'main',head:branch,title:'Fit daily monitoring to free quota and verify production Meta with GET only',body});
 await gh('/pulls/'+pr.number,'PATCH',{title:'Fit daily monitoring to free quota and verify production Meta with GET only',body});
 save('pull-request',{number:pr.number,url:pr.html_url,sha,base:pr.base.sha});console.log(JSON.stringify({number:pr.number,url:pr.html_url,sha}));
}else if(mode==='ci'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json'));
 const runs=(await gh('/actions/workflows/ci.yml/runs?head_sha='+pr.sha+'&per_page=20')).workflow_runs.filter(r=>r.head_sha===pr.sha);
 const result=[];for(const run of runs){const jobs=(await gh('/actions/runs/'+run.id+'/jobs')).jobs;result.push({id:run.id,event:run.event,sha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url,jobs:jobs.map(j=>({name:j.name,status:j.status,conclusion:j.conclusion,startedAt:j.started_at,steps:j.steps?.filter(s=>s.status!=='queued').map(s=>({name:s.name,status:s.status,conclusion:s.conclusion}))}))});}
 save('ci',result);console.log(JSON.stringify(result));
}else if(mode==='staging-off'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json')),ci=JSON.parse(readFileSync(root+'/ci.json'));
 assert(ci.some(r=>r.sha===pr.sha&&r.event==='pull_request'&&r.conclusion==='success'&&['Portable checks (windows-latest)','Portable checks (ubuntu-latest)'].every(name=>r.jobs.some(j=>j.name===name&&j.conclusion==='success'))),'Exact PR CI required');
 const before=JSON.parse(readFileSync(root+'/github-before.json'));assert.equal((await gh('/git/ref/heads/main')).object.sha,before.main,'Main changed; review again');assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,before.stagingDeploy);
 await gh('/actions/variables/STAGING_DEPLOY_ENABLED','PATCH',{name:'STAGING_DEPLOY_ENABLED',value:'false'});assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,'false');save('staging-gate',{at:new Date().toISOString(),before:before.stagingDeploy,during:'false'});console.log('Staging deployment gate disabled; staging publishing schedule untouched.');
}else if(mode==='promote'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json')),before=JSON.parse(readFileSync(root+'/github-before.json')),ci=JSON.parse(readFileSync(root+'/ci.json'));
 assert(ci.some(r=>r.sha===pr.sha&&r.event==='pull_request'&&r.conclusion==='success'));
 assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,'false');assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');assert.equal((await gh('/git/ref/heads/main')).object.sha,before.main);
 const local=spawnSync('git',['merge-base','--is-ancestor',before.main,pr.sha]);assert.equal(local.status,0,'Only fast-forward promotion allowed');
 await gh('/git/refs/heads/main','PATCH',{sha:pr.sha,force:false});assert.equal((await gh('/git/ref/heads/main')).object.sha,pr.sha);save('main-fast-forward',{at:new Date().toISOString(),from:before.main,to:pr.sha,force:false});console.log('Main fast-forwarded to reviewed F11 SHA; all production gates closed.');
}else if(mode==='readback'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json'));assert.equal((await gh('/git/ref/heads/main')).object.sha,pr.sha);
 const content=await gh('/contents/.github/workflows/production-runner.yml?ref='+pr.sha);const text=Buffer.from(content.content,'base64').toString('utf8');const accepted=spawnSync('git',['show',pr.sha+':.github/workflows/production-runner.yml'],{encoding:'utf8'}).stdout;assert.equal(text.replaceAll('\r\n','\n'),accepted.replaceAll('\r\n','\n'));
 assert(!/^\s+schedule:/m.test(text));assert(text.includes("vars.PRODUCTION_ACTIONS_ENABLED == 'true'")&&text.includes('vars.PRODUCTION_RUNNER_RELEASE == github.sha'));
 const rules=(await gh('/environments/production-runner/deployment-branch-policies')).branch_policies;assert.equal(rules.length,1);assert.equal(rules[0].name,'main');assert.equal(rules[0].type,'branch');
 const names=(await gh('/environments/production-runner/secrets?per_page=100')).secrets.map(s=>s.name).sort();for(const name of ['PRODUCTION_META_APP_SECRET','PRODUCTION_META_PAGE_ACCESS_TOKEN','PRODUCTION_RUNNER_TOKEN'])assert(names.includes(name));
 assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');assert.equal((await gh('/actions/variables/PRODUCTION_RUNNER_RELEASE')).value,pr.sha);assert.equal(JSON.parse((await gh('/actions/variables/PRODUCTION_BILLING_POLICY')).value).releaseSha,pr.sha);
 const state=await gh('/pulls/'+pr.number);const result={capturedAt:new Date().toISOString(),sha:pr.sha,workflowSourceMatched:true,schedule:false,actionsGate:'false',environmentRules:rules.map(r=>({name:r.name,type:r.type})),secretNames:names,secretValuesRead:false,pr:{number:pr.number,state:state.state,merged:state.merged},dispatches:0};save('github-readback',result);console.log(JSON.stringify(result));
}else if(mode==='staging-restore'){
 const before=JSON.parse(readFileSync(root+'/github-before.json')),pr=JSON.parse(readFileSync(root+'/pull-request.json')),ci=JSON.parse(readFileSync(root+'/ci.json'));
 assert.equal((await gh('/git/ref/heads/main')).object.sha,pr.sha);assert(ci.some(r=>r.event==='push'&&r.sha===pr.sha&&r.conclusion==='success'&&r.jobs.some(j=>j.name==='Deploy staging foundation'&&j.conclusion==='skipped')));
 assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 await gh('/actions/variables/STAGING_DEPLOY_ENABLED','PATCH',{name:'STAGING_DEPLOY_ENABLED',value:before.stagingDeploy});assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,before.stagingDeploy);save('main-promoted',{at:new Date().toISOString(),sha:pr.sha,stagingRestored:before.stagingDeploy,actionsGate:'false',ci});console.log('Main CI passed; staging deploy gate restored. No production gate enabled.');
}else throw Error('Explicit F11 mode required');
