import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--test','tests/production-stages.test.mjs'],{stdio:'inherit',shell:false});
if(r.error)throw r.error;process.exitCode=r.status??1;
