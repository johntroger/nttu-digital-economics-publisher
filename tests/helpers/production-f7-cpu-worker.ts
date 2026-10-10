// Private disposable F7 harness. Calls the production entrypoint unchanged,
// including its real server clock. Wrapper overhead belongs to the CPU sample.
import runnerWorker from '../../src/production/runner-worker.ts';
import type {RunnerBindings} from '../../src/production/runner-api.ts';
import {RUNNER_ORIGIN} from '../../src/production/runner-boundary.ts';
import {metaFingerprint} from '../../src/cloud/meta.ts';
import {businessDate} from '../../src/domain/policy.ts';
type Env=RunnerBindings&{CPU_TEST_MODE?:string;CPU_TEST_DATABASE_ID?:string;CPU_TEST_ASSET_BUCKET?:string;CPU_TEST_NAME?:string;CPU_TEST_TOKEN?:string;CPU_DEPLOYMENT?:string};
let first=true;
export default {async fetch(request:Request,e:Env){
 const url=new URL(request.url),name=e.CPU_TEST_NAME;
 if(e.CPU_TEST_MODE!=='private-f7'||!/^nttu-f7-cpu-[a-f0-9]{10}$/.test(name??'')||e.CPU_TEST_ASSET_BUCKET!==name||! /^[a-f0-9-]{36}$/.test(e.CPU_TEST_DATABASE_ID??'')||['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(e.CPU_TEST_DATABASE_ID!)||url.origin!=='https://'+name+'.nttu-kts-johntroger.workers.dev'||! /^[a-f0-9]{64}$/.test(e.CPU_TEST_TOKEN??''))return Response.json({error:'F7_ISOLATION_REQUIRED'},{status:403});
 if(request.headers.get('Authorization')!=='Bearer '+e.CPU_TEST_TOKEN)return Response.json({error:'AUTH_REQUIRED'},{status:401});
 const cold=first;first=false;
 console.log('F7_OBSERVATION',JSON.stringify({cold,path:url.pathname,deployment:e.CPU_DEPLOYMENT,group:request.headers.get('X-F7-Group')}));
 if(url.pathname==='/reset'){
  if(request.method!=='POST'||await request.text()!=='{}')return Response.json({error:'RESET_INPUT_INVALID'},{status:400});
  const db=e.DB!,at=Date.now(),day=businessDate(new Date(at));
  const fingerprint=await metaFingerprint({APP_ENV:'production',META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:'fixture-secret-'+'s'.repeat(30),META_PAGE_ACCESS_TOKEN:'fixture-token-'+'t'.repeat(60)});
  // These fixture tables belong only to the private cloned database. Original
  // warehouse rows, schema journal and the real production database are kept.
  for(const table of ['production_runner_grants','production_runner_sessions','production_publisher_preparation','production_publisher_stock_scan','production_publisher_usage','production_publisher_evidence','production_publisher_attempts','production_publisher_jobs','production_send_permits'])await db.prepare('DELETE FROM '+table).run();
  await db.batch!([
   db.prepare("UPDATE application_state SET paused_by_user=0,maintenance_owner=NULL,blocked_reasons='[]' WHERE environment='production'"),
   db.prepare('UPDATE production_publisher_config SET enabled=1,start_date=?,active_job=NULL,blocked=NULL,stock_pending=0,connection_hash=? WHERE id=1').bind(day,fingerprint),
   db.prepare(`INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at)
    SELECT 'f7-private-permit','817593604765443',v.id,r.caption_snapshot,a.checksum,?,?,?,'test','tranthanhtung37@gmail.com',?
    FROM posts p JOIN content_entries c ON c.post_id=p.id JOIN post_versions v ON v.id=c.active_version_id JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version JOIN assets a ON a.id=v.asset_id WHERE p.content_key='P01'`).bind(day,at,at+3600000,at-1000)
  ]);
  return Response.json({reset:true});
 }
 const env={...e,RUNNER_ORIGIN,PRODUCTION_RUNNER_ENABLED:'true',PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_TOKEN:e.CPU_TEST_TOKEN!,PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),PRODUCTION_TRIGGER_TOKEN:'c'.repeat(64)};
 // Only the isolated harness rebases the origin. The production module still
 // checks its fixed origin and whitelist; no clock or provider is injected.
 return runnerWorker.fetch(new Request(RUNNER_ORIGIN+url.pathname+url.search,request),env);
}};
