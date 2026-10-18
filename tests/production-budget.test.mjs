import test from 'node:test';
import assert from 'node:assert/strict';
import {quotaDecision,readRunnerQuota} from '../scripts/production-runner-quota.mjs';
import {runProductionActions,LIVE_WORKFLOW} from '../scripts/production-runner-live.mjs';
import {actionsForecast} from '../scripts/production-f7-forecast.mjs';
const now=Date.parse('2026-10-25T03:00:00Z');
const policy={policyVersion:2,account:'johntroger',product:'Actions',scope:'account',plan:'free',budgetUSD:0,stopUsage:true,includedMinutes:2000,reserveMinutes:600,cycleMinutes:5,verificationMode:'owner-monthly-attestation',evidenceSource:'authenticated-github-ui',reviewedBy:'tranthanhtung37@gmail.com',ownerApproved:true,autoRenew:false,period:'2026-10',verifiedAt:Date.parse('2026-10-10T10:19:36Z'),expiresAt:Date.parse('2026-11-01T00:00:00Z'),releaseSha:'a'.repeat(40)};
const usage={usageItems:[{date:'2026-10-25',product:'actions',sku:'actions_linux',unitType:'Minutes',quantity:1000,netAmount:0}]};
const reserveRelease={ownerApproved:true,reviewedBy:policy.reviewedBy,period:policy.period,releaseSha:policy.releaseSha,approvedAt:now-1000};

