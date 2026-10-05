import {spawnSync} from 'node:child_process';
import {checkRepository} from './check-repository.mjs';
const status=spawnSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'});if(status.status!==0||status.stdout.trim()){console.error('Commit tracked changes before pushing so checks match the code being sent.');process.exit(1);}
checkRepository();
for(const command of ['check','test:images']){const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command],{stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)process.exit(result.status??1);}
