// F4 isolated cloud measurement entrypoint. NEVER the production Worker entry.
// No Google/Telegram credentials and no direct fetch to graph.facebook.com.
import type {PublisherBindings} from '../../src/production/publisher-live.ts';
import {publisherAuthorized} from '../../src/production/publisher-live.ts';
import {runStagedProductionPublisher} from '../../src/production/publisher-stages.ts';
import {ProductionMetaPublisher,PRODUCTION_PAGE} from '../../src/production/publisher-provider.ts';
import {approvedProductionItems,productionPreviewPage} from '../../src/production/preview.ts';
import {productionPreparation} from '../../src/production/preparation.ts';
import {managementSummary,managementPostPage,managementPostDetail,managementSection} from '../../src/production/management.ts';
import {metaFingerprint} from '../../src/cloud/meta.ts';
import {businessDate} from '../../src/domain/policy.ts';
type Env=PublisherBindings&{CPU_TEST_MODE?:string;CPU_TEST_DATABASE_ID?:string;CPU_TEST_TOKEN?:string;CPU_MOCK_ORIGIN?:string;CPU_DEPLOYMENT?:string};
let first=true;
const val=(e:Env,q:string,...v:(string|number|null)[])=>e.DB!.prepare(q).bind(...v);
function isolated(e:Env){
 if(e.CPU_TEST_MODE!=='isolated-f4'||!e.CPU_TEST_DATABASE_ID||['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'].includes(e.CPU_TEST_DATABASE_ID)||!/^https:\/\/nttu-f4-mock-[a-f0-9]+\.nttu-kts-johntroger\.workers\.dev$/.test(e.CPU_MOCK_ORIGIN??''))throw Error('F4_ISOLATION_REQUIRED');
}
const active=(e:Env)=>({...e,SESSION_SIGNING_KEY:'f4-isolated-receipts-'+'k'.repeat(48),PRODUCTION_PUBLISHER_TOKEN:e.CPU_TEST_TOKEN??'',PRODUCTION_PUBLISHER_ENABLED:'true',META_PAGE_ACCESS_TOKEN:'f4-fixture-token-'+ 't'.repeat(60),META_APP_SECRET:'f4-fixture-secret-'+ 's'.repeat(30),META_APP_ID:'1125636386458970',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify'});
export async function cpuFetch(request:Request,e:Env,transport:typeof fetch=fetch){
 try{
 isolated(e);const env=active(e);if(!await publisherAuthorized(request,env))return Response.json({error:'AUTH_REQUIRED'},{status:401});
 if(request.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
 const url=new URL(request.url),input=await request.json() as {at:number;key?:string;receipt?:string;cursor?:string;scenario?:string};
 if(!Number.isSafeInteger(input.at)||input.at<Date.parse('2026-10-08T00:00:00Z')||input.at>Date.parse('2026-10-09T00:00:00Z'))throw Error('F4_CLOCK_INVALID');
 const cold=first;first=false;console.log('F4_OBSERVATION',JSON.stringify({cold,path:url.pathname,release:e.RELEASE_SHA,deployment:e.CPU_DEPLOYMENT}));
 const wire:typeof fetch=async(u,i)=>{const target=new URL(String(u));if(target.origin!=='https://graph.facebook.com'||!['GET','POST'].includes(i?.method??''))throw Error('F4_NETWORK_DENIED');
  const headers=new Headers(i?.headers);headers.set('Authorization','Bearer '+e.CPU_TEST_TOKEN);headers.set('X-F4-Time',String(input.at));headers.set('X-F4-Scenario',input.scenario??'confirmed');
  return transport(e.CPU_MOCK_ORIGIN+target.pathname+target.search,{...i,headers});};
 const provider=new ProductionMetaPublisher(env,wire);
 if(url.pathname==='/reset'){
  const key=input.key??'P01',row=await val(e,'SELECT v.id FROM post_versions v JOIN content_entries c ON c.active_version_id=v.id JOIN posts p ON p.id=c.post_id WHERE p.content_key=?',key).first<{id:string}>();
  if(!row)throw Error('F4_POST_UNKNOWN');const item=(await approvedProductionItems(env,input.at,row.id,'batch'))[0]!;
  await e.DB!.batch!(['DELETE FROM production_publisher_preparation','DELETE FROM production_publisher_stock_scan','DELETE FROM production_publisher_usage','DELETE FROM production_publisher_evidence','DELETE FROM production_publisher_attempts','DELETE FROM production_publisher_jobs','DELETE FROM production_send_permits','DELETE FROM notification_outbox'].map(q=>e.DB!.prepare(q)));
  const closed=input.scenario==='closed';
  await e.DB!.batch!([val(e,'UPDATE production_publisher_config SET enabled=?,start_date=?,connection_hash=?,active_job=NULL,blocked=NULL,stock_pending=? WHERE id=1',closed?0:1,businessDate(new Date(input.at)),await metaFingerprint(env),input.scenario==='stock'?1:0),val(e,"UPDATE application_state SET paused_by_user=?,maintenance_owner=NULL,blocked_reasons='[]' WHERE environment='production'",closed?1:0),val(e,'UPDATE production_publisher_runtime SET lease_id=NULL,lease_until=NULL,last_bucket=NULL WHERE id=1')]);
  if(!closed&&input.scenario!=='stock')await val(e,"INSERT INTO production_send_permits(id,page_id,version_id,caption,checksum,business_date,due_at,expires_at,mode,actor,approved_at) VALUES('f4-isolated-permit',?,?,?,?,?,?,?,'test','tranthanhtung37@gmail.com',?)",PRODUCTION_PAGE,item.versionId,item.caption,item.imageChecksum,businessDate(new Date(input.at)),input.at,input.at+3600000,input.at-1000).run();
  return Response.json({reset:true,versionId:item.versionId,postId:item.postId,post:key,cold});
 }
 if(url.pathname.startsWith('/tick/')){
  const fault=input.scenario==='crash',original=env.DB!;
  const bindings:PublisherBindings=fault?{...env,DB:{prepare(q){if(q.startsWith('INSERT INTO production_publisher_evidence'))throw Error('F4_SIMULATED_CRASH');return original.prepare(q);},batch:q=>original.batch!(q)}}:env;
  return Response.json({...await runStagedProductionPublisher(bindings,provider,()=>input.at),cold});
 }
 if(url.pathname==='/pause'){await val(e,"UPDATE application_state SET paused_by_user=1 WHERE environment='production'").run();return Response.json({paused:true,cold});}
 if(url.pathname==='/closed'){await e.DB!.batch!([val(e,'UPDATE production_publisher_config SET enabled=0 WHERE id=1'),val(e,"UPDATE application_state SET paused_by_user=1 WHERE environment='production'")]);return Response.json({closed:true,cold});}
 const closedEnv={...env,PRODUCTION_PUBLISHER_ENABLED:'false'};
 if(url.pathname==='/preview'||url.pathname.startsWith('/preview/'))return Response.json({...await productionPreviewPage(closedEnv,input.cursor?{cursor:input.cursor}:{},input.at),cold});
 if(url.pathname.startsWith('/preparation/')){const phase=url.pathname.split('/').at(-1)!;return Response.json({...await productionPreparation(closedEnv,input.receipt?{receipt:input.receipt}:{versionId:input.key},wire,()=>input.at,phase),cold});}
 if(url.pathname==='/summary')return Response.json({...await managementSummary(closedEnv),cold});
 if(url.pathname==='/posts')return Response.json({...await managementPostPage(closedEnv,input.cursor,input.at),cold});
 if(url.pathname==='/detail')return Response.json({...await managementPostDetail(closedEnv,input.key!),cold});
 if(url.pathname==='/library')return Response.json({...await managementSection(closedEnv,'library'),cold});
 throw Error('F4_ROUTE_UNKNOWN');
 }catch(error){return Response.json({error:error instanceof Error?error.message:'F4_FAILURE'},{status:500});}
}
export default {fetch:(r:Request,e:Env)=>cpuFetch(r,e)};
