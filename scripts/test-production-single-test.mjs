import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['--test','--test-concurrency=1','tests/production-single-test.test.mjs','tests/production-send-preflight.test.mjs','tests/production-runner.test.mjs'],{stdio:'inherit'});if(r.error)throw r.error;process.exitCode=r.status??1;
