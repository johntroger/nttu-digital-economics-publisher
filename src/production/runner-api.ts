// F5 protocol prototype. Not mounted by the production Worker and disabled by
// default. Heavy approval/image/provider work belongs to the trusted Node runner.
import type {ManagementBindings} from './management.ts';
import {assertProductionEnvironment} from './management.ts';
import {assertPublisherBoundary} from './publisher-boundary.ts';
import {approvalQueries} from './preview.ts';
import {readSnapshotSQL} from './read-pages.ts';
import {versionGuard} from '../cloud/version-guard.ts';
import {PRODUCTION_PAGE,publicationHash} from './publisher-provider.ts';
import {finalizePublisherEvidence} from './publisher-live.ts';
import type {PublicationResult} from './publisher-provider.ts';
import {businessDate,scheduledInstant} from '../domain/policy.ts';

export interface RunnerBindings extends ManagementBindings {PRODUCTION_RUNNER_ENABLED?:string;PRODUCTION_RUNNER_TOKEN?:string}
type Row=Record<string,any>;type Value=string|number|null;
const q=(e:RunnerBindings,sql:string,...values:Value[])=>e.DB!.prepare(sql).bind(...values);
const first=(e:RunnerBindings,sql:string,...values:Value[])=>q(e,sql,...values).first<Row>();
const batch=(e:RunnerBindings,sql:ReturnType<typeof q>[])=>e.DB!.batch!(sql);
const day=(n:number)=>businessDate(new Date(n));
// Cache query text only. D1 still reads mutable rows and receives fresh server
// time parameters on every invocation; no approval result is cached here.
const SNAPSHOT_SQL=readSnapshotSQL();
const uid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const remote=(x:unknown):x is string=>typeof x==='string'&&/^817593604765443_[1-9][0-9]{4,24}$/.test(x);
const eligible=(v:string,n:number)=>versionGuard(v,n).replace('WHERE old.post_id=q.prerequisite_id)', 'WHERE old.post_id=q.prerequisite_id UNION ALL SELECT 1 FROM production_publisher_usage pu WHERE pu.post=q.prerequisite_id)');
const JSON_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const answer=(body:unknown,status=200)=>Response.json(body,{status,headers:JSON_HEADERS});
class ProtocolError extends Error{status:number;constructor(code:string,status=409){super(code);this.status=status;}}
function fail(code:string,status=409):never{throw new ProtocolError(code,status);}
const only=(body:Row,names:string[])=>{if(Object.keys(body).some(k=>!names.includes(k)))fail('RUNNER_FIELDS_INVALID',400);};
const time=(clock:()=>number)=>{const now=clock();if(!Number.isSafeInteger(now)||now<0)fail('RUNNER_CLOCK_INVALID');return now;};
async function authorized(r:Request,e:RunnerBindings){
 const status=new URL(r.url).pathname==='/runner/status',received=r.headers.get('Authorization');
 const secret=status&&received==='Bearer '+e.PRODUCTION_MONITOR_TOKEN?e.PRODUCTION_MONITOR_TOKEN:e.PRODUCTION_RUNNER_TOKEN;
 if(!hash(secret)||(secret===e.PRODUCTION_RUNNER_TOKEN?[e.PRODUCTION_PUBLISHER_TOKEN,e.PRODUCTION_MONITOR_TOKEN,e.PRODUCTION_TRIGGER_TOKEN].includes(secret):secret===e.PRODUCTION_TRIGGER_TOKEN||secret===e.PRODUCTION_PUBLISHER_TOKEN)||received?.length!==71||!received.startsWith('Bearer '))return false;
 // Both operands are fixed-size hexadecimal capabilities. Compare every byte;
 // hashing both first adds async crypto work without improving this comparison.
 let difference=0;for(let i=0;i<64;i++)difference|=secret.charCodeAt(i)^received.charCodeAt(i+7);return difference===0;
}
const identitySQL=`SELECT i.database_id,a.paused_by_user,a.maintenance_owner,a.blocked_reasons,a.operation_generation,
 (SELECT count(*) FROM production_publisher_usage WHERE day=?) today_used,
 (SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM schema_migrations WHERE name='0016_production_publisher_runner.sql') runner_schema,
 c.enabled,c.revision,c.connection_hash,c.start_date,c.active_job,c.blocked,(SELECT state FROM production_publisher_jobs WHERE id=c.active_job) job_state FROM production_identity i
 JOIN application_state a ON a.environment=i.environment JOIN production_publisher_config c ON c.id=1
 WHERE i.id=1 AND i.environment='production' AND i.schema_version=1`;
