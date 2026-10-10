// Read-only F7 account evidence. Existing credentials remain in memory.
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root='tmp/step38/f7';mkdirSync(root,{recursive:true});
const now=new Date(),account='4d46e32e5c27ff522ee857308a53e729';
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'});
const gitToken=credential.stdout?.match(/^password=(.+)$/m)?.[1];
const evidence={capturedAt:now.toISOString(),github:{},cloudflare:{}};
async function gh(path){if(!gitToken)return {status:'credential_unavailable'};const r=await fetch('https://api.github.com'+path,{headers:{Authorization:'Bearer '+gitToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},signal:AbortSignal.timeout(20000)});return {status:r.status,body:r.ok?await r.json():undefined};}
if(process.argv[2]==='secret-check'){
 const secret=await gh('/repos/johntroger/nttu-digital-economics-publisher/actions/secrets/PRODUCTION_BILLING_READ_TOKEN');
 console.log(JSON.stringify({name:'PRODUCTION_BILLING_READ_TOKEN',status:secret.status,present:secret.status===200,updatedAt:secret.body?.updated_at}));
 process.exitCode=secret.status===200||secret.status===404?0:1;
}else{
const who=await gh('/user');evidence.github.identity={status:who.status,login:who.body?.login,plan:who.body?.plan?.name};
const usage=await gh('/users/johntroger/settings/billing/usage?year='+now.getUTCFullYear()+'&month='+(now.getUTCMonth()+1));
evidence.github.usageStatus=usage.status;
if(usage.body){writeFileSync(root+'/github-usage.json',JSON.stringify(usage.body,null,2));evidence.github.usageItems=usage.body.usageItems?.length;}
const runs=await gh('/repos/johntroger/nttu-digital-economics-publisher/actions/workflows/monitor.yml/runs?per_page=10&status=completed');
evidence.github.monitorTiming=[];
for(const run of runs.body?.workflow_runs??[]){
 const timing=await gh('/repos/johntroger/nttu-digital-economics-publisher/actions/runs/'+run.id+'/timing');
 evidence.github.monitorTiming.push({id:run.id,conclusion:run.conclusion,event:run.event,status:timing.status,billable:timing.body?.billable});
}
const failed=runs.body?.workflow_runs?.find(r=>r.conclusion==='failure');
if(failed){const jobs=await gh('/repos/johntroger/nttu-digital-economics-publisher/actions/runs/'+failed.id+'/jobs');evidence.github.latestFailure={id:failed.id,jobs:[]};
 for(const job of jobs.body?.jobs??[]){const checks=await gh('/repos/johntroger/nttu-digital-economics-publisher/check-runs/'+job.id+'/annotations');
 const entry={id:job.id,name:job.name,conclusion:job.conclusion,startedAt:job.started_at,completedAt:job.completed_at,annotations:checks.body?.map(a=>({title:a.title,message:a.message})),monitorSummaries:[]};
 const logs=await fetch('https://api.github.com/repos/johntroger/nttu-digital-economics-publisher/actions/jobs/'+job.id+'/logs',{redirect:'manual',headers:{Authorization:'Bearer '+gitToken},signal:AbortSignal.timeout(20000)});
 const location=logs.headers.get('location');
 if(logs.status===302&&location&&new URL(location).protocol==='https:'){
  const text=await (await fetch(location,{signal:AbortSignal.timeout(20000)})).text();
  for(const line of text.split('\n')){const start=line.indexOf('{"checkedAt"');if(start<0)continue;try{const data=JSON.parse(line.slice(start));entry.monitorSummaries.push({checkedAt:data.checkedAt,issues:data.issues?.filter(x=>typeof x==='string'&&/^[a-z_]+$/.test(x)),notificationFailed:data.notificationFailed});}catch{}}
  entry.suppressedProviderFailure=text.includes('Independent monitor failed; configuration/checkpoint/provider unavailable.');
 }
 evidence.github.latestFailure.jobs.push(entry);}}
const c=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');const cfToken=c.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const query=`query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{rowsRead rowsWritten}}}}}`;
const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+cfToken,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{account,start:now.toISOString().slice(0,10)+'T00:00:00Z',end:now.toISOString()}}),signal:AbortSignal.timeout(20000)});
const j=await r.json();evidence.cloudflare.status=r.status;
if(j.errors?.length)evidence.cloudflare.errors=j.errors.map(e=>e.message);
else{const groups=j.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
 if(Array.isArray(groups)){const receipt={accountId:account,source:'cloudflare-account-usage',utcDate:now.toISOString().slice(0,10),capturedAt:Date.now(),rowsRead:groups.reduce((s,g)=>s+g.sum.rowsRead,0),rowsWritten:groups.reduce((s,g)=>s+g.sum.rowsWritten,0),groups:groups.length,analyticsMayLag:true};writeFileSync(root+'/account-usage.json',JSON.stringify(receipt,null,2));evidence.cloudflare=receipt;}}
writeFileSync(root+'/account-read.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
