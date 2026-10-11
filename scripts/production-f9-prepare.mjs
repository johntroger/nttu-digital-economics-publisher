// Approved F9 administration: private environment and closed variables only.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const repo='johntroger/nttu-digital-economics-publisher',base='/repos/'+repo;
const root='tmp/step38/f9';mkdirSync(root,{recursive:true});
const token=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'}).stdout.match(/^password=(.+)$/m)?.[1];assert(token);
async function gh(path,method='GET',body){const r=await fetch('https://api.github.com'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const j=r.status===204?null:await r.json();if(!r.ok)throw Error('F9 GitHub operation failed: '+r.status);return j;}
const repoInfo=await gh(base);assert(repoInfo.private&&repoInfo.owner.login==='johntroger');
const branch=await gh(base+'/branches/main');
const previousVars=await gh(base+'/actions/variables?per_page=100');assert(previousVars.total_count<=100);
const existing=(await gh(base+'/environments?per_page=100')).environments.find(e=>e.name==='production-runner');
let previous=null;if(existing)previous=await gh(base+'/environments/production-runner');
writeFileSync(root+'/github-before.json',JSON.stringify({capturedAt:new Date().toISOString(),mainSha:branch.commit.sha,variables:previousVars.variables.filter(v=>/^PRODUCTION_(ACTIONS_ENABLED|RUNNER_RELEASE|BILLING_POLICY)$/.test(v.name)),environment:previous},null,2));
if(previous?.deployment_branch_policy?.protected_branches)throw Error('Preserve existing protected branch policy for review');
if(!existing)await gh(base+'/environments/production-runner','PUT',{deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}});
const policies=await gh(base+'/environments/production-runner/deployment-branch-policies?per_page=100');
if(policies.branch_policies.some(p=>p.name!=='main'||p.type!=='branch'))throw Error('Unexpected environment branch permission; no broadening allowed');
if(!policies.branch_policies.length)await gh(base+'/environments/production-runner/deployment-branch-policies','POST',{name:'main',type:'branch'});
async function repoVar(name,value){const found=previousVars.variables.some(v=>v.name===name);await gh(base+'/actions/variables'+(found?'/'+name:''),found?'PATCH':'POST',{name,value});}
await repoVar('PRODUCTION_ACTIONS_ENABLED','false');
const sha=JSON.parse(readFileSync('tmp/step38/f8/rollout.json')).releaseSha;
await repoVar('PRODUCTION_RUNNER_RELEASE',sha);
// Leave the policy unsigned until the concrete month/release has owner approval.
const policy={...JSON.parse(readFileSync('cloud/production-billing-policy.example.json')),period:new Date().toISOString().slice(0,7),releaseSha:sha};
writeFileSync(root+'/billing-policy-review.json',JSON.stringify(policy,null,2));
const result={capturedAt:new Date().toISOString(),privateRepository:true,mainSha:branch.commit.sha,releaseSha:sha,mainMatchesRelease:branch.commit.sha===sha,environment:await gh(base+'/environments/production-runner'),branchPolicies:(await gh(base+'/environments/production-runner/deployment-branch-policies?per_page=100')).branch_policies,secretNames:(await gh(base+'/environments/production-runner/secrets?per_page=100')).secrets.map(x=>x.name),billingSecretPresent:(await gh(base+'/actions/secrets?per_page=100')).secrets.some(s=>s.name==='PRODUCTION_BILLING_READ_TOKEN'),actionsEnabled:false,workerEnabled:false,postingApproved:false,policyApplied:false};
writeFileSync(root+'/github-prepared.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({environment:'production-runner',branchPolicies:result.branchPolicies.map(p=>({name:p.name,type:p.type})),secretNames:result.secretNames,billingSecretPresent:result.billingSecretPresent,mainMatchesRelease:result.mainMatchesRelease,actionsEnabled:false,policyApplied:false}));
