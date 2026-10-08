import {spawnSync} from 'node:child_process';
import {checkRepository} from './check-repository.mjs';
const status=spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'});if(status.status!==0||status.stdout.trim()){console.error('Commit tracked changes before pushing so checks match the code being sent.');process.exit(1);}
checkRepository();
for(const [label,args] of [['TypeScript',['node_modules/typescript/bin/tsc','--noEmit']],['Full local tests',['scripts/run-clean.mjs','test']],['Image checks',['scripts/run-clean.mjs','images']]]){console.log('Pre-push: '+label);const result=spawnSync(process.execPath,args,{stdio:'inherit',shell:false});if(result.status!==0)process.exit(result.status??1);}
