import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {prepareClosedF7,MANAGEMENT_ASSETS} from '../scripts/production-f7-prepare.mjs';
import {actionsForecast} from '../scripts/production-f7-forecast.mjs';
import {summarizeBillingUsage,billingRead,billingSchema} from '../scripts/production-f7-billing-read.mjs';
import {runnerFixture} from './helpers/production-runner-http.mjs';
import {runSimulatedActionsRunner} from '../scripts/production-actions-runner.mjs';
test('F7 closed configuration preserves exact UI/font bytes and live resource identity without credentials or send gates',()=>{
 const dir=resolve('tmp/production-test-'+randomUUID());mkdirSync(dir);
 const r=prepareClosedF7('a'.repeat(40),{output:resolve(dir,'closed-config')});
 for(const [source,target] of MANAGEMENT_ASSETS)assert.deepEqual(readFileSync(source),readFileSync(resolve(r.directory,'assets',target)));
 for(const kind of ['runner','management']){
  const c=JSON.parse(readFileSync(resolve(r.directory,kind+'.json')));
  assert.equal(c.d1_databases[0].database_id,'09cdecc7-36a2-4196-950e-ef68b1ecd834');assert.equal(c.r2_buckets[0].bucket_name,'nttu-publisher-production-assets');
  assert.equal(c.vars.PRODUCTION_RUNNER_ENABLED,'false');assert.equal(c.vars.PRODUCTION_PUBLISHER_ENABLED,'false');assert.deepEqual(c.triggers.crons,[]);
  assert.equal(Object.hasOwn(c,'limits'),false,'Free config must use its default cap, not the paid CPU limits setting');
  assert.ok(!('META_APP_SECRET' in c.vars));assert.ok(!('META_PAGE_ACCESS_TOKEN' in c.vars));assert.ok(!('GOOGLE_CLIENT_SECRET' in c.vars));
 }
 const m=JSON.parse(readFileSync(resolve(r.directory,'management.json')));assert.equal(m.assets.directory,'./assets');assert.equal(m.vars.TELEGRAM_ENABLED,'true');assert.match(m.vars.GOOGLE_CLIENT_ID,/apps.googleusercontent.com$/);
 assert.equal(r.readiness.cloudCPUAccepted,false);assert.equal(r.readiness.rolloutApproved,false);
});
test('F7 output cannot redirect or overwrite existing production management configuration',()=>{
 assert.throws(()=>prepareClosedF7('a'.repeat(40),{output:'tmp/production-management'}),/F7_OUTPUT_INVALID/);
 const dir=resolve('tmp/production-test-'+randomUUID());mkdirSync(dir);
 const target=resolve('tmp/production-test-'+randomUUID());mkdirSync(target);
 const link=resolve(dir,'closed-config');symlinkSync(target,link,'junction');
 try{assert.throws(()=>prepareClosedF7('a'.repeat(40),{output:link}),/F7_OUTPUT_REDIRECTED/);}finally{rmSync(link);}
});
test('F7 forecasts reserve monitor, runner, CI and other account usage; never treats a forecast as approval',()=>{
 const common={includedMinutes:2000,usedMinutes:968.7,daysRemaining:22,monitorRunsPerDay:50,monitorMinutesPerRun:1};
 const current=actionsForecast(common);assert.equal(current.availableMinutes,1031);assert.equal(current.monitorMinutes,1100);assert.equal(current.runnerMinutes,110);assert.equal(current.reservedMinutes,1510);assert.equal(current.forecastFits,false);
 const hourly=actionsForecast({...common,monitorRunsPerDay:26});assert.equal(hourly.reservedMinutes,982);assert.equal(hourly.headroomMinutes,49);assert.equal(hourly.forecastFits,true);assert.equal(hourly.activationApproved,false);
 assert.equal(actionsForecast({...common,monitorRunsPerDay:26,monitorMinutesPerRun:1.01}).forecastFits,false);
 assert.throws(()=>actionsForecast({...common,usedMinutes:NaN}),/F7_FORECAST_INVALID/);
 assert.throws(()=>actionsForecast({...common,daysRemaining:32}),/F7_FORECAST_INVALID/);
});
test('F7 billing receipt includes other repositories and never claims to verify account budget',async()=>{
 const now=Date.parse('2026-10-10T12:00:00Z'),row={date:'2026-10-09',product:'Actions',sku:'Actions Linux',quantity:1.2,unitType:'minutes',netAmount:0,repositoryName:'other/private'};
 const result=summarizeBillingUsage({usageItems:[row,{...row,sku:'Actions Windows',quantity:5}]},now);
 assert.equal(result.conservativeUsedMinutes,12);assert.equal(result.dailyMinutes['2026-10-09'],12);assert.equal(result.quotaUsable,true);assert.equal(result.budgetVerifiedByAPI,false);assert.equal(result.activationApproved,false);assert.ok(!JSON.stringify(result).includes('other/private'));
 for(const usageItems of [[],[{...row,product:'unsupported'}]]){const incomplete=summarizeBillingUsage({usageItems},now);assert.equal(incomplete.quotaUsable,false);assert.equal(incomplete.conservativeUsedMinutes,null);}
 assert.equal(summarizeBillingUsage({usageItems:[{...row,product:'actions',sku:'actions_linux'},{...row,product:'actions',sku:'actions_windows',quantity:5}]},now).conservativeUsedMinutes,12);
 assert.equal(summarizeBillingUsage({usageItems:[{...row,product:'actions',unitType:'Minutes'}]},now).conservativeUsedMinutes,2);
 assert.throws(()=>summarizeBillingUsage({usageItems:[{...row,unitType:'hours'}]},now),/UNSUPPORTED/);
 const schema=billingSchema({usageItems:[row]});assert.deepEqual(schema.skus,['Actions Linux']);assert.deepEqual(schema.units,['minutes']);assert.deepEqual(schema.quantityTypes,['number']);assert.ok(!JSON.stringify(schema).includes('other/private'));
 assert.throws(()=>summarizeBillingUsage({usageItems:[{...row,sku:'unknown'}]},now),/UNSUPPORTED/);
 assert.throws(()=>summarizeBillingUsage({usageItems:[{...row,date:'2026-09-09'}]},now),/INVALID/);
 await assert.rejects(billingRead({},()=>assert.fail('untrusted context made transport'),now),/CONTEXT/);
 const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'johntroger/nttu-digital-economics-publisher',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/codex/step38-f7-closed-acceptance',PRODUCTION_BILLING_READ_TOKEN:'fixture'};
 const receipt=await billingRead(env,async(url,init)=>{assert.match(url,/\/users\/johntroger\/settings\/billing\/usage\?year=2026&month=10$/);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');return Response.json({usageItems:[row]});},now);assert.equal(receipt.conservativeUsedMinutes,2);
});

test('F7 reconciliation advances trusted server time across network delay without granting another POST',async()=>{
 const f=await runnerFixture();
 try{
  const initial=f.now();
  const result=await runSimulatedActionsRunner({...f.options,hook:async stage=>{
   if(stage==='after_authorize'){await new Promise(done=>setTimeout(done,1600));f.setTime(initial+1600);}
  }});
  assert.equal(result.state,'confirmed',JSON.stringify(result));assert.equal(f.postCount(),1);assert.equal(f.getCount(),1);
  assert.ok(['closed','day_complete'].includes((await runSimulatedActionsRunner(f.options)).state));assert.equal(f.postCount(),1);
 }finally{await f.dispose();}
});
