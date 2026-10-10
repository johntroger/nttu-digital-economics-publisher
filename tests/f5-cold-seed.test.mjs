import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runnerFixture} from './helpers/production-runner-http.mjs';
import {f5ColdSeedSQL} from '../scripts/f5-cold-seed.mjs';
test('F5 direct clone seed makes the first API request a due held claim without warming reset or sending',async()=>{
 const f=await runnerFixture();try{
  const before=f.db.prepare('SELECT count(*) count FROM posts').get().count;
  f.db.exec(await f5ColdSeedSQL());
  const response=await f.request('/runner/claim',{runner:randomUUID()}),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.state,'held');assert.match(body.job,/^runner-job:[a-f0-9-]{36}$/);
  assert.equal(f.db.prepare('SELECT count(*) count FROM posts').get().count,before);
  assert.equal(f.db.prepare('SELECT count(*) count FROM production_publisher_attempts').get().count,0);
  assert.equal(f.postCount(),0);
 }finally{await f.dispose();}
});
