// Intentionally imports only the shared GET verifier, never the publishing runner.
import {pathToFileURL} from 'node:url';
import {inspectMetaConnection,metaCredentialsPresent} from '../src/cloud/meta.ts';
import {githubJSON,readRunnerQuota,REPOSITORY} from './production-runner-quota.mjs';
export const READONLY_WORKFLOW='.github/workflows/production-meta-readonly.yml';
export function trustedReadOnlyContext(env){return env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===REPOSITORY&&env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_WORKFLOW_REF===REPOSITORY+'/'+READONLY_WORKFLOW+'@refs/heads/main'&&env.PRODUCTION_ACTIONS_ENABLED==='false'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')&&env.GITHUB_SHA===env.PRODUCTION_RUNNER_RELEASE&&/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID??'');}
export async function verifyProductionMetaReadOnly(env,{transport=fetch,now=Date.now()}={}){
 const base={readOnly:true,realPublication:'NOT_RUN',facebookPosts:0,workerCalls:0};
 if(!trustedReadOnlyContext(env))return {...base,state:'closed',reason:'context_invalid'};
 let policy;try{policy=JSON.parse(env.PRODUCTION_BILLING_POLICY??'');}catch{return {...base,state:'quota_blocked',reason:'budget_unverified'};}
 if(policy?.policyVersion!==2||policy.releaseSha!==env.GITHUB_SHA)return {...base,state:'quota_blocked',reason:'budget_release_changed'};
 try{
  const run=await githubJSON('/repos/'+REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID,env.GITHUB_TOKEN,transport);
  if(run.head_sha!==env.GITHUB_SHA||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!==READONLY_WORKFLOW||run.status!=='in_progress'||String(run.id)!==env.GITHUB_RUN_ID)return {...base,state:'closed',reason:'workflow_identity_invalid'};
  const quota=await readRunnerQuota({token:env.PRODUCTION_BILLING_READ_TOKEN,policy,transport,now});if(!quota.allowed)return {...base,state:'quota_blocked',reason:quota.reason};
  const config={META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:env.META_APP_SECRET,META_PAGE_ACCESS_TOKEN:env.META_PAGE_ACCESS_TOKEN};
  if(!metaCredentialsPresent(config))return {...base,state:'needs_action',reason:'META_NOT_CONFIGURED'};
  let graphGets=0;
  const verified=await inspectMetaConnection(config,{now,transport:async(input,options)=>{
   const u=new URL(String(input));if(options?.method!=='GET'||u.origin!=='https://graph.facebook.com'||!['/v26.0/debug_token','/v26.0/me'].includes(u.pathname)||graphGets>=2)throw Error('READ_ONLY_ROUTE_DENIED');
   graphGets++;return transport(input,{...options,redirect:'manual'});
  }});
  return {...base,...verified,releaseSha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,checkedAt:new Date(now).toISOString(),graphGets,quota:{usedMinutes:quota.usedMinutes,reservedMinutes:quota.reservedMinutes}};
 }catch{return {...base,state:'unavailable',reason:'READ_ONLY_VERIFICATION_UNAVAILABLE'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await verifyProductionMetaReadOnly(process.env);console.log('PRODUCTION_META_READONLY '+JSON.stringify(result));if(result.state!=='verified_read_only')process.exitCode=1;}
 catch{console.error('READ_ONLY_VERIFICATION_UNAVAILABLE');process.exitCode=1;}
}
