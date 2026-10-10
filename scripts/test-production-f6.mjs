import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--test','tests/production-f6.test.mjs'],{stdio:'inherit'});
if(r.error)throw r.error;process.exitCode=r.status??1;
