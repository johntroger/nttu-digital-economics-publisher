import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','tests/public-actions-quota.test.mjs','tests/production-budget.test.mjs'],{stdio:'inherit',shell:false});
process.exitCode=result.status??1;
