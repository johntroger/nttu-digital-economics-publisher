import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {runWithCleanup} from '../scripts/run-clean.mjs';

function workspace(){mkdirSync('tmp',{recursive:true});return mkdtempSync(resolve('tmp','cleanup-test-'));}
for(const exit of [0,7]){
 test(`cleanup runs after child exit ${exit} and keeps live data, backups and older fixtures`,()=>{
  const root=workspace();try{
   for(const path of ['tmp/step-08/assets','tmp/step-10/backups/real','tmp/step30','tmp/tests/older'])mkdirSync(join(root,path),{recursive:true});
   writeFileSync(join(root,'tmp/step-08/warehouse.sqlite'),'keep');
   const code=`const fs=require('node:fs');for(const p of ['tmp/tests/new','tmp/step-10/tests/new','tmp/step-08/tests/new','tmp/production-smoke-123abc']){fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/fixture','temporary')}process.exit(${exit});`;
   assert.equal(runWithCleanup(process.execPath,['-e',code],{root,stdio:'ignore'}),exit);
   for(const path of ['tmp/tests/new','tmp/step-10/tests/new','tmp/step-08/tests/new','tmp/production-smoke-123abc','tmp/.transient-run.lock'])assert.equal(existsSync(join(root,path)),false,path);
   for(const path of ['tmp/step-08/warehouse.sqlite','tmp/step-08/assets','tmp/step-10/backups/real','tmp/step30','tmp/tests/older'])assert.equal(existsSync(join(root,path)),true,path);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
}
test('cleanup refuses concurrent managed runs',()=>{
 const root=workspace();try{
  mkdirSync(join(root,'tmp'));writeFileSync(join(root,'tmp/.transient-run.lock'),JSON.stringify({pid:process.pid}));
  assert.throws(()=>runWithCleanup(process.execPath,['-e','process.exit(0)'],{root,stdio:'ignore'}),/Another cleanup-managed task/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('cleanup refuses a fixture root redirected outside its workspace',t=>{
 const root=workspace(),outside=workspace();try{
  mkdirSync(join(root,'tmp'));writeFileSync(join(outside,'keep'),'keep');
  try{symlinkSync(outside,join(root,'tmp/tests'),process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('Symlink creation unavailable');return;}throw error;}
  assert.throws(()=>runWithCleanup(process.execPath,['-e','process.exit(0)'],{root,stdio:'ignore'}),/symbolic links/);
  assert.equal(existsSync(join(outside,'keep')),true);
 }finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
