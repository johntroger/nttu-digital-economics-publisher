import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function pathViolation(path){
 const p=path.toLowerCase();
 return /(^|\/)(node_modules|tmp|__pycache__|\.codex|\.agents|\.aws|\.gcm)(\/|$)/.test(p)||/^assets\/(sources|brand\/originals|samples|batch)\//.test(p)||(/(^|\/)\.env(?:\.|$)/.test(p)&&p!=='.env.example')||/(^|\/)\.dev\.vars(?:\.|$)/.test(p)||/\.(pdf|sqlite(?:-wal|-shm)?|db|pyc|pem|key|log)$/.test(p);
}
export function secretViolation(text){return /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|AIza[0-9A-Za-z_-]{35}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b)/.test(text);}
export function checkRepository(){
 const listing=spawnSync('git',['ls-files','--stage','-z'],{encoding:'utf8',maxBuffer:10485760});if(listing.status!==0)throw new Error('Git repository unavailable');
 const entries=listing.stdout.split('\0').filter(Boolean).map(entry=>{
  const match=/^\d+ ([a-f0-9]{40,64}) 0\t([\s\S]+)$/.exec(entry);
  if(!match)throw new Error('Repository index has unresolved or invalid entries');
  return {oid:match[1],path:match[2]};
 });if(!entries.length)throw new Error('Repository index is empty');
 const violations=[],candidates=entries.filter(({path})=>{if(!pathViolation(path))return true;violations.push({path,reason:'private file or local artifact'});return false;});
 const scan=[];
 if(candidates.length){
  const metadata=spawnSync('git',['cat-file','--batch-check'],{input:candidates.map(e=>e.oid).join('\n')+'\n',encoding:'utf8',maxBuffer:10485760});
  if(metadata.status!==0)throw new Error('Cannot inspect repository index objects');
  const lines=metadata.stdout.trimEnd().split('\n');if(lines.length!==candidates.length)throw new Error('Incomplete repository index metadata');
  for(const [i,entry]of candidates.entries()){
   const match=/^([a-f0-9]{40,64}) blob ([0-9]+)$/.exec(lines[i]);
   if(!match||match[1]!==entry.oid)throw new Error('Invalid repository index object');
   const size=Number(match[2]);if(!Number.isSafeInteger(size))throw new Error('Invalid repository index size');
   if(size>5242880)violations.push({path:entry.path,reason:'oversized repository asset'});else scan.push({...entry,size});
  }
 }
 // Read index object IDs in bounded batches rather than launching Git per file.
 // Never scan working-tree replacements: the staged snapshot is what gets pushed.
 for(let start=0;start<scan.length;){
  const batch=[];let bytes=0;
  while(start<scan.length&&(batch.length===0||bytes+scan[start].size<=8388608)){const item=scan[start++];batch.push(item);bytes+=item.size;}
  const objects=spawnSync('git',['cat-file','--batch'],{input:batch.map(e=>e.oid).join('\n')+'\n',maxBuffer:bytes+batch.length*128});
  if(objects.status!==0)throw new Error('Cannot read repository index objects');
  let offset=0;
  for(const {oid,path,size:expectedSize} of batch){
   const end=objects.stdout.indexOf(10,offset),header=objects.stdout.subarray(offset,end).toString('ascii'),match=/^([a-f0-9]{40,64}) blob ([0-9]+)$/.exec(header);
   if(end<0||!match||match[1]!==oid)throw new Error('Invalid repository index object');
   const size=Number(match[2]),begin=end+1;offset=begin+size+1;
   if(size!==expectedSize||offset>objects.stdout.length||objects.stdout[offset-1]!==10)throw new Error('Incomplete repository index object');
   if(!/\.(ttf|woff2?|png|jpe?g)$/i.test(path)&&secretViolation(objects.stdout.subarray(begin,begin+size).toString('utf8')))violations.push({path,reason:'credential pattern; value suppressed'});
  }
  if(offset!==objects.stdout.length)throw new Error('Unexpected repository index output');
 }
 if(violations.length){for(const item of violations)console.error(item.path+': '+item.reason);throw new Error('Repository content check failed');}
 console.log(`Repository content check passed: ${entries.length} files; private sources, originals, rendered images and local backups excluded.`);return entries.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkRepository();
