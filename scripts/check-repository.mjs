import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function pathViolation(path){
 const p=path.toLowerCase();
 return /(^|\/)(node_modules|tmp|__pycache__|\.codex|\.agents|\.aws|\.gcm)(\/|$)/.test(p)||/^assets\/(sources|brand\/originals|samples|batch)\//.test(p)||(/(^|\/)\.env(?:\.|$)/.test(p)&&p!=='.env.example')||/(^|\/)\.dev\.vars(?:\.|$)/.test(p)||/\.(pdf|sqlite(?:-wal|-shm)?|db|pyc|pem|key|log)$/.test(p);
}
export function secretViolation(text){return /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|AIza[0-9A-Za-z_-]{35}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b)/.test(text);}
export function checkRepository(){
 const listing=spawnSync('git',['ls-files','--cached','-z'],{encoding:'utf8'});if(listing.status!==0)throw new Error('Git repository unavailable');
 const paths=listing.stdout.split('\0').filter(Boolean);if(!paths.length)throw new Error('Repository index is empty');
 const violations=[];for(const path of paths){if(pathViolation(path)){violations.push({path,reason:'private file or local artifact'});continue;}
 const content=spawnSync('git',['show',':'+path],{maxBuffer:10485760});if(content.status!==0)throw new Error('Cannot read index: '+path);if(content.stdout.length>5242880)violations.push({path,reason:'oversized repository asset'});if(!/\.(ttf|woff2?|png|jpe?g)$/i.test(path)&&secretViolation(content.stdout.toString('utf8')))violations.push({path,reason:'credential pattern; value suppressed'});
 }
 if(violations.length){for(const item of violations)console.error(item.path+': '+item.reason);throw new Error('Repository content check failed');}
 console.log(`Repository content check passed: ${paths.length} files; private sources, originals, rendered images and local backups excluded.`);return paths.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)checkRepository();
