import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRunnerQuota,REPOSITORY} from '../scripts/production-runner-quota.mjs';
const now=Date.parse('2026-10-27T03:00:00Z'),sha='a'.repeat(40);
const policy={policyVersion:2,account:'johntroger',product:'Actions',scope:'account',plan:'free',budgetUSD:0,stopUsage:true,includedMinutes:2000,reserveMinutes:600,cycleMinutes:5,verificationMode:'owner-monthly-attestation',evidenceSource:'authenticated-github-ui',reviewedBy:'tranthanhtung37@gmail.com',ownerApproved:true,autoRenew:false,period:'2026-10',verifiedAt:now-1000,expiresAt:Date.parse('2026-11-01T00:00:00Z'),releaseSha:sha};
const context={ACTIONS_COST_MODE:'verified-public-standard',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:REPOSITORY,GITHUB_REF:'refs/heads/main',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_JOB:'run',GITHUB_WORKFLOW_REF:REPOSITORY+'/.github/workflows/production-runner.yml@refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,PRODUCTION_RUNNER_RELEASE:sha,GITHUB_TOKEN:'fixture-job-token'};
const fixtures=()=>({repo:{full_name:REPOSITORY,private:false,visibility:'public'},run:{id:123,head_sha:sha,head_branch:'main',path:'.github/workflows/production-runner.yml',event:'workflow_dispatch',status:'in_progress',run_attempt:1},jobs:{total_count:1,jobs:[{name:'run',status:'in_progress',runner_group_name:'GitHub Actions',labels:['ubuntu-latest']}]}});
function provider(data){const calls=[];return {calls,transport:async url=>{calls.push(url);const path=new URL(url).pathname;if(path.endsWith('/jobs'))return Response.json(data.jobs);if(path.endsWith('/runs/123'))return Response.json(data.run);if(path==='/repos/'+REPOSITORY)return Response.json(data.repo);if(path.includes('/billing/usage'))return Response.json({usageItems:[{date:'2026-10-27',product:'Actions',sku:'Actions Linux',unitType:'Minutes',quantity:9000,netAmount:0}]});throw Error('UNEXPECTED_ROUTE');}};}
const check=async(data=fixtures(),extra={})=>{const p=provider(data);return {result:await readRunnerQuota({policy,context,now,transport:p.transport,...extra}),calls:p.calls};};
test('Verified public standard job ignores private-account minute exhaustion and needs no billing token',async()=>{
 const {result,calls}=await check();assert.equal(result.allowed,true);assert.equal(result.reason,'public_standard_runner');assert.equal(result.minuteLimit,null);assert.equal(result.remainingMinutes,null);assert.equal(result.usedMinutes,null);assert.equal(calls.length,3);assert(!calls.some(p=>p.includes('/billing/')));
});
test('Private repository uses the existing account budget path',async()=>{
 const data=fixtures();data.repo.private=true;data.repo.visibility='private';const {result,calls}=await check(data,{token:'fixture-billing'});assert.equal(result.allowed,false);assert.equal(result.reason,'quota_insufficient');assert.equal(calls.length,2);assert(calls[1].includes('/billing/usage'));
});
test('Missing or mismatched context cannot claim the public exemption',async()=>{
 for(const change of [{GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_JOB:'unknown'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_RUN_ID:'../123'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_TOKEN:''},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_WORKFLOW_REF:'other/workflow'}]){
  const {result,calls}=await check(fixtures(),{context:{...context,...change}});assert.equal(result.allowed,false);assert.equal(calls.length,0);
 }
});
test('Current public visibility must be verified and cannot be supplied by a flag alone',async()=>{
 for(const change of [{full_name:'other/repo'},{visibility:'internal'},{private:undefined},{visibility:undefined}]){const data=fixtures();Object.assign(data.repo,change);assert.equal((await check(data)).result.allowed,false);}
});
test('Current workflow run and attempt must match the authorized main release',async()=>{
 for(const change of [{id:124},{head_sha:'b'.repeat(40)},{head_branch:'other'},{path:'.github/workflows/other.yml'},{event:'pull_request'},{status:'completed'},{run_attempt:2}]){const data=fixtures();Object.assign(data.run,change);assert.equal((await check(data)).result.allowed,false);}
});
test('Self-hosted, custom, larger, duplicate or stale jobs cannot claim free standard execution',async()=>{
 for(const change of [{labels:['ubuntu-16-cores']},{labels:['self-hosted','ubuntu-latest']},{runner_group_name:'Default'},{status:'completed'},{name:'other'}]){const data=fixtures();Object.assign(data.jobs.jobs[0],change);assert.equal((await check(data)).result.allowed,false);}
 const duplicate=fixtures();duplicate.jobs.jobs.push({...duplicate.jobs.jobs[0]});duplicate.jobs.total_count=2;assert.equal((await check(duplicate)).result.allowed,false);
 const partial=fixtures();partial.jobs.total_count=2;assert.equal((await check(partial)).result.allowed,false);
});
test('API errors, redirects, pagination and malformed metadata fail closed without billing fallback',async()=>{
 for(const response of [new Response('{}',{status:403}),new Response('',{status:302,headers:{Location:'https://other.invalid'}}),Response.json({}, {headers:{Link:'next'}}),Response.json({})])assert.equal((await readRunnerQuota({policy,context,now,transport:async()=>response})).allowed,false);
});
test('Public mode preserves release authorization, month expiry and zero-dollar policy requirements',async()=>{
 for(const change of [{ownerApproved:false},{autoRenew:true},{period:'2026-11'},{budgetUSD:1},{stopUsage:false},{releaseSha:'b'.repeat(40)}])assert.equal((await check(fixtures(),{policy:{...policy,...change}})).result.allowed,false);
 assert.equal((await check(fixtures(),{now:policy.expiresAt})).result.allowed,false);
});
test('Monitor schedule and GET-only verifier jobs can verify their own standard execution',async()=>{
 for(const [job,file,event] of [['monitor','monitor.yml','schedule'],['verify','production-meta-readonly.yml','workflow_dispatch']]){
  const data=fixtures();data.run.path='.github/workflows/'+file;data.run.event=event;data.jobs.jobs[0].name=job;
  const env={...context,GITHUB_JOB:job,GITHUB_EVENT_NAME:event,GITHUB_WORKFLOW_REF:REPOSITORY+'/.github/workflows/'+file+'@refs/heads/main'};
  assert.equal((await check(data,{context:env})).result.allowed,true);
 }
});
test('All production workflow callers opt in without changing runners, dispatch or schedule',()=>{
 for(const file of ['production-runner.yml','monitor.yml','production-meta-readonly.yml']){const text=readFileSync('.github/workflows/'+file,'utf8');assert.match(text,/runs-on: ubuntu-latest/);assert.match(text,/ACTIONS_COST_MODE: verified-public-standard/);}
 for(const file of ['production-runner-live.mjs','monitor-free-budget.mjs','production-meta-readonly.mjs','production-monitor-meta.mjs','production-single-test.mjs'])assert.match(readFileSync('scripts/'+file,'utf8'),/readRunnerQuota\(\{[^\n]+context:env\}/);
});
