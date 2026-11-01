import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// Explicitly reviewed, non-runtime documentation. Unknown paths always run CI.
export const DOCUMENTATION_ONLY_PATHS=new Set([
 'README.md',
 'docs/operations.md',
 'docs/production-operations-guide.vi.md',
 'docs/free-quota-plan.vi.md',
 'docs/production-daily-activation-notes.md',
]);
const sha=/^[0-9a-f]{40}$/i;
export function classifyChanges(eventName,event,diff){
 if(!['push','pull_request'].includes(eventName))return {runFull:true,reason:'manual_or_unknown_event'};
 const base=eventName==='push'?event.before:event.pull_request?.base?.sha;
 const head=eventName==='push'?event.after:event.pull_request?.head?.sha;
 if(!sha.test(base??'')||!sha.test(head??'')||/^0+$/.test(base)||/^0+$/.test(head))return {runFull:true,reason:'missing_commit_range'};
 try{
  const output=diff(base,head,eventName==='pull_request');
  if(typeof output!=='string'||!output.endsWith('\0'))return {runFull:true,reason:'empty_or_invalid_diff'};
  const paths=output.slice(0,-1).split('\0');
  if(!paths.length||paths.some(path=>!DOCUMENTATION_ONLY_PATHS.has(path)))return {runFull:true,reason:'runtime_or_unreviewed_path'};
  return {runFull:false,reason:'reviewed_documentation_only'};
 }catch{return {runFull:true,reason:'diff_unavailable'};}
}
export function gitChangedPaths(base,head,threeDot){
 return execFileSync('git',['diff','--name-only','--no-renames','-z',threeDot?`${base}...${head}`:`${base}..${head}`,'--'],{encoding:'utf8',maxBuffer:16*1024*1024});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;
 try{result=classifyChanges(process.env.GITHUB_EVENT_NAME,JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),gitChangedPaths);}
 catch{result={runFull:true,reason:'event_unavailable'};}
 if(!process.env.GITHUB_OUTPUT)throw new Error('GITHUB_OUTPUT is required');
 appendFileSync(process.env.GITHUB_OUTPUT,`run_full=${result.runFull}\n`);
 console.log(JSON.stringify(result));
}