test('Owner may release monthly reserve without increasing free allowance or paid budget',()=>{
 const opened={...policy,reserveMinutes:0,reserveRelease};
 assert.equal(quotaDecision({...usage,usageItems:[{...usage.usageItems[0],quantity:1396}]},policy,now).allowed,false);
 const result=quotaDecision({...usage,usageItems:[{...usage.usageItems[0],quantity:1396}]},opened,now);
 assert.equal(result.allowed,true);assert.equal(result.reservedMinutes,0);assert.equal(result.remainingMinutes,604);
 for(const change of [{budgetUSD:1},{stopUsage:false},{includedMinutes:2001},{ownerApproved:false},{autoRenew:true},{reserveMinutes:-1}])assert.equal(quotaDecision(usage,{...opened,...change},now).allowed,false);
});
test('Reserve release is bound to the reviewed owner, month, release and approval time',()=>{
 for(const release of [undefined,{}, {...reserveRelease,ownerApproved:false},{...reserveRelease,reviewedBy:'other'}, {...reserveRelease,period:'2026-11'}, {...reserveRelease,releaseSha:'b'.repeat(40)}, {...reserveRelease,approvedAt:now+1}, {...reserveRelease,approvedAt:Date.parse('2026-09-30')}, {...reserveRelease,approvedAt:Number.MAX_SAFE_INTEGER}, {...reserveRelease,approvedAt:-Number.MAX_SAFE_INTEGER}])assert.equal(quotaDecision(usage,{...policy,reserveMinutes:0,reserveRelease:release},now).reason,'reserve_unverified');
 assert.equal(quotaDecision(usage,{...policy,reserveMinutes:0,reserveRelease},policy.expiresAt).allowed,false);
});
test('Released reserve still stops at five minutes remaining and on unreadable or charged usage',async()=>{
 const opened={...policy,reserveMinutes:0,reserveRelease};
 const row=usage.usageItems[0],check=quantity=>quotaDecision({usageItems:[{...row,quantity}]},opened,now);
 assert.equal(check(1995).allowed,true);assert.equal(check(1996).allowed,false);assert.equal(check(2000).allowed,false);assert.equal(check(2001).allowed,false);
 assert.equal(quotaDecision({usageItems:[{...row,netAmount:0.01}]},opened,now).allowed,false);
 assert.equal(quotaDecision({usageItems:[]},opened,now).allowed,false);
 assert.equal((await readRunnerQuota({policy:opened,now,token:'fixture',transport:async()=>new Response('{}',{status:503})})).allowed,false);
});
test('A monthly release approval cannot relax the legacy reserve or survive a release change',()=>{
 const legacy={...policy,policyVersion:1,verifiedAt:now,reserveMinutes:0,reserveRelease};
 assert.equal(quotaDecision(usage,legacy,now).reason,'reserve_unverified');
 assert.equal(quotaDecision(usage,{...policy,reserveMinutes:0,reserveRelease,releaseSha:'b'.repeat(40)},now).reason,'reserve_unverified');
});
test('Free rollout forecast reserves full five-minute monitor jobs and weekly fallbacks',()=>{
 const options={includedMinutes:2000,usedMinutes:1116,daysRemaining:22,monitorRunsPerDay:1,monitorMinutesPerRun:5,monitorFallbackRuns:4,ciReserveMinutes:300,otherReserveMinutes:100};
 const current=actionsForecast(options);assert.equal(current.reservedMinutes,640);assert.equal(current.headroomMinutes,244);assert.equal(current.activationApproved,false);
 const full=actionsForecast({...options,daysRemaining:31,monitorFallbackRuns:5});assert.equal(full.monitorMinutes,180);assert.equal(full.reservedMinutes,735);
 assert.ok(180+300+100<=policy.reserveMinutes);
 assert.throws(()=>actionsForecast({...options,monitorFallbackRuns:-1}),/INVALID/);
});
test('Monthly budget attestation permits only an explicitly reviewed month; old 24-hour receipts are not renewed',()=>{
 assert.equal(quotaDecision(usage,policy,now).allowed,true);
 const legacy={...policy};delete legacy.policyVersion;
 assert.equal(quotaDecision(usage,legacy,now).reason,'budget_unverified');
 for(const change of [{policyVersion:3},{ownerApproved:false},{autoRenew:true},{period:'2026-11'},{verifiedAt:Date.parse('2026-09-30')},{expiresAt:policy.expiresAt+1},{releaseSha:'invalid'},{evidenceSource:'usage-api'},{reviewedBy:'other'},{budgetUSD:1},{stopUsage:false}])assert.equal(quotaDecision(usage,{...policy,...change},now).allowed,false);
 assert.equal(quotaDecision(usage,policy,policy.expiresAt).allowed,false);
 assert.equal(quotaDecision(usage,{...policy,reserveMinutes:599},now).reason,'reserve_unverified');
 assert.equal(quotaDecision(usage,policy,Number.MAX_SAFE_INTEGER).allowed,false);
});
test('Monthly attestation cannot authorize a different release and denies before billing or runner access',async()=>{
 const sha='b'.repeat(40),repo='johntroger/nttu-digital-economics-publisher';let calls=0;
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:repo+'/'+LIVE_WORKFLOW+'@refs/heads/main',GITHUB_SHA:sha,GITHUB_RUN_ID:'12345',PRODUCTION_ACTIONS_ENABLED:'true',PRODUCTION_RUNNER_RELEASE:sha,PRODUCTION_BILLING_POLICY:JSON.stringify(policy),GITHUB_TOKEN:'fixture'};
 const result=await runProductionActions(env,{now,transport:async url=>{calls++;assert.match(url,/\/actions\/runs\/12345$/);return Response.json({head_sha:sha,head_branch:'main',event:'workflow_dispatch',path:LIVE_WORKFLOW,status:'in_progress',id:12345});}});
 assert.equal(result.reason,'budget_release_changed');assert.equal(result.realPublication,'NOT_RUN');assert.equal(calls,1);
});
test('Monthly quota checks continue to reserve all-account minutes and reject charges or unreadable billing',async()=>{
 assert.equal(quotaDecision({usageItems:[{...usage.usageItems[0],quantity:1396}]},policy,now).allowed,false);
 assert.equal(quotaDecision({usageItems:[{...usage.usageItems[0],netAmount:0.01}]},policy,now).allowed,false);
 assert.equal(quotaDecision({usageItems:[]},policy,now).allowed,false);
 let calls=0;const denied=await readRunnerQuota({policy:{...policy,ownerApproved:false},now,token:'fixture',transport:()=>{calls++;throw Error('UNEXPECTED');}});
 assert.equal(denied.allowed,false);assert.equal(calls,0);
 const blocked=await readRunnerQuota({policy,now,token:'fixture',transport:async()=>new Response('{}',{status:503})});assert.equal(blocked.allowed,false);
});
