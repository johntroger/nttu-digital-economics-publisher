import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// These integration suites require original private source files; they remain mandatory locally.
export const PRIVATE_SUITES=new Set(['backups.test.mjs','editor.test.mjs','sources.test.mjs','samples.test.mjs','ui.test.mjs']);
const suites=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')&&!PRIVATE_SUITES.has(name)).sort();
if(!suites.length)throw new Error('No portable test suites');
console.log(`Portable CI: ${suites.length} suites. Private PDF/logo/editor/backup integration tests are checked locally before push.`);
const result=spawnSync(process.execPath,['--test',...suites.map(name=>'tests/'+name)],{stdio:'inherit',shell:false});
process.exit(result.status??1);
