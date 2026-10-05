import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const python=process.env.SAMPLE_PYTHON??join(process.env.USERPROFILE??'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const mode=process.argv[2]??'build';
if(!['build','test'].includes(mode))throw new Error('Use build or test');
const cwd=fileURLToPath(new URL('../',import.meta.url));
const script=mode==='test'?'tests/render_samples_test.py':'scripts/render-samples.py';
const result=spawnSync(python,[script],{cwd,stdio:'inherit',shell:false});
if(result.error){process.stderr.write('Python/Pillow runtime unavailable. Set SAMPLE_PYTHON to an existing compatible Python.\n');process.exit(1);}
if(result.status!==0)process.exit(result.status??1);
if(mode==='build')await import('./build-samples.mjs');
