import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

test('daily Node runner loads with only runtime dependencies and no network access',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8')),lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 assert.deepEqual(pkg.dependencies,lock.packages[''].dependencies);
 assert.deepEqual(Object.keys(pkg.dependencies),['jose']);
 assert.equal(lock.packages['node_modules/jose'].dev,undefined);
 const entry=new URL('../scripts/production-runner-live.mjs',import.meta.url).href;
 const code=`
  import {registerHooks} from 'node:module';
  registerHooks({resolve(spec,ctx,next){
   if(!spec.startsWith('.')&&!spec.startsWith('file:')&&!spec.startsWith('node:')&&spec!=='jose')throw Error('Unexpected development dependency');
   return next(spec,ctx);
  }});
  globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
  const {runProductionActions}=await import(${JSON.stringify(entry)});
  const result=await runProductionActions({});
  if(result.state!=='closed'||result.realPublication!=='NOT_RUN')throw Error('Unsafe runner startup');
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
 assert.match(readFileSync('.github/workflows/production-runner.yml','utf8'),/npm ci --omit=dev --ignore-scripts/);
});
