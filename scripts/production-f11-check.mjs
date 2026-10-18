import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--test','tests/production-f11.test.mjs','tests/monitor.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
