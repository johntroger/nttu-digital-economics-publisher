// F12 review administration only. No deploy, credential write or provider send.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root='tmp/step38/f12',repo='johntroger/nttu-digital-economics-publisher',branch='codex/step38-f12-monitor-sync';mkdirSync(root,{recursive:true});
const token=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];assert(token,'GitHub credential unavailable');
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
async function gh(path,method='GET',body){const r=await fetch('https://api.github.com/repos/'+repo+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});assert(r.ok,'GitHub review HTTP '+r.status);return r.status===204?null:r.json();}
const save=(name,value)=>writeFileSync(root+'/'+name+'.json',JSON.stringify(value,null,2));
const mode=process.argv[2];
if(mode==='quota-dispatch'){
 const ref='codex/step38-f7-closed-acceptance';await gh('/git/ref/heads/'+ref);
 await gh('/actions/workflows/ci.yml/dispatches','POST',{ref,inputs:{f7_billing_read:true}});save('quota-dispatch',{startedAt:new Date().toISOString(),ref,readOnly:true});console.log('Existing billing GET-only workflow dispatched; no send or deployment.');
}else if(mode==='quota-runs'){
 console.log(JSON.stringify((await gh('/actions/workflows/ci.yml/runs?event=workflow_dispatch&branch=codex%2Fstep38-f7-closed-acceptance&per_page=3')).workflow_runs.map(r=>({id:r.id,sha:r.head_sha,status:r.status,conclusion:r.conclusion,createdAt:r.created_at}))));
}else if(mode==='quota-receipt'){
 const id=Number(process.argv[3]);assert(Number.isSafeInteger(id));const run=await gh('/actions/runs/'+id);assert.equal(run.head_branch,'codex/step38-f7-closed-acceptance');assert.equal(run.event,'workflow_dispatch');assert.equal(run.conclusion,'success');
 const job=(await gh('/actions/runs/'+id+'/jobs')).jobs.find(j=>j.name==='f7-billing-read');assert(job);
 const r=await fetch('https://api.github.com/repos/'+repo+'/actions/jobs/'+job.id+'/logs',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(20000)});
 let response=r;if(r.status===302){const u=new URL(r.headers.get('location'));assert.equal(u.protocol,'https:');assert(/\.blob\.core\.windows\.net$|\.githubusercontent\.com$/.test(u.hostname));response=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(20000)});}assert(response.ok);const content=await response.text();assert(content.length<2000000);
 const match=content.match(/F7_BILLING_RECEIPT (\{[^\r\n]+\})/);assert(match);const receipt=JSON.parse(match[1]);assert(receipt.quotaUsable&&receipt.netAmountUSD===0);save('billing-receipt',{runId:id,...receipt});console.log(JSON.stringify(receipt));
}else if(mode==='pr'){
 const receipt=JSON.parse(readFileSync(root+'/billing-receipt.json'));assert(Date.now()-Date.parse(receipt.capturedAt)<3600000);assert(2000-receipt.conservativeUsedMinutes-600>=70,'CI allowance and reserve required');
 assert.equal((await gh('/git/ref/heads/'+branch)).object.sha,sha);const existing=await gh('/pulls?state=open&head=johntroger:'+branch);
 const pr=existing[0]??await gh('/pulls','POST',{title:'F12: verify Meta in Node and distinguish disabled operations',head:branch,base:'main',draft:true,body:'Production monitoring reported Meta as unverified because schema16 delegates verification to Node, and required Telegram heartbeat while its external trigger was deliberately off. This change compares the protected Worker configuration fingerprint with GitHub credentials, performs fresh GET-only Meta verification and rechecks rotation; an explicit closed-operation policy removes only the stale heartbeat requirement. All publishing gates remain closed.\n\nValidation: 527 local tests, targeted monitor regressions and the compiled management Worker with native workerd/D1 and 8 KB fixture credentials. Exact-SHA Windows/Linux CI and fresh cloud CPU acceptance remain required. Owner monthly budget policy must be re-attested for the final SHA before production rollout. No real Facebook post or production schedule activation is included.'});save('pull-request',{number:pr.number,url:pr.html_url,sha});console.log(JSON.stringify({number:pr.number,url:pr.html_url,sha}));
}else if(mode==='ci'){
 const rows=(await gh('/actions/workflows/ci.yml/runs?head_sha='+sha+'&event=pull_request&per_page=5')).workflow_runs.map(r=>({id:r.id,sha:r.head_sha,event:r.event,status:r.status,conclusion:r.conclusion,url:r.html_url}));save('ci',rows);console.log(JSON.stringify(rows));
}else throw Error('Explicit review mode required');
