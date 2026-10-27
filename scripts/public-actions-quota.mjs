// Standard GitHub-hosted jobs in public repositories have no billable minute cap.
// Verify current GitHub metadata; never infer visibility from an environment flag.
const workflows=Object.freeze({run:'.github/workflows/production-runner.yml',monitor:'.github/workflows/monitor.yml',verify:'.github/workflows/production-meta-readonly.yml'});
export async function publicActionsDecision(context,policy,{repository,read}){
 const denied=reason=>({allowed:false,reason});
 const e=context??{},workflow=workflows[e.GITHUB_JOB];
 if(e.GITHUB_ACTIONS!=='true'||e.GITHUB_REPOSITORY!==repository||e.GITHUB_REF!=='refs/heads/main'||e.RUNNER_ENVIRONMENT!=='github-hosted'||!workflow||e.GITHUB_WORKFLOW_REF!==repository+'/'+workflow+'@refs/heads/main'||!['workflow_dispatch','schedule'].includes(e.GITHUB_EVENT_NAME)||! /^[1-9][0-9]{0,19}$/.test(e.GITHUB_RUN_ID??'')||e.GITHUB_SHA!==policy.releaseSha||e.PRODUCTION_RUNNER_RELEASE!==policy.releaseSha||!e.GITHUB_TOKEN)return denied('public_runner_context_invalid');
 if(e.GITHUB_EVENT_NAME==='schedule'&&e.GITHUB_JOB!=='monitor')return denied('public_runner_context_invalid');
 try{
  const repo=await read('/repos/'+repository,e.GITHUB_TOKEN);
  if(repo.full_name!==repository)return denied('public_repository_unverified');
  if(repo.private===true&&repo.visibility==='private')return {publicRepository:false};
  if(repo.private!==false||repo.visibility!=='public')return denied('public_repository_unverified');
  const run=await read('/repos/'+repository+'/actions/runs/'+e.GITHUB_RUN_ID,e.GITHUB_TOKEN);
  if(String(run.id)!==e.GITHUB_RUN_ID||run.head_sha!==e.GITHUB_SHA||run.head_branch!=='main'||run.path!==workflow||run.event!==e.GITHUB_EVENT_NAME||run.status!=='in_progress'||String(run.run_attempt)!==e.GITHUB_RUN_ATTEMPT)return denied('public_workflow_unverified');
  const jobs=await read('/repos/'+repository+'/actions/runs/'+e.GITHUB_RUN_ID+'/jobs?filter=latest&per_page=100',e.GITHUB_TOKEN);
  if(!Array.isArray(jobs.jobs)||jobs.total_count!==jobs.jobs.length)return denied('public_runner_unverified');
  const active=jobs.jobs.filter(j=>j.name===e.GITHUB_JOB&&j.status==='in_progress');
  if(active.length!==1)return denied('public_runner_unverified');
  const job=active[0];
  // These three production workflows all select exactly ubuntu-latest. Any
  // larger/custom/self-hosted label or runner group needs separate review.
  if(job.runner_group_name!=='GitHub Actions'||!Array.isArray(job.labels)||job.labels.length!==1||job.labels[0]!=='ubuntu-latest')return denied('public_runner_not_standard');
  return {allowed:true,reason:'public_standard_runner',billingMode:'public-standard',minuteLimit:null,usedMinutes:null,reservedMinutes:0,remainingMinutes:null};
 }catch{return denied('public_runner_unavailable');}
}
