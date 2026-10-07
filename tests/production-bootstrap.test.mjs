import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {productionConfig,prepareProduction,STAGING_DATABASE_ID} from '../scripts/production-prepare.mjs';
import bootstrap from '../src/production/bootstrap.ts';
const settings={databaseId:'11111111-1111-1111-1111-111111111111',releaseSha:'a'.repeat(40),
  origin:'https://nttu-publisher-production.nttu-kts-johntroger.workers.dev/'};
const env={APP_ENV:'production',INTEGRATION_MODE:'bootstrap',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:settings.releaseSha};
test('production bootstrap cannot reuse staging identity or invalid database',()=>{
  for(const databaseId of [STAGING_DATABASE_ID,STAGING_DATABASE_ID.toUpperCase(),'00000000-0000-0000-0000-000000000000','invalid',null])
    assert.throws(()=>productionConfig({...settings,databaseId}));
  for(const origin of ['https://nttu-publisher-staging.nttu-kts-johntroger.workers.dev/',settings.origin+'?token=x',settings.origin+'api','http://nttu-publisher-production.nttu-kts-johntroger.workers.dev/'])
    assert.throws(()=>productionConfig({...settings,origin}));
});
test('production files have no secret, cron, staging assets or activation permission',()=>{
  mkdirSync('tmp',{recursive:true});
  const output=mkdtempSync(resolve('tmp','production-test-'));
  try {
    const result=prepareProduction(settings,{output});
    const config=JSON.parse(readFileSync(resolve(output,'wrangler.json'),'utf8'));
    assert.deepEqual(config.triggers.crons,[]);assert.equal(config.vars.DAILY_PUBLISHING_ENABLED,'false');
    assert.equal(config.name,'nttu-publisher-production');assert.equal(config.keep_vars,false);
    assert.equal(config.r2_buckets[0].bucket_name,'nttu-publisher-production-assets');
    assert.equal(config.d1_databases[0].database_id,settings.databaseId);
    assert.equal(result.plan.productionActivationApproved,false);assert.equal(result.plan.targetPageId,null);
    assert.equal(result.plan.contentImported,false);assert.equal(config.assets,undefined);
    assert.match(config.main,/src\/production\/bootstrap.ts$/);
    assert.throws(()=>prepareProduction(settings,{output:resolve('.')}));
  } finally {rmSync(output,{recursive:true,force:true});}
});
test('accidental enable, staging binding or invalid release blocks even health',async()=>{
  for(const bad of [{DAILY_PUBLISHING_ENABLED:'true'},{APP_ENV:'staging'},{INTEGRATION_MODE:'unconfigured'},{RELEASE_SHA:'local'}]) {
    const r=await bootstrap.fetch(new Request(settings.origin+'health'),{...env,...bad});
    assert.equal(r.status,503);
  }
});
test('bootstrap never calls DB, storage, Meta or Telegram on publish/login/status paths',async()=>{
  const bindings={...env,DB:new Proxy({}, {get(){throw Error('DB called');}}),MEDIA:new Proxy({}, {get(){throw Error('R2 called');}})};
  for(const path of ['','api/daily/activate','api/daily/publish','api/staging/status','auth/google','api/assets','health']) {
    for(const method of ['GET','POST']) {
      const r=await bootstrap.fetch(new Request(settings.origin+path,{method}),bindings);
      assert.equal(r.status,path==='health'&&method==='GET'?200:503);
      assert.equal(r.headers.get('Cache-Control'),'no-store');
      if(r.status===200) {const body=await r.json();assert.equal(body.publishingEnabled,false);assert.equal(body.databaseChecked,false);}
    }
  }
  assert.equal(bootstrap.scheduled,undefined);
});
