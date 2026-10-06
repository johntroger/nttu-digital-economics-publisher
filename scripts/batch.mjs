import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const python=process.env.SAMPLE_PYTHON??join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const result=spawnSync(python,['scripts/render-batch.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',shell:false});
if(result.error||result.status!==0)process.exit(result.status??1);
await import('./build-batch.mjs');
const gallery=spawnSync(python,['scripts/batch-gallery.py'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',shell:false});
if(gallery.error||gallery.status!==0)process.exit(gallery.status??1);
