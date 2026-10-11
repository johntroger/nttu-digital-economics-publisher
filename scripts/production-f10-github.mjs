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
 const match=content.match(/F7_BILLING_RECEIPT (\{[^\r\n]+\})/);assert(match);const receipt=JSON.parse(match[1]);assert(receipt.quotaUsable&&receipt.netAmountUSD===0);assert(receipt.conservativeUsedMinutes+600+40<2000,'Insufficient free CI headroom');save('billing-receipt',{...receipt,runId:id,url:run.html_url,ciAllowanceMinutes:40});console.log(JSON.stringify(receipt));
}else throw Error('Explicit F10 mode required');
