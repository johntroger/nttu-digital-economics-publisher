import {pathToFileURL} from 'node:url';
import {appendFileSync} from 'node:fs';
import {readRunnerQuota,REPOSITORY} from './production-runner-quota.mjs';
export async function monitorBudget(env,{transport=fetch,now=Date.now()}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==REPOSITORY||env.GITHUB_REF!=='refs/heads/main'||!['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))return {allowed:false,reason:'context_invalid'};
 let policy;try{policy=JSON.parse(env.PRODUCTION_BILLING_POLICY??'');}catch{return {allowed:false,reason:'budget_unverified'};}
 if(policy?.policyVersion!==2||! /^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||policy.releaseSha!==env.GITHUB_SHA||env.GITHUB_SHA!==env.PRODUCTION_RUNNER_RELEASE)return {allowed:false,reason:'budget_release_changed'};
 const quota=await readRunnerQuota({token:env.PRODUCTION_BILLING_READ_TOKEN,policy,transport,now});
 return {...quota,monitorTimeoutMinutes:3};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await monitorBudget(process.env);if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'allowed='+String(result.allowed)+'\n');console.log('MONITOR_BUDGET '+JSON.stringify(result));if(!result.allowed)process.exitCode=1;}
 catch{console.error('MONITOR_BUDGET_UNAVAILABLE');process.exitCode=1;}
}
