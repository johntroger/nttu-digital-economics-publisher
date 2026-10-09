// F5 cloud-only private clone harness. No real Meta/Google/Telegram credentials.
import {runnerAPI} from '../../src/production/runner-api.ts';
import type {RunnerBindings} from '../../src/production/runner-api.ts';
import {metaFingerprint} from '../../src/cloud/meta.ts';
type Env=RunnerBindings&{CPU_TEST_MODE?:string;CPU_TEST_DATABASE_ID?:string;CPU_TEST_TOKEN?:string;CPU_DEPLOYMENT?:string};
let first=true;const at=Date.parse('2026-10-08T03:00:00Z');
export default {async fetch(request:Request,e:Env){
 if(e.CPU_TEST_MODE!=='private-f5'||!e.CPU_TEST_DATABASE_ID||['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(e.CPU_TEST_DATABASE_ID)||! /^[a-f0-9]{64}$/.test(e.CPU_TEST_TOKEN??''))return Response.json({error:'F5_ISOLATION_REQUIRED'},{status:403});
 const env={...e,PRODUCTION_RUNNER_ENABLED:'true',PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_TOKEN:e.CPU_TEST_TOKEN!,PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),PRODUCTION_TRIGGER_TOKEN:'c'.repeat(64)};
 if(request.headers.get('Authorization')!=='Bearer '+e.CPU_TEST_TOKEN)return Response.json({error:'AUTH_REQUIRED'},{status:401});
 const path=new URL(request.url).pathname,cold=first;first=false;
 console.log('F5_OBSERVATION',JSON.stringify({cold,path,deployment:e.CPU_DEPLOYMENT,group:request.headers.get('X-F5-Group')}));
 if(path==='/reset'){
  if(request.method!=='POST'||await request.text()!=='{}')return Response.json({error:'RESET_INPUT_INVALID'},{status:400});
  const db=e.DB!;
  // Copy history/outbox is retained; only publisher fixture rows are reset.
  for(const name of ['production_runner_grants','production_runner_sessions','production_publisher_preparation','production_publisher_stock_scan','production_publisher_usage','production_publisher_evidence','production_publisher_attempts','production_publisher_jobs','production_send_permits'])await db.prepare('DELETE FROM '+name).run();
  const fingerprint=await metaFingerprint({APP_ENV:'production',META_PAGE_ID:'817593604765443',META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',META_APP_SECRET:'fixture-secret-'+'s'.repeat(30),META_PAGE_ACCESS_TOKEN:'fixture-token-'+'t'.repeat(60)});
  await db.batch!([db.prepare("UPDATE application_state SET paused_by_user=0,maintenance_owner=NULL,blocked_reasons='[]' WHERE environment='production'"),db.prepare("UPDATE production_publisher_config SET enabled=1,start_date='2026-10-08',active_job=NULL,blocked=NULL,stock_pending=0,connection_hash=? WHERE id=1").bind(fingerprint),db.prepare(`INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at)
 SELECT 'f5-private-permit','817593604765443',v.id,r.caption_snapshot,a.checksum,'2026-10-08',?,?,'test','tranthanhtung37@gmail.com',?
 FROM posts p JOIN content_entries c ON c.post_id=p.id JOIN post_versions v ON v.id=c.active_version_id JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version JOIN assets a ON a.id=v.asset_id WHERE p.content_key='P01'`).bind(at,at+3600000,at-1000)]);
  return Response.json({reset:true});
 }
 return runnerAPI(request,env,()=>at);
}};
