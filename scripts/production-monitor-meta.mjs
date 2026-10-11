// Fresh Node-only Meta proof. No publisher, queue, credential write or send API.
import {inspectMetaConnection,metaCredentialsPresent,metaFingerprint} from '../src/cloud/meta.ts';
import {githubJSON,readRunnerQuota,REPOSITORY} from './production-runner-quota.mjs';
export const MONITOR_WORKFLOW='.github/workflows/monitor.yml';
export function trustedMonitorMetaContext(env){return env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===REPOSITORY&&['workflow_dispatch','schedule'].includes(env.GITHUB_EVENT_NAME)&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_WORKFLOW_REF===REPOSITORY+'/'+MONITOR_WORKFLOW+'@refs/heads/main'&&env.PRODUCTION_ACTIONS_ENABLED==='false'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')&&env.GITHUB_SHA===env.PRODUCTION_RUNNER_RELEASE&&/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID??'');}
export async function verifyProductionMonitorMeta(env,status,{transport=fetch,now=Date.now()}={}){
 const base={readOnly:true,facebookPosts:0,workerWrites:0,configurationMatched:false};
 if(!trustedMonitorMetaContext(env)||!Number.isSafeInteger(now)||now<0)return {...base,state:'closed',reason:'MONITOR_CONTEXT_INVALID'};
 const gates=status?.publisher?.gates;
 if(status?.release!==env.GITHUB_SHA||status?.environment!=='production'||status?.databaseChecked!==true||status?.schemaReady!==true||status?.paused!==true||status?.publishingEnabled!==false||status?.publisher?.state!=='closed'||!gates||['deployment','database','ownerPublicationApproval'].some(k=>gates[k]!==false)||status?.metaVerificationSource!=='node_required'||status?.metaConfigured!==true||!/^[a-f0-9]{64}$/.test(status?.metaConfigurationHash??''))return {...base,state:'closed',reason:'MONITOR_WORKER_CONFIGURATION_INVALID'};
 const config={META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:env.META_APP_SECRET,META_PAGE_ACCESS_TOKEN:env.META_PAGE_ACCESS_TOKEN};
 if(!metaCredentialsPresent(config))return {...base,state:'needs_action',reason:'META_NOT_CONFIGURED'};
 if(await metaFingerprint(config)!==status.metaConfigurationHash)return {...base,state:'needs_action',reason:'META_CONFIGURATION_MISMATCH'};
 let policy;try{policy=JSON.parse(env.PRODUCTION_BILLING_POLICY??'');}catch{return {...base,state:'quota_blocked',reason:'budget_unverified'};}
 if(policy?.policyVersion!==2||policy.releaseSha!==env.GITHUB_SHA)return {...base,state:'quota_blocked',reason:'budget_release_changed'};
 try{
  const run=await githubJSON('/repos/'+REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID,env.GITHUB_TOKEN,transport);
  if(run.head_sha!==env.GITHUB_SHA||run.head_branch!=='main'||run.event!==env.GITHUB_EVENT_NAME||run.path!==MONITOR_WORKFLOW||run.status!=='in_progress'||String(run.id)!==env.GITHUB_RUN_ID)return {...base,state:'closed',reason:'MONITOR_WORKFLOW_IDENTITY_INVALID'};
  const quota=await readRunnerQuota({token:env.PRODUCTION_BILLING_READ_TOKEN,policy,transport,now});if(!quota.allowed)return {...base,state:'quota_blocked',reason:quota.reason};
  let graphGets=0;
  const proof=await inspectMetaConnection(config,{now,transport:async(input,options)=>{
   const u=new URL(String(input));if(options?.method!=='GET'||u.origin!=='https://graph.facebook.com'||!['/v26.0/debug_token','/v26.0/me'].includes(u.pathname)||graphGets>=2)throw Error('MONITOR_META_GET_ONLY');
   graphGets++;return transport(input,{...options,redirect:'manual'});
  }});
  return {...base,...proof,configurationMatched:true,releaseSha:env.GITHUB_SHA,checkedAt:now,runId:env.GITHUB_RUN_ID,graphGets};
 }catch{return {...base,state:'unavailable',reason:'MONITOR_META_UNAVAILABLE'};}
}
