import {existsSync,lstatSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {resolve,relative,isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
// These are fixture/cache roots only. Live local data and real backups are excluded.
export const TRANSIENT_ROOTS=Object.freeze([
 'tmp/step-10/tests','tmp/tests','tmp/step-10/http',
 'tmp/step-08/tests','tmp/step-09/tests',
 'tmp/cloud-management','tmp/cloud-smoke',
 'tmp/step-03-races','tmp/step-04-races',
 'tmp/npm-cache','tmp/node-compile-cache',
]);
const transientName=/^(?:production-smoke|production-test|production-management-test|miniflare)-[0-9a-f-]+$/;

function safePath(root,path){
 const base=realpathSync(root),target=resolve(root,path),rel=relative(base,target);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('Cleanup path must stay inside the project');
 let current=target;
 while(current!==base){
  if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('Cleanup refuses symbolic links');
  const parent=dirname(current);if(parent===current)throw new Error('Cleanup path cannot be resolved safely');current=parent;
 }
 return target;
}
function entries(root,path){
 const target=safePath(root,path);
 return existsSync(target)?new Set(readdirSync(target)):new Set();
}
function lock(root){
 const target=safePath(root,'tmp/.transient-run.lock');mkdirSync(dirname(target),{recursive:true});
 if(existsSync(target)){
  const saved=JSON.parse(readFileSync(target,'utf8'));let active=true;
  if(!Number.isSafeInteger(saved.pid)||saved.pid<=0)throw new Error('Invalid transient run lock');
  try{process.kill(saved.pid,0);}catch(error){if(error.code==='ESRCH')active=false;else throw error;}
  if(active)throw new Error('Another cleanup-managed task is running; wait for it to finish');
  rmSync(target);
 }
 const fd=openSync(target,'wx');try{writeFileSync(fd,JSON.stringify({pid:process.pid}));}finally{closeSync(fd);}
 return ()=>rmSync(target,{force:true});
}

export function runWithCleanup(command,args,{root=ROOT,stdio='inherit',env=process.env}={}){
 root=realpathSync(root);
 const unlock=lock(root);
 let before,topBefore,runDirectory,result,cleanupError;
 try{
  before=new Map(TRANSIENT_ROOTS.map(path=>[path,entries(root,path)]));
  topBefore=entries(root,'tmp');
  runDirectory=safePath(root,'tmp/transient-run-'+randomUUID());mkdirSync(runDirectory);
  result=spawnSync(command,args,{cwd:root,stdio,shell:false,env:{...env,NODE_COMPILE_CACHE:join(runDirectory,'node-cache')}});
 }finally{
  try{
   if(before){
    for(const [path,saved] of before){
     for(const entry of entries(root,path)){
      if(saved.has(entry))continue;
      const target=safePath(root,join(path,entry));
      rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:200});
     }
    }
    for(const entry of entries(root,'tmp')){
     if(!topBefore.has(entry)&&transientName.test(entry))rmSync(safePath(root,join('tmp',entry)),{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
   }
  }catch(error){cleanupError=error;}
  try{if(runDirectory)rmSync(safePath(root,runDirectory),{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch(error){cleanupError??=error;}
  unlock();
 }
 if(cleanupError)throw new Error('Temporary cleanup failed; retained files require inspection',{cause:cleanupError});
 if(result.error)throw result.error;
 console.log('Temporary test data and run cache cleaned; existing data and deliverables kept.');
 return result.status??1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const mode=process.argv[2],extra=process.argv.slice(3);
 const commands={
  test:['--test',...readdirSync(join(ROOT,'tests')).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n)],
  portable:['scripts/test-portable.mjs'],
  cloud:['scripts/cloud-smoke.mjs'],
  workflow:['scripts/cloud-workflow-smoke.mjs'],
  images:['scripts/samples.mjs','test'],
 };
 let args=commands[mode];
 if(mode==='script'){
  const script=extra[0],target=script&&resolve(ROOT,script),rel=target&&relative(join(ROOT,'scripts'),target);
  if(!target||!rel||rel.startsWith('..')||isAbsolute(rel)||!target.endsWith('.mjs')||target===fileURLToPath(import.meta.url))throw new Error('Use an existing project script under scripts/');
  args=[target,...extra.slice(1)];
 }
 if(!args)throw new Error('Use test, portable, cloud, workflow, images or script');
 process.exitCode=runWithCleanup(process.execPath,args);
}
