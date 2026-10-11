// Targeted regression; all provider transports in monitor tests are mocked.
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','tests/monitor.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
