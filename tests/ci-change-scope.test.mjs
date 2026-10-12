import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyChanges,DOCUMENTATION_ONLY_PATHS} from '../scripts/ci-change-scope.mjs';
const base='a'.repeat(40),head='b'.repeat(40);
const push={before:base,after:head},pr={pull_request:{base:{sha:base},head:{sha:head}}};
const classify=paths=>classifyChanges('push',push,()=>paths.map(p=>p+'\0').join(''));
test('only reviewed documentation skips expensive checks',()=>{
 assert.equal(classify([...DOCUMENTATION_ONLY_PATHS]).runFull,false);
});
test('runtime, legal documents, unknown paths and mixed changes require checks',()=>{
 for(const path of ['src/cloud/worker.ts','.github/workflows/ci.yml','scripts/monitor.mjs','tests/monitor.test.mjs','package.json','package-lock.json','.nvmrc','wrangler.toml','migrations/0016.sql','assets/image.png','docs/privacy-policy.vi.md','docs/data-deletion.vi.md','docs/terms-of-service.vi.md','docs/new-guide.md','README.MD','../README.md','docs/operations.md\nsource.ts']){
  assert.equal(classify(['README.md',path]).runFull,true,path);
 }
});
test('deletions and renames cannot hide runtime paths',()=>{
 // --no-renames reports both old and new names, including deleted source.
 assert.equal(classify(['src/removed.ts','docs/operations.md']).runFull,true);
 assert.equal(classify(['docs/operations.md','src/renamed.ts']).runFull,true);
});
test('manual, missing ranges, empty and failing diffs default to full checks',()=>{
 assert.equal(classifyChanges('workflow_dispatch',{},()=>{throw Error('must not read diff');}).runFull,true);
 assert.equal(classifyChanges('push',{before:'0'.repeat(40),after:head},()=> 'README.md\0').runFull,true);
 assert.equal(classifyChanges('pull_request',{},()=> 'README.md\0').runFull,true);
 assert.equal(classify([]).runFull,true);
 assert.equal(classifyChanges('push',push,()=> 'README.md').runFull,true);
 assert.equal(classifyChanges('push',push,()=>{throw Error('missing objects');}).runFull,true);
});
test('PR uses full three-dot range, push uses complete two-dot range',()=>{
 for(const [name,event,expected] of [['push',push,false],['pull_request',pr,true]]){
  const result=classifyChanges(name,event,(b,h,threeDot)=>{assert.equal(b,base);assert.equal(h,head);assert.equal(threeDot,expected);return 'README.md\0';});
  assert.equal(result.runFull,false);
 }
});
test('workflow preserves check names and prevents docs-only staging deployment',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8');
 assert.match(workflow,/name: Portable checks \(\$\{\{ matrix\.os \}\}\)/);
 assert.match(workflow,/needs: change-scope\s+if: .*outputs\.run_full == 'true'/);
 assert.match(workflow,/needs: \[change-scope, portable-checks\]/);
 assert.match(workflow,/if: .*needs\.change-scope\.outputs\.run_full == 'true'.*STAGING_DEPLOY_ENABLED/);
 assert.match(workflow,/fetch-depth: 0/);
 assert.match(workflow,/run: node scripts\/check-repository\.mjs/);
 assert.doesNotMatch(workflow,/paths-ignore:/);
});
