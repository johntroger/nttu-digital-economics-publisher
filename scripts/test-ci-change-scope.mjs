import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','tests/ci-change-scope.test.mjs'],{stdio:'inherit',shell:false});
process.exitCode=result.status??1;
