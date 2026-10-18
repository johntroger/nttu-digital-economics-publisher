import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
const suites=['production-operations','production-f11','production-f12','monitor'].map(name=>'tests/'+name+'.test.mjs').filter(existsSync);
const result=spawnSync(process.execPath,['--test',...suites],{stdio:'inherit',shell:false});
process.exitCode=result.status??1;
