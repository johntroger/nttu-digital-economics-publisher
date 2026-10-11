// Local F9 checks. All runtime transport is denied; no real provider calls.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {runProductionActions} from './production-runner-live.mjs';
import {readRunnerQuota} from './production-runner-quota.mjs';
const root='tmp/step38/f9';mkdirSync(root,{recursive:true});
const prepared=JSON.parse(readFileSync(root+'/github-prepared.json'));
assert.equal(prepared.actionsEnabled,false);assert.equal(prepared.postingApproved,false);
assert.deepEqual(prepared.branchPolicies.map(p=>({name:p.name,type:p.type})),[{name:'main',type:'branch'}]);
const policy=JSON.parse(readFileSync(root+'/billing-policy-review.json'));
let calls=0;const transport=async()=>{calls++;throw Error('F9_NETWORK_FORBIDDEN');};
const closed=await runProductionActions({PRODUCTION_ACTIONS_ENABLED:'false'},{transport});assert.equal(closed.state,'closed');assert.equal(calls,0);
const quota=await readRunnerQuota({token:'fixture-only',policy,transport});assert.equal(quota.allowed,false);assert.equal(calls,0);
const run=spawnSync(process.execPath,['--test','tests/production-budget.test.mjs','tests/production-f6.test.mjs','tests/production-f7.test.mjs'],{encoding:'utf8',timeout:120000});
writeFileSync(root+'/local-checks.txt',run.stdout+'\n'+run.stderr);
assert.equal(run.status,0,'Budget/runner regression checks failed; see retained evidence');
const report={capturedAt:new Date().toISOString(),closedRunner:closed.state,unsignedPolicyRejected:true,transportCalls:calls,regressionExitCode:run.status,postingApproved:false,actionsEnabled:false};
writeFileSync(root+'/local-checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
