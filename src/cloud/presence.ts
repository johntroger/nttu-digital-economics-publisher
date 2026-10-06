import type {CloudBindings} from './runtime.ts';
import {readStatus} from './runtime.ts';
import {checkMeta,metaConfigured,metaProof} from './meta.ts';
import {validDailyPost} from './daily-meta.ts';
import {businessDate,POLICY} from '../domain/policy.ts';
type Row=Record<string,unknown>;
type Observation={state:'available'|'unavailable'|'unverified';reason:string};
const rows=async(env:CloudBindings,sql:string,...values:(string|number|null)[])=>(await env.DB!.prepare(sql).bind(...values).all!<Row>()).results;
const hour=(now:number)=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:POLICY.timeZone,hour:'2-digit',hourCycle:'h23'}).format(now));
export async function readPresence(env:CloudBindings){await readStatus(env);return{checkTime:'08:00',timeZone:POLICY.timeZone,observations:await rows(env,'SELECT * FROM cloud_publication_presence ORDER BY checked_at DESC LIMIT 5000'),lastRun:(await rows(env,'SELECT r.*, (SELECT count(*) FROM cloud_presence_items i WHERE i.run_id=r.id) total,(SELECT count(*) FROM cloud_presence_items i WHERE i.run_id=r.id AND i.state IN (\'pending\',\'intent\')) remaining FROM cloud_presence_runs r WHERE page_id=? ORDER BY business_date DESC LIMIT 1',env.META_PAGE_ID??''))[0]??null};}
async function body(response:Response){const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();throw Error('response oversized');}chunks.push(part.value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('response invalid');return value as Row;}
export async function observePost(env:CloudBindings,remoteId:string,transport:typeof fetch=fetch):Promise<Observation>{
 if(!validDailyPost(env.META_PAGE_ID??'',remoteId)||!metaConfigured(env))return{state:'unverified',reason:'PAGE_MISMATCH'};
 try{
  const url=new URL('https://graph.facebook.com/'+env.META_API_VERSION+'/'+remoteId);url.searchParams.set('fields','id');url.searchParams.set('appsecret_proof',await metaProof(env));
  const response=await transport(url.href,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},signal:AbortSignal.timeout(10000)});
  if(response.status>=300&&response.status<400)return{state:'unverified',reason:'REDIRECT_BLOCKED'};
  if(response.status===429||response.status>=500)return{state:'unverified',reason:'PROVIDER_UNAVAILABLE'};
  const data=await body(response);
  if(response.status===200&&data.id===remoteId)return{state:'available',reason:'POST_READ_VERIFIED'};
  const error=data.error as Row|undefined;
  // This observation means inaccessible, never proof that the owner deleted it.
  if(response.status===400&&error?.code===100&&error.error_subcode===33)return{state:'unavailable',reason:'POST_NOT_ACCESSIBLE'};
  return{state:'unverified',reason:error?.code===190?'TOKEN_INVALID':[10,200].includes(Number(error?.code))?'PERMISSION_DENIED':'RESPONSE_UNVERIFIED'};
 }catch{return{state:'unverified',reason:'CONNECTION_FAILED'};}
}
async function project(env:CloudBindings,run:string){
 await env.DB!.batch!([
  env.DB!.prepare(`INSERT INTO cloud_publication_presence(remote_id,page_id,observed_status,observed_at,first_unavailable_at,checked_at,check_result,reason)
   SELECT i.remote_id,r.page_id,CASE WHEN i.state!='unverified' THEN i.state END,CASE WHEN i.state!='unverified' THEN i.checked_at END,CASE WHEN i.state='unavailable' THEN i.checked_at END,i.checked_at,i.state,i.reason
   FROM cloud_presence_items i JOIN cloud_presence_runs r ON r.id=i.run_id WHERE i.run_id=? AND i.state IN ('available','unavailable','unverified')
   ON CONFLICT(remote_id) DO UPDATE SET observed_status=COALESCE(excluded.observed_status,cloud_publication_presence.observed_status),observed_at=COALESCE(excluded.observed_at,cloud_publication_presence.observed_at),first_unavailable_at=COALESCE(cloud_publication_presence.first_unavailable_at,excluded.first_unavailable_at),checked_at=excluded.checked_at,check_result=excluded.check_result,reason=excluded.reason
   WHERE excluded.checked_at>cloud_publication_presence.checked_at`).bind(run),
  env.DB!.prepare("UPDATE cloud_presence_runs SET completed_at=COALESCE((SELECT max(checked_at) FROM cloud_presence_items WHERE run_id=?),started_at) WHERE id=? AND completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM cloud_presence_items WHERE run_id=? AND state IN ('pending','intent'))").bind(run,run,run),
 ]);
}
export async function scanPresence(env:CloudBindings,options:{now?:number;transport?:typeof fetch}={}){
 await readStatus(env);const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)throw Error('invalid clock');
 if(!metaConfigured(env)||!env.DB?.batch)return{state:'unconfigured'};if(hour(now)<8)return{state:'not_due'};
 if((await rows(env,"SELECT 1 busy FROM application_state WHERE environment='staging' AND (maintenance_owner IS NOT NULL OR blocked_reasons!='[]')")).length)return{state:'blocked'};
 const page=env.META_PAGE_ID!,day=businessDate(new Date(now)),run=page+':'+day;
 let current=(await rows(env,'SELECT * FROM cloud_presence_runs WHERE id=?',run))[0];
 if(current&&current.completed_at!==null)return{state:'day_complete'};
 if(!current){
  const seed=crypto.randomUUID();
  // The run and its Page-scoped inventory are captured atomically, only once daily.
  await env.DB.batch([
   env.DB.prepare("INSERT INTO cloud_presence_runs VALUES(?,?,?,?,NULL,?) ON CONFLICT(id) DO NOTHING").bind(run,page,day,now,seed),
   env.DB.prepare(`INSERT INTO cloud_presence_items(run_id,remote_id)
    SELECT ?,remote_id FROM (
     SELECT pub.remote_id FROM publications pub JOIN publish_jobs j ON j.id=pub.job_id JOIN page_connections c ON c.id=j.page_connection_id WHERE c.environment='staging' AND c.page_id=?
     UNION SELECT remote_id FROM cloud_content_trial WHERE state='published' AND remote_id LIKE ?
     UNION SELECT remote_id FROM cloud_meta_trial WHERE state='published' AND page_id=?
    ) WHERE EXISTS(SELECT 1 FROM cloud_presence_runs WHERE id=? AND seed_token=?) ON CONFLICT DO NOTHING`).bind(run,page,page+'_%',page,run,seed),
   env.DB.prepare('DELETE FROM cloud_presence_runs WHERE business_date<?').bind(businessDate(new Date(now-7*86400000))),
  ]);
  current=(await rows(env,'SELECT * FROM cloud_presence_runs WHERE id=?',run))[0];
 }
 await env.DB.prepare("UPDATE cloud_presence_items SET state='unverified',reason='CHECK_INTERRUPTED',checked_at=? WHERE run_id=? AND state='intent' AND lease_until<=?").bind(now,run,now).run();
 if(!(await rows(env,"SELECT 1 pending FROM cloud_presence_items WHERE run_id=? AND state='pending' LIMIT 1",run)).length){await project(env,run);return{state:'idle'};}
 const proof=await checkMeta(env,{email:POLICY.ownerEmail,sub:'scheduler',csrf:''},{requestId:crypto.randomUUID()},{now,transport:options.transport??fetch});
 if(!proof.verifiedReadOnly){await env.DB.prepare("UPDATE cloud_presence_items SET state='unverified',checked_at=?,reason='META_NOT_VERIFIED' WHERE run_id=? AND state='pending'").bind(now,run).run();await project(env,run);return{state:'processed'};}
 const owner=crypto.randomUUID();
 const claimed=await rows(env,"UPDATE cloud_presence_items SET state='intent',owner=?,lease_until=? WHERE run_id=? AND remote_id IN (SELECT remote_id FROM cloud_presence_items WHERE run_id=? AND state='pending' ORDER BY remote_id LIMIT 10) AND state='pending' RETURNING remote_id",owner,now+150000,run,run);
 for(const item of claimed){const result=await observePost(env,String(item.remote_id),options.transport);await env.DB.prepare("UPDATE cloud_presence_items SET state=?,checked_at=?,reason=? WHERE run_id=? AND remote_id=? AND state='intent' AND owner=?").bind(result.state,now,result.reason,run,String(item.remote_id),owner).run();}
 await project(env,run);return{state:'processed',checked:claimed.length};
}