const live=(state:Row)=>state.enabled===1&&state.paused_by_user===0&&state.maintenance_owner===null&&state.blocked_reasons==='[]'&&state.blocked===null;
// SQL is rebuilt using server time only. No client-generated SQL, Page or clock.
const fenceSQL=(n:number)=>`EXISTS(SELECT 1 FROM production_publisher_config c JOIN application_state a ON a.environment='production'
 JOIN production_send_permits p ON p.id=j.permit JOIN production_runner_sessions s ON s.job=j.id
 WHERE c.id=1 AND c.active_job=j.id AND c.enabled=1 AND c.blocked IS NULL AND c.revision=j.config_revision
 AND a.paused_by_user=0 AND a.maintenance_owner IS NULL AND a.blocked_reasons='[]' AND a.operation_generation=j.operation_generation
 AND p.page_id='${PRODUCTION_PAGE}' AND p.revoked=0 AND p.due_at<=${n} AND p.expires_at>${n} AND p.business_date='${day(n)}'
 AND s.release=? AND s.runner=? AND s.expires_at>${n} AND s.snapshot=(SELECT snapshot FROM (${SNAPSHOT_SQL}))
 AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=j.day OR post=j.post) AND ${eligible('j.version',n)})`;
const fenceArgs=(e:RunnerBindings,runner:string,n:number):Value[]=>[e.RELEASE_SHA!,runner,n,n,n];
const JOB_SQL=`SELECT j.*,s.runner,s.release,s.expires_at,s.caption_hash,s.image_bytes,s.proof_until,s.fingerprint,
 l.id image_id,l.storage_key,l.size_bytes,l.checksum file_checksum FROM production_publisher_jobs j
 JOIN production_runner_sessions s ON s.job=j.id JOIN post_versions v ON v.id=j.version
 JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE j.id=?`;
const CLAIM_VIEW_SQL=`SELECT j.id,j.version,j.caption,j.checksum,j.day,s.release,s.caption_hash,l.size_bytes
 FROM production_publisher_jobs j JOIN production_runner_sessions s ON s.job=j.id
 JOIN post_versions v ON v.id=j.version JOIN cloud_library l ON v.asset_id='library-'||l.id WHERE j.id=?`;
const CLAIM_PERMIT_SQL=`SELECT p.id,p.mode,p.due_at,p.business_date FROM production_send_permits p JOIN post_versions v ON v.id=p.version_id
 WHERE p.page_id=? AND p.business_date=? AND p.revoked=0 AND p.due_at<=? AND p.expires_at>? AND p.approved_at<=?
 AND NOT EXISTS(SELECT 1 FROM production_publisher_jobs j WHERE j.permit=p.id) ORDER BY p.due_at,p.id LIMIT 1`;
