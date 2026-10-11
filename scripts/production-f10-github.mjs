// F10 closed promotion administration. No Meta, Telegram or Worker transport.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='tmp/step38/f10',repo='johntroger/nttu-digital-economics-publisher';
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
 const branch='codex/step38-f10-closed-promotion';const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();assert.equal((await gh('/git/ref/heads/'+branch)).object.sha,sha);
 const prs=await gh('/pulls?head=johntroger:'+branch+'&state=open');
 const pr=prs[0]??await gh('/pulls','POST',{base:'main',head:branch,title:'Synchronize closed production runner release with main',body:'Main currently lacks the accepted production runner stack. Merge it with the existing independent monitoring fixes and record closed F8/F9 deployment and permission evidence. Production Actions, runner, legacy publisher and daily scheduling remain disabled.\n\nValidation: local TypeScript, 471 portable tests and repository content checks passed. Worker source and workflows match CPU-accepted release 9ce88cc7; the monitor merge conflict was line endings only. Fresh account usage is 1201 conservative minutes, 0 USD, retaining 600 minutes plus 70 for promotion CI. Before updating main, temporarily disable staging auto-deploy and restore its original value after CI. Monthly owner policy must be rebound explicitly to the final release SHA before operation.'});
 await gh('/pulls/'+pr.number,'PATCH',{body:'Synchronize the accepted closed production runner stack with main, retaining all independent monitoring fixes. The monitor now understands schemas 15/16 and distinguishes a stored runner credential from open send gates; missing/unknown gates, wrong engine and unknown schema still alert. Meta remains unverified until the trusted Node runner checks it.\n\nValidation: TypeScript and the 471-test portable baseline passed; 28 monitor regression tests passed after adding schema compatibility. Pre-push repeats full local checks. Worker source and workflows are unchanged from CPU-accepted 9ce88cc7. Fresh usage: 1201 conservative minutes, 0 USD, with 600 reserved and 70 allowed for promotion CI. Keep all production sending/schedule gates false. Temporarily disable staging auto-deploy during the main promotion and restore it after CI. Final release SHA requires explicit monthly owner policy confirmation.'});
 save('pull-request',{number:pr.number,url:pr.html_url,sha,base:pr.base.sha});console.log(JSON.stringify({number:pr.number,url:pr.html_url,sha}));
}else if(mode==='ci'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json'));
 const runs=(await gh('/actions/workflows/ci.yml/runs?head_sha='+pr.sha+'&per_page=20')).workflow_runs.filter(r=>r.head_sha===pr.sha);
 const result=[];for(const run of runs){const jobs=(await gh('/actions/runs/'+run.id+'/jobs')).jobs;result.push({id:run.id,event:run.event,sha:run.head_sha,status:run.status,conclusion:run.conclusion,url:run.html_url,jobs:jobs.map(j=>({name:j.name,status:j.status,conclusion:j.conclusion}))});}
 save('ci',result);console.log(JSON.stringify(result));
}else if(mode==='staging-off'){
 const pr=JSON.parse(readFileSync(root+'/pull-request.json')),ci=JSON.parse(readFileSync(root+'/ci.json'));
 assert(ci.some(r=>r.sha===pr.sha&&r.event==='pull_request'&&r.conclusion==='success'&&['portable-checks (windows-latest)','portable-checks (ubuntu-latest)'].every(name=>r.jobs.some(j=>j.name===name&&j.conclusion==='success'))),'Exact PR CI required');
 const before=JSON.parse(readFileSync(root+'/github-before.json'));assert.equal((await gh('/git/ref/heads/main')).object.sha,before.main,'Main changed; review again');assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,before.stagingDeploy);
 await gh('/actions/variables/STAGING_DEPLOY_ENABLED','PATCH',{name:'STAGING_DEPLOY_ENABLED',value:'false'});assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,'false');save('staging-gate',{at:new Date().toISOString(),before:before.stagingDeploy,during:'false'});console.log('Staging deployment gate disabled; staging publishing schedule untouched.');
}else if(mode==='staging-restore'){
 const before=JSON.parse(readFileSync(root+'/github-before.json')),pr=JSON.parse(readFileSync(root+'/pull-request.json')),ci=JSON.parse(readFileSync(root+'/ci.json'));
 assert.equal((await gh('/git/ref/heads/main')).object.sha,pr.sha);assert(ci.some(r=>r.event==='push'&&r.sha===pr.sha&&r.conclusion==='success'&&r.jobs.some(j=>j.name==='deploy-staging'&&j.conclusion==='skipped')));
 assert.equal((await gh('/actions/variables/PRODUCTION_ACTIONS_ENABLED')).value,'false');
 await gh('/actions/variables/STAGING_DEPLOY_ENABLED','PATCH',{name:'STAGING_DEPLOY_ENABLED',value:before.stagingDeploy});assert.equal((await gh('/actions/variables/STAGING_DEPLOY_ENABLED')).value,before.stagingDeploy);save('main-promoted',{at:new Date().toISOString(),sha:pr.sha,stagingRestored:before.stagingDeploy,actionsGate:'false',ci});console.log('Main CI passed; staging deploy gate restored. No production gate enabled.');
}else throw Error('Explicit F10 mode required');
