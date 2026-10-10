// Local review artifact only; never deploys, copies secrets, or changes live state.
import {mkdirSync,readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {closedF6Configuration} from './production-f6-config.mjs';
export const MANAGEMENT_ASSETS=Object.freeze([
 ['ui/production/manager.html','manager.html'],
 ['ui/production/management.js','management.js'],
 ['ui/production/management.css','management.css'],
 ['assets/fonts/WorkSans-Regular.ttf','fonts/WorkSans-Regular.ttf'],
 ['assets/fonts/WorkSans-Bold.ttf','fonts/WorkSans-Bold.ttf'],
 ['assets/fonts/WorkSans-OFL.txt','fonts/WorkSans-OFL.txt'],
]);
export function prepareClosedF7(releaseSha,{output='tmp/step38/f7/closed-config'}={}){
 const root=realpathSync(resolve('tmp')),directory=resolve(output),rel=relative(root,directory);
 if(!/^step38[\\/]f7[\\/]closed-config$/.test(rel)&&!/^production-test-[a-f0-9-]+[\\/]closed-config$/.test(rel))throw Error('F7_OUTPUT_INVALID');
 // Refuse redirected parents before creating any review output.
 let parent=directory;while(!existsSync(parent))parent=resolve(parent,'..');
 if(realpathSync(parent)!==parent)throw Error('F7_OUTPUT_REDIRECTED');
 const proposal=closedF6Configuration(releaseSha),manifest=[];
 mkdirSync(resolve(directory,'assets/fonts'),{recursive:true});
 for(const [source,target] of MANAGEMENT_ASSETS){const bytes=readFileSync(source);writeFileSync(resolve(directory,'assets',target),bytes);manifest.push({path:target,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 for(const [kind,config] of [['runner',proposal.runner],['management',proposal.management]]){
  config.main=relative(directory,resolve(config.main)).split(sep).join('/');
  if(kind==='management')config.assets.directory='./assets';
  writeFileSync(resolve(directory,kind+'.json'),JSON.stringify(config,null,2)+'\n');
 }
 const readiness={releaseSha,assets:manifest,actionsEnabled:false,runnerEnabled:false,legacyEnabled:false,rolloutApproved:false,postingApproved:false,credentialsCopied:false,cloudCPUAccepted:false,budgetPolicyAccepted:false};
 writeFileSync(resolve(directory,'readiness.json'),JSON.stringify(readiness,null,2)+'\n');
 return {directory,proposal,readiness};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=prepareClosedF7(process.argv[2]);console.log(JSON.stringify({directory:result.directory,...result.readiness}));
}