async function job(e:RunnerBindings,id:unknown){
 if(typeof id!=='string'||!/^runner-job:[a-f0-9-]{36}$/.test(id))fail('RUNNER_JOB_INVALID',400);
 const row=await first(e,JOB_SQL,id);if(!row)fail('RUNNER_JOB_UNKNOWN',404);return row;
}
const requestView=(j:Row,at:number)=>({job:j.id,versionId:j.version,caption:j.caption,checksum:j.checksum,pageId:PRODUCTION_PAGE,bytes:j.size_bytes,serverNow:at,day:j.day,release:j.release,captionHash:j.caption_hash});
async function recovery(e:RunnerBindings,j:Row,n:number){
 const row=await first(e,`SELECT t.id attempt,t.created_at sentAt,t.state attempt_state,ev.response,ev.applied FROM production_publisher_attempts t
 LEFT JOIN production_publisher_evidence ev ON ev.attempt=t.id WHERE t.job=? ORDER BY t.ordinal DESC LIMIT 1`,j.id);
 return {state:j.state,...requestView(j,n),attempt:row?.attempt??null,sentAt:row?.sentAt??null,remoteId:row?.response?JSON.parse(row.response).remoteId??null:null,applied:row?.applied??null};
}
async function claim(e:RunnerBindings,b:Row,n:number,state:Row,p:Row|undefined){
 only(b,['runner']);if(!uid(b.runner))fail('RUNNER_ID_INVALID',400);
 if(state.active_job){
  const j=await job(e,state.active_job);
  if(['requested','unknown','confirmed'].includes(j.state))return answer(await recovery(e,j,n));
  if(!live(state))return answer({state:'closed'});
  if(j.state==='retry_wait'){
   // Retry only an applied, explicit retryable response; never a lost POST.
   const retry=await first(e,"SELECT 1 ok FROM production_publisher_attempts t JOIN production_publisher_evidence ev ON ev.attempt=t.id WHERE t.job=? AND t.ordinal=? AND t.state='retryable' AND ev.applied=1 AND json_extract(ev.response,'$.kind')='retryable'",j.id,j.tries);
   if(!retry||j.tries>=3||j.next_at>n)return answer({state:'retry_wait'});
   await batch(e,[q(e,"UPDATE production_publisher_jobs SET state='held',next_at=NULL WHERE id=? AND state='retry_wait' AND next_at<=?",j.id,n),q(e,'UPDATE production_runner_sessions SET runner=?,expires_at=?,image_bytes=NULL,proof_until=NULL,fingerprint=NULL WHERE job=?',b.runner,n+180000,j.id)]);
  }else if(j.runner!==b.runner){
   const takeover=await first(e,"UPDATE production_runner_sessions SET runner=?,expires_at=?,image_bytes=NULL,proof_until=NULL,fingerprint=NULL WHERE job=? AND expires_at<=? AND EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=? AND state='held') RETURNING job",b.runner,n+180000,j.id,n,j.id);
   if(!takeover)return answer({state:'leased'});
  }
  const current=await job(e,j.id);return answer({state:'held',...requestView(current,n)});
 }
 if(!live(state)||!state.start_date||day(n)<state.start_date)return answer({state:'closed'});
 if(state.today_used>0)return answer({state:'day_complete'});
 if(!p)return answer({state:'publication_approval_required'});
 if(day(p.due_at)!==p.business_date||p.mode==='normal'&&p.due_at!==scheduledInstant(p.business_date).getTime())fail('RUNNER_PERMIT_TIME_INVALID');
 const id='runner-job:'+crypto.randomUUID();
 const created=await batch(e,[q(e,`INSERT INTO production_publisher_jobs(id,permit,day,post,version,snapshot,caption,checksum,config_revision,operation_generation,state,lease_until,created_at)
 SELECT ?,p.id,p.business_date,v.post_id,v.id,'{"runner":true}',p.caption,p.checksum,c.revision,a.operation_generation,'held',?,?
 FROM production_send_permits p JOIN post_versions v ON v.id=p.version_id JOIN production_publisher_config c ON c.id=1 JOIN application_state a ON a.environment='production'
 WHERE p.id=? AND p.revoked=0 AND p.due_at<=? AND p.expires_at>? AND c.active_job IS NULL AND c.enabled=1 AND c.blocked IS NULL
 AND a.paused_by_user=0 AND a.maintenance_owner IS NULL AND a.blocked_reasons='[]' AND ${eligible('v.id',n)}
 AND NOT EXISTS(SELECT 1 FROM production_publisher_usage WHERE day=p.business_date OR post=v.post_id)`,id,n+180000,n,p.id,n,n),
 q(e,`INSERT INTO production_runner_sessions(job,runner,release,snapshot,expires_at) SELECT ?,?,?,snapshot,? FROM (${SNAPSHOT_SQL}) WHERE EXISTS(SELECT 1 FROM production_publisher_jobs WHERE id=?)`,id,b.runner,e.RELEASE_SHA!,n+180000,n,n,n,id),
 q(e,'UPDATE production_publisher_config SET active_job=? WHERE id=1 AND active_job IS NULL AND EXISTS(SELECT 1 FROM production_runner_sessions WHERE job=?) RETURNING active_job',id,id),q(e,CLAIM_VIEW_SQL,id)]);
 const receipt=created[2] as {results?:Row[]}|undefined;
 if(receipt?.results?.[0]?.active_job!==id)return answer({state:'claim_lost'});
 const claimed=(created[3] as {results?:Row[]}|undefined)?.results?.[0];if(!claimed)fail('RUNNER_JOB_UNKNOWN',404);
 return answer({state:'held',...requestView(claimed,n)});
}
async function route(r:Request,e:RunnerBindings,b:Row,n:number,state:Row){
 const path=new URL(r.url).pathname;
 if(path==='/runner/status'){only(b,[]);const blocked=['requested','unknown'].includes(state.job_state);return answer({state:blocked?state.job_state:live(state)?'armed':'closed',enabled:live(state)&&!blocked,armed:live(state),paused:state.paused_by_user===1,revision:state.revision,generation:state.operation_generation,release:e.RELEASE_SHA,serverNow:n,activeJob:state.active_job,counts:await first(e,"SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM assets) assets,(SELECT count(*) FROM production_publisher_usage) publications,(SELECT count(*) FROM production_publisher_jobs WHERE state='unknown') unknown")});}
 only(b,path==='/runner/image'?['job','runner']:path==='/runner/proof'?['job','runner','checksum','bytes','checkVersion','connection']:path==='/runner/intent'?['job','runner']:path==='/runner/authorize'?['job','runner','attempt','grant']:path==='/runner/evidence'?['job','runner','attempt','result']:path==='/runner/finalize'?['job','runner','attempt']:[]);
 if(!uid(b.runner))fail('RUNNER_ID_INVALID',400);
 const j=await job(e,b.job);
 if(!['/runner/evidence','/runner/finalize'].includes(path)&&j.runner!==b.runner)fail('RUNNER_LEASE_OWNER');
 if(path==='/runner/image'||path==='/runner/proof'||path==='/runner/intent'){
  if(j.state!=='held')fail('RUNNER_PHASE_INVALID');
  if(j.expires_at<=n||j.release!==e.RELEASE_SHA||!live(state))fail('RUNNER_CLOSED_OR_EXPIRED');
  if(path!=='/runner/proof'){
   const good=await first(e,`SELECT 1 ok FROM production_publisher_jobs j WHERE j.id=? AND ${fenceSQL(n)}`,j.id,...fenceArgs(e,b.runner,n));if(!good)fail('RUNNER_APPROVAL_CHANGED');
  }
 }
 if(path==='/runner/image'){
  const file=await e.MEDIA!.get(j.storage_key);if(!file||file.size!==j.size_bytes||file.size<1||file.size>5242880)fail('RUNNER_FILE_INVALID');
  return new Response(file.body??await file.arrayBuffer(),{headers:{...JSON_HEADERS,'Content-Type':'image/png','Content-Length':String(file.size),'X-Image-Checksum':j.checksum}});
 }
 if(path==='/runner/proof'){
  const c=b.connection;
  if(b.checksum!==j.checksum||b.bytes!==j.size_bytes||!Number.isSafeInteger(b.checkVersion)||!c||typeof c!=='object'||Array.isArray(c))fail('RUNNER_PROOF_INVALID',400);
  only(c,['verified','fingerprint','expiresAt','dataAccessExpiresAt']);
  if(c.verified!==true||!hash(c.fingerprint)||c.fingerprint!==state.connection_hash)fail('RUNNER_CONNECTION_CHANGED');
  const expiry=[n+60000,...[c.expiresAt,c.dataAccessExpiresAt].filter(x=>x!=null)];if(expiry.some(x=>!Number.isSafeInteger(x)||x<=n))fail('RUNNER_CONNECTION_EXPIRED');
  const saved=await first(e,`WITH allowed AS(SELECT j.id FROM production_publisher_jobs j JOIN post_versions v ON v.id=j.version
 WHERE j.id=? AND j.state='held' AND v.check_version=? AND ${fenceSQL(n)})
 UPDATE production_runner_sessions SET image_bytes=?,caption_hash=?,proof_until=?,fingerprint=? WHERE job IN(SELECT id FROM allowed) AND runner=? RETURNING job`,j.id,b.checkVersion,...fenceArgs(e,b.runner,n),b.bytes,await publicationHash(j.caption),Math.min(...expiry),c.fingerprint,b.runner);
  if(!saved)fail('RUNNER_APPROVAL_CHANGED');return answer({state:'prepared'});
 }
 if(path==='/runner/intent'){
  const attempt='runner-attempt:'+crypto.randomUUID(),grant=crypto.randomUUID();
  await batch(e,[q(e,`INSERT INTO production_publisher_attempts SELECT ?,j.id,j.tries+1,'intent',? FROM production_publisher_jobs j JOIN production_runner_sessions s ON s.job=j.id
 WHERE j.id=? AND j.state='held' AND j.tries<3 AND s.image_bytes=? AND s.caption_hash IS NOT NULL AND s.proof_until>? AND s.fingerprint=? AND ${fenceSQL(n)}`,attempt,n,j.id,j.size_bytes,n,state.connection_hash,...fenceArgs(e,b.runner,n)),
  q(e,"UPDATE production_publisher_jobs SET state='requested',tries=tries+1,lease_until=? WHERE id=? AND state='held' AND EXISTS(SELECT 1 FROM production_publisher_attempts WHERE id=?)",n+60000,j.id,attempt),
  q(e,'INSERT INTO production_runner_grants(attempt,job,runner,grant_id,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM production_publisher_attempts WHERE id=?)',attempt,j.id,b.runner,grant,n+30000,attempt)]);
  if(!await first(e,'SELECT 1 ok FROM production_runner_grants WHERE attempt=?',attempt))fail('RUNNER_INTENT_BLOCKED');
  return answer({state:'intent',attempt,grant,sentAt:n,expiresAt:n+30000});
 }
 if(path==='/runner/authorize'){
  if(typeof b.attempt!=='string'||!uid(b.grant))fail('RUNNER_GRANT_INVALID',400);
  // A CTE keeps the same atomic fences below native D1's expression-depth limit.
  const taken=await first(e,`WITH allowed AS(SELECT j.id FROM production_publisher_jobs j JOIN production_runner_sessions s ON s.job=j.id JOIN production_publisher_attempts t ON t.job=j.id
 WHERE j.id=? AND j.state='requested' AND t.id=? AND t.state='intent' AND j.lease_until>? AND s.proof_until>? AND s.fingerprint=? AND ${fenceSQL(n)})
 UPDATE production_runner_grants SET authorized_at=? WHERE attempt=? AND job=? AND runner=? AND grant_id=? AND authorized_at IS NULL AND expires_at>? AND job IN(SELECT id FROM allowed) RETURNING attempt`,j.id,b.attempt,n,n,state.connection_hash,...fenceArgs(e,b.runner,n),n,b.attempt,j.id,b.runner,b.grant,n);
  return answer({state:taken?'dispatch_once':'dispatch_blocked',dispatch:Boolean(taken),serverNow:n});
 }
 if(path==='/runner/evidence'){
  const t=await first(e,'SELECT t.*,g.authorized_at,g.runner FROM production_publisher_attempts t JOIN production_runner_grants g ON g.attempt=t.id WHERE t.id=? AND t.job=?',String(b.attempt),j.id);
  if(!t)fail('RUNNER_ATTEMPT_INVALID');
  const result=b.result as PublicationResult;
  if(!result||typeof result!=='object'||Array.isArray(result)||!['confirmed','unknown','retryable','policy','global'].includes(result.kind))fail('RUNNER_EVIDENCE_INVALID',400);
  const keys=result.kind==='confirmed'?['kind','remoteId','confirmedAt','attemptId','pageId','captionHash','checksum']:['kind','remoteId'];only(result,keys);
  if(t.authorized_at===null&&result.kind!=='unknown')fail('RUNNER_DISPATCH_NOT_AUTHORIZED');
  if('remoteId' in result&&result.remoteId!==undefined&&!remote(result.remoteId))fail('RUNNER_REMOTE_INVALID',400);
  if(result.kind==='confirmed'&&(result.attemptId!==b.attempt||result.pageId!==PRODUCTION_PAGE||result.captionHash!==j.caption_hash||result.checksum!==j.checksum||!remote(result.remoteId)||!Number.isSafeInteger(result.confirmedAt)||result.confirmedAt<Math.floor(t.created_at/1000)*1000||result.confirmedAt>n+1000||day(result.confirmedAt)!==j.day))fail('RUNNER_CORRELATION_INVALID');
  const old=await first(e,'SELECT * FROM production_publisher_evidence WHERE attempt=?',t.id);
  if(old){const prior=JSON.parse(old.response);if(JSON.stringify(prior)===JSON.stringify(result))return answer({state:'evidence_recorded'});if(prior.kind!=='unknown'||old.applied===1&&result.kind!=='confirmed'||prior.remoteId&&'remoteId' in result&&prior.remoteId!==result.remoteId)fail('RUNNER_TERMINAL_EVIDENCE');
   await q(e,"UPDATE production_publisher_evidence SET response=?,observed_at=?,applied=0 WHERE attempt=? AND json_extract(response,'$.kind')='unknown'",JSON.stringify(result),n,t.id).run();
  }else await q(e,'INSERT INTO production_publisher_evidence(attempt,response,sent_at,observed_at) VALUES(?,?,?,?) ON CONFLICT(attempt) DO NOTHING',t.id,JSON.stringify(result),t.created_at,n).run();
  return answer({state:'evidence_recorded'});
 }
 return answer({error:'RUNNER_ROUTE_UNKNOWN'},404);
}
async function dataPage(e:RunnerBindings,b:Row,n:number){
 only(b,['job','runner','group','offset']);
 if(!uid(b.runner))fail('RUNNER_ID_INVALID',400);
 if(typeof b.job!=='string'||!/^runner-job:[a-f0-9-]{36}$/.test(b.job))fail('RUNNER_JOB_INVALID',400);
 if(!Number.isInteger(b.group)||b.group<0||b.group>4||!Number.isInteger(b.offset)||b.offset<0||b.offset>120||b.offset%8!==0)fail('RUNNER_PAGE_INVALID',400);
 const select=DATA_QUERIES[b.group]!;
 // Two bounded SELECTs in one transaction. The first returns only the gate
 // fields this route needs, rather than the caption and entire leased job.
 const result=await batch(e,[q(e,`SELECT i.database_id,a.paused_by_user,a.maintenance_owner,a.blocked_reasons,c.enabled,c.blocked,
  (SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM schema_migrations WHERE name='0016_production_publisher_runner.sql') runner_schema,
  j.id,j.state job_state,s.runner,s.release,s.expires_at,${fenceSQL(n)} approval_ok
  FROM production_identity i JOIN application_state a ON a.environment=i.environment JOIN production_publisher_config c ON c.id=1
  LEFT JOIN production_publisher_jobs j ON j.id=? LEFT JOIN production_runner_sessions s ON s.job=j.id
  WHERE i.id=1 AND i.environment='production' AND i.schema_version=1`,...fenceArgs(e,b.runner,n),b.job),
  q(e,select.sql+' LIMIT 8 OFFSET ?',...(b.group===3?[]:[b.job]),b.offset)]) as {results:Row[]}[];
 const state=result[0]?.results[0];
 if(!state||state.database_id!==e.PRODUCTION_DATABASE_ID||state.migrations!==16||state.runner_schema!==1)fail('RUNNER_SCHEMA_INVALID');
 if(!state.id)fail('RUNNER_JOB_UNKNOWN',404);
 if(state.runner!==b.runner)fail('RUNNER_LEASE_OWNER');
 if(state.job_state!=='held')fail('RUNNER_PHASE_INVALID');
 if(state.expires_at<=n||state.release!==e.RELEASE_SHA||!live(state))fail('RUNNER_CLOSED_OR_EXPIRED');
 if(state.approval_ok!==1)fail('RUNNER_APPROVAL_CHANGED');
 const rows=result[1]!.results;return answer({rows,next:rows.length===8?b.offset+8:null,serverNow:n});
}
// Cache only query text. Bind the current job and offset on every request.
const DATA_QUERIES=approvalQueries('SELECT version FROM production_publisher_jobs WHERE id=?');
async function finalizeRoute(e:RunnerBindings,b:Row){
 only(b,['job','runner','attempt']);if(!uid(b.runner))fail('RUNNER_ID_INVALID',400);
 if(typeof b.job!=='string'||!/^runner-job:[a-f0-9-]{36}$/.test(b.job))fail('RUNNER_JOB_INVALID',400);
 // Recovery is allowed while paused. Read identity, the immutable job payload,
 // and its correlated durable receipt together; no caption/image lookup needed.
 const row=await first(e,`SELECT i.database_id,
  (SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM schema_migrations WHERE name='0016_production_publisher_runner.sql') runner_schema,
  j.id,j.post,j.permit,j.tries,j.caption,j.checksum,j.state,s.job runner_job,ev.attempt,ev.response,ev.applied,ev.sent_at,ev.observed_at
  FROM production_identity i JOIN application_state a ON a.environment=i.environment JOIN production_publisher_config c ON c.id=1
  LEFT JOIN production_publisher_jobs j ON j.id=?
  LEFT JOIN production_runner_sessions s ON s.job=j.id
  LEFT JOIN production_publisher_attempts t ON t.id=? AND t.job=j.id
  LEFT JOIN production_publisher_evidence ev ON ev.attempt=t.id
  WHERE i.id=1 AND i.environment='production' AND i.schema_version=1`,b.job,String(b.attempt));
 if(!row||row.database_id!==e.PRODUCTION_DATABASE_ID||row.migrations!==16||row.runner_schema!==1)fail('RUNNER_SCHEMA_INVALID');
 if(!row.id||!row.runner_job)fail('RUNNER_JOB_UNKNOWN',404);
 if(!row.attempt)fail('RUNNER_EVIDENCE_MISSING');
 if(row.applied===1)return answer({state:row.state});
 return answer({state:await finalizePublisherEvidence(e,row,row.attempt,JSON.parse(row.response),row.sent_at,row.observed_at)});
}
export async function runnerAPI(request:Request,e:RunnerBindings,clock:()=>number=Date.now,reportError:(error:unknown)=>void=()=>{}):Promise<Response>{
 try{
  if(e.PRODUCTION_RUNNER_ENABLED!=='true'||e.PRODUCTION_PUBLISHER_ENABLED!=='false')return answer({error:'RUNNER_DISABLED'},503);
  if(!await authorized(request,e))return answer({error:'RUNNER_AUTH_REQUIRED'},401);
  assertProductionEnvironment(e);assertPublisherBoundary(e.APP_ENV!,e.META_PAGE_ID??'',e.PRODUCTION_DATABASE_ID!,e.PRODUCTION_ASSET_BUCKET!);
  if(request.method!=='POST')return answer({error:'RUNNER_METHOD_INVALID'},405);
  if(new URL(request.url).search)fail('RUNNER_QUERY_INVALID',400);
  // Actual bytes are bounded, not just the untrusted Content-Length header.
  const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8192){await reader.cancel();fail('RUNNER_BODY_TOO_LARGE',413);}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
  let input:Row;try{input=JSON.parse(text||'{}');}catch{return answer({error:'RUNNER_JSON_INVALID'},400);}if(!input||typeof input!=='object'||Array.isArray(input))fail('RUNNER_JSON_INVALID',400);
  const n=time(clock);if(new URL(request.url).pathname==='/runner/data')return await dataPage(e,input,n);
  if(new URL(request.url).pathname==='/runner/finalize')return await finalizeRoute(e,input);
  if(new URL(request.url).pathname==='/runner/claim'){
   only(input,['runner']);if(!uid(input.runner))fail('RUNNER_ID_INVALID',400);
   const date=day(n),read=await batch(e,[q(e,identitySQL,date),q(e,CLAIM_PERMIT_SQL,PRODUCTION_PAGE,date,n,n,n)]) as {results:Row[]}[];
   const state=read[0]?.results[0];if(!state||state.database_id!==e.PRODUCTION_DATABASE_ID||state.migrations!==16||state.runner_schema!==1)fail('RUNNER_SCHEMA_INVALID');
   return await claim(e,input,n,state,read[1]?.results[0]);
  }
  const state=await first(e,identitySQL,day(n));if(!state||state.database_id!==e.PRODUCTION_DATABASE_ID||state.migrations!==16||state.runner_schema!==1)fail('RUNNER_SCHEMA_INVALID');
  return await route(request,e,input,n,state);
 }catch(error){reportError(error);return answer({error:error instanceof ProtocolError?error.message:'RUNNER_OPERATION_FAILED'},error instanceof ProtocolError?error.status:500);}
}
