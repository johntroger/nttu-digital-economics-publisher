import type {CloudBindings,Statement} from './runtime.ts';
import type {Candidate,ContentContext} from '../domain/content.ts';
import {eligibility,chooseReserve,stock,normalizedBody} from '../domain/content.ts';
import {businessDate,scheduledInstant,POLICY} from '../domain/policy.ts';
import {composeCaption,FOOTER_VERSION} from '../domain/footer.ts';

type Value=string|number|null;
interface Config {identity:string;target:string;start_date:string|null;paused:number;maintenance:number;blocked:string|null;active_job:string|null;revision:number}
interface Job {id:string;day:string;post:string;snapshot:string;caption:string;checksum:string;config_revision:number;state:string;tries:number;next_at:number|null;lease_until:number}
export type SimulatedOutcome = {kind:'confirmed';remoteId:string;confirmedAt:number}|{kind:'retryable'|'policy'|'global'|'unknown'};
export interface SimulatedRequest {attemptId:string;target:string;caption:string;checksum:string;postId:string;ordinal:number}
// No network transport: cannot turn this test adapter into a Meta publisher.
export class FakeCloudPublisher {
  readonly calls:SimulatedRequest[]=[];
  private readonly result:(request:SimulatedRequest)=>Promise<SimulatedOutcome>;
  constructor(result:(request:SimulatedRequest)=>Promise<SimulatedOutcome>){this.result=result;}
  async send(request:SimulatedRequest):Promise<SimulatedOutcome>{
    if(!request.target.startsWith('fixture:'))throw new Error('REAL_DESTINATION_FORBIDDEN');
    this.calls.push(structuredClone(request));return this.result(request);
  }
}
function stmt(env:CloudBindings,sql:string,...args:Value[]):Statement{return env.DB!.prepare(sql).bind(...args);}
async function all<T>(env:CloudBindings,sql:string,...args:Value[]):Promise<T[]>{const s=stmt(env,sql,...args);if(!s.all)throw new Error('D1_ALL_REQUIRED');return (await s.all<T>()).results;}
async function one<T>(env:CloudBindings,sql:string,...args:Value[]):Promise<T|null>{return stmt(env,sql,...args).first<T>();}
async function batch(env:CloudBindings,statements:Statement[]){if(!env.DB?.batch)throw new Error('D1_ATOMIC_BATCH_REQUIRED');await env.DB.batch(statements);}
function instant(clock:()=>number){const n=clock();if(!Number.isSafeInteger(n)||n<0)throw new Error('INVALID_CLOCK');return n;}
const date=(n:number)=>businessDate(new Date(n));
async function isolated(env:CloudBindings,adapter:FakeCloudPublisher){
  if(env.APP_ENV!=='test'||env.INTEGRATION_MODE!=='fake'||!(adapter instanceof FakeCloudPublisher)||!env.DB?.batch)throw new Error('ISOLATED_D1_SIMULATION_REQUIRED');
  const config=await one<Config>(env,'SELECT * FROM fixture_flow_config WHERE id=1');
  if(!config||config.identity!=='isolated-d1-fixture'||!config.target.startsWith('fixture:'))throw new Error('REAL_DESTINATION_FORBIDDEN');
  return config;
}
async function catalog(env:CloudBindings){return (await all<{payload:string}>(env,'SELECT payload FROM fixture_flow_posts ORDER BY id')).map(r=>JSON.parse(r.payload) as Candidate);}
async function context(env:CloudBindings,now:number,ownPost?:string):Promise<ContentContext>{
  const usage=await all<{post:string;body:string;angle:string}>(env,'SELECT post,body,angle FROM fixture_flow_usage ORDER BY confirmed_at DESC');
  const active=await all<{post:string}>(env,"SELECT post FROM fixture_flow_jobs WHERE state IN ('held','requested','retry_wait','unknown')");
  return {now:new Date(now).toISOString(),footerVersion:FOOTER_VERSION,cohort:2026,usedPostIds:new Set(usage.map(r=>r.post)),publishedPostIds:new Set(usage.map(r=>r.post)),heldPostIds:new Set(active.filter(r=>r.post!==ownPost).map(r=>r.post)),publishedBodies:new Set(usage.map(r=>r.body)),recentAngles:new Set(usage.slice(0,10).map(r=>r.angle))};
}
function notification(env:CloudBindings,id:string,kind:string,detail:Record<string,unknown>={},where='1',args:Value[]=[]){
  return stmt(env,`INSERT INTO fixture_flow_outbox(event_id,payload_json) SELECT ?,? WHERE ${where} ON CONFLICT DO NOTHING`,id,JSON.stringify({kind,environment:'staging',simulation:true,...detail}),...args);
}
async function stockAlert(env:CloudBindings,now:number){
  const inventory=stock(await catalog(env),await context(env,now));
  const level=inventory.eligible_distinct_post_count===0?'empty':inventory.low_stock?'low':'normal';
  const old=await one<{level:string;episode:number}>(env,'SELECT * FROM fixture_flow_stock WHERE id=1');
  if(old?.level===level)return inventory;
  const episode=(old?.episode??0)+1;
  // A race can only emit one transition: the outbox insert is fenced by old episode.
  const statements=[stmt(env,`INSERT INTO fixture_flow_stock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET level=excluded.level,episode=excluded.episode WHERE fixture_flow_stock.episode=?`,level,episode,old?.episode??0)];
  if(level!=='normal')statements.push(stmt(env,`INSERT INTO fixture_flow_outbox SELECT ?,? WHERE EXISTS(SELECT 1 FROM fixture_flow_stock WHERE id=1 AND level=? AND episode=?) ON CONFLICT DO NOTHING`,`stock:${episode}:${level}`,JSON.stringify({kind:level==='empty'?'stock_empty':'stock_low',environment:'staging',simulation:true,eligibleCount:inventory.eligible_distinct_post_count,coverageDays:inventory.coverage_days}),level,episode));
  await batch(env,statements);return inventory;
}
async function abandon(env:CloudBindings,job:Job,state:'failed'|'cancelled',reason:string){
  await batch(env,[stmt(env,`UPDATE fixture_flow_jobs SET state=?,next_at=NULL WHERE id=? AND state IN ('held','retry_wait') AND EXISTS(SELECT 1 FROM fixture_flow_config WHERE active_job=?)`,state,job.id,job.id),
    ...(state==='failed'?[stmt(env,"UPDATE fixture_flow_posts SET payload=json_set(payload,'$.status','needs_review'),revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state='failed')",job.post,job.id)]:[]),
    notification(env,'failed:'+job.id,'post_failed',{reason},'EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state=?)',[job.id,state]),stmt(env,`UPDATE fixture_flow_config SET active_job=NULL WHERE active_job=? AND EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state=?)`,job.id,job.id,state)]);
}
async function receipt(env:CloudBindings,job:Job,attempt:string,result:SimulatedOutcome,now:number,observed=now){
  const owned=`EXISTS(SELECT 1 FROM fixture_flow_config WHERE id=1 AND active_job=?) AND EXISTS(SELECT 1 FROM fixture_flow_attempts WHERE id=? AND state IN ('intent','unknown'))`;
  const args=[job.id,attempt];
  if(result.kind==='confirmed'){
    if(!/^fixture:[a-zA-Z0-9:_-]{1,150}$/.test(result.remoteId)||!Number.isSafeInteger(result.confirmedAt)||result.confirmedAt<now||result.confirmedAt>observed)return receipt(env,job,attempt,{kind:'unknown'},now);
    const actual=date(result.confirmedAt),snapshot=JSON.parse(job.snapshot) as Candidate;
    await batch(env,[
      stmt(env,`INSERT INTO fixture_flow_usage SELECT ?,?,?,?,?,?,? WHERE ${owned}`,actual,job.post,job.id,result.remoteId,result.confirmedAt,normalizedBody(snapshot.body),snapshot.angle,...args),
      stmt(env,`UPDATE fixture_flow_jobs SET state='confirmed',next_at=NULL WHERE id=? AND ${owned}`,job.id,...args),
      stmt(env,`UPDATE fixture_flow_attempts SET state='confirmed',remote_id=?,confirmed_at=? WHERE id=? AND ${owned}`,result.remoteId,result.confirmedAt,attempt,...args),
      stmt(env,"UPDATE fixture_flow_slots SET state='confirmed' WHERE day IN (?,?) AND EXISTS(SELECT 1 FROM fixture_flow_usage WHERE job=?)",job.day,actual,job.id),
      notification(env,'published:'+job.id,'published',{title:snapshot.body.slice(0,120),simulation:true},'EXISTS(SELECT 1 FROM fixture_flow_usage WHERE job=?)',[job.id]),
      stmt(env,"UPDATE fixture_flow_config SET active_job=NULL WHERE active_job=? AND EXISTS(SELECT 1 FROM fixture_flow_usage WHERE job=?)",job.id,job.id),
    ]);return;
  }
  const retry=result.kind==='retryable'&&job.tries<POLICY.maxPublishAttempts;
  const state=retry?'retry_wait':result.kind==='unknown'?'unknown':'failed';
  await batch(env,[stmt(env,`UPDATE fixture_flow_jobs SET state=?,next_at=? WHERE id=? AND ${owned}`,state,retry?observed+300000:null,job.id,...args),
    stmt(env,`UPDATE fixture_flow_attempts SET state=? WHERE id=? AND ${owned}`,result.kind,attempt,...args),
    ...(state==='unknown'?[notification(env,'unknown:'+job.id,'needs_reconciliation',{},"EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state='unknown')",[job.id])]:state==='failed'?[notification(env,'failed:'+job.id,'post_failed',{},"EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state='failed')",[job.id])]:[]),
    ...(state==='failed'&&result.kind!=='global'?[stmt(env,"UPDATE fixture_flow_posts SET payload=json_set(payload,'$.status','needs_review'),revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state='failed')",job.post,job.id)]:[]),
    ...(result.kind==='global'?[stmt(env,"UPDATE fixture_flow_config SET blocked='connection_error' WHERE active_job=?",job.id),notification(env,'global:'+job.id,'connection_error')]:[]),
    ...(state==='failed'?[stmt(env,"UPDATE fixture_flow_config SET active_job=NULL WHERE active_job=? AND EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=? AND state='failed')",job.id,job.id)]:[]),
  ]);
}

export async function runCloudSimulation(env:CloudBindings,input:{publisher:FakeCloudPublisher;now:()=>number;budget?:number}){
  let config=await isolated(env,input.publisher),sends=0;
  const budget=input.budget??16;if(!Number.isSafeInteger(budget)||budget<1||budget>100)throw new Error('INVALID_BUDGET');
  for(let round=0;round<budget;round++){
    config=await isolated(env,input.publisher);const now=instant(input.now),today=date(now);
    if(config.maintenance)return {status:'maintenance',sends};
    if(config.active_job){
      const active=await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',config.active_job);if(!active)throw new Error('BROKEN_PAGE_GATE');
      if(active.state==='unknown')return {status:'reconciliation_required',sends};
      if(active.state==='requested'){
        if(active.lease_until<=now)await batch(env,[stmt(env,"UPDATE fixture_flow_jobs SET state='unknown' WHERE id=? AND state='requested' AND lease_until<=?",active.id,now),stmt(env,"UPDATE fixture_flow_attempts SET state='unknown' WHERE job=? AND state='intent'",active.id),notification(env,'unknown:'+active.id,'needs_reconciliation')]);
        return {status:active.lease_until<=now?'reconciliation_required':'in_flight',sends};
      }
      if(active.day!==today){await abandon(env,active,active.state==='held'?'cancelled':'failed','previous_day_ended');continue;}
      if(active.state==='held'&&active.lease_until<=now){await abandon(env,active,'cancelled','claim_expired_without_intent');continue;}
    }
    if(config.paused)return {status:'paused',sends};
    if(config.blocked)return {status:config.blocked,sends};
    if(!config.start_date)return {status:'schedule_unconfigured',sends};
    scheduledInstant(config.start_date);if(today<config.start_date)return {status:'before_start',sends};
    if(now<scheduledInstant(today).getTime())return {status:'before_publish_time',sends};
    if(await one(env,'SELECT 1 FROM fixture_flow_usage WHERE day=?',today))return {status:'day_complete',sends};
    await stmt(env,"UPDATE fixture_flow_slots SET state='expired' WHERE day<? AND state='open' AND NOT EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE fixture_flow_jobs.day=fixture_flow_slots.day AND state IN ('requested','unknown','retry_wait','held'))",today).run();
    // Expired planned items become reserve through projection; no implicit content creation.
    const posts=await catalog(env),past=await all<{planned:string|null}>(env,"SELECT planned FROM fixture_flow_slots WHERE state='expired'");
    const projected=posts.map(p=>past.some(s=>s.planned===p.postId)?{...p,pool:'reserve' as const}:p);
    const scheduled=posts.filter(p=>p.pool==='scheduled').sort((a,b)=>a.order-b.order||a.postId.localeCompare(b.postId));
    const index=Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(config.start_date+'T00:00:00Z'))/86400000);
    await stmt(env,"INSERT INTO fixture_flow_slots(day,planned) VALUES (?,?) ON CONFLICT DO NOTHING",today,scheduled[index]?.postId??null).run();
    const slot=await one<{planned:string|null;state:string}>(env,'SELECT * FROM fixture_flow_slots WHERE day=?',today);
    if(slot?.state!=='open')return {status:'slot_closed',sends};
    let job=config.active_job?await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',config.active_job):null;
    if(job?.state==='retry_wait'&&job.next_at!==null&&job.next_at>now)return {status:'retry_wait',sends,nextAt:job.next_at};
    if(!job){
      const failures=await all<{post:string}>(env,"SELECT post FROM fixture_flow_jobs WHERE day=? AND state='failed' ORDER BY created_at DESC,id DESC",today);
      const excluded=new Set(failures.map(j=>j.post));
      const planned=projected.find(p=>p.postId===slot.planned),ctx=await context(env,now);
      const failed=projected.find(p=>p.postId===failures[0]?.post)??planned??projected[0];
      const candidate=planned&&!excluded.has(planned.postId)&&!eligibility(planned,ctx).length?planned:failed?chooseReserve(projected,failed,ctx,excluded):null;
      if(!candidate){const inventory=await stockAlert(env,now);if(inventory.eligible_distinct_post_count===0)await stmt(env,"UPDATE fixture_flow_config SET blocked='stock_empty' WHERE active_job IS NULL AND blocked IS NULL").run();else await stmt(env,'INSERT INTO fixture_flow_outbox VALUES (?,?) ON CONFLICT DO NOTHING','reserve:'+today,JSON.stringify({kind:'reserve_empty',environment:'staging',simulation:true})).run();return {status:inventory.eligible_distinct_post_count===0?'stock_empty':'reserve_empty',sends};}
      const id='fixture-job:'+crypto.randomUUID(),snapshot=JSON.stringify(posts.find(p=>p.postId===candidate.postId)!);
      await batch(env,[stmt(env,`INSERT INTO fixture_flow_jobs(id,day,post,snapshot,caption,checksum,config_revision,state,lease_until,created_at)
        SELECT ?,?,?,?,?,?,?,'held',?,? WHERE EXISTS(SELECT 1 FROM fixture_flow_config WHERE id=1 AND active_job IS NULL AND paused=0 AND maintenance=0 AND blocked IS NULL AND revision=?)
        AND EXISTS(SELECT 1 FROM fixture_flow_slots WHERE day=? AND state='open') AND NOT EXISTS(SELECT 1 FROM fixture_flow_usage WHERE day=? OR post=?)`,id,today,candidate.postId,snapshot,composeCaption(candidate.body),candidate.asset!.checksum,config.revision,now+60000,now,config.revision,today,today,candidate.postId),
        stmt(env,"UPDATE fixture_flow_config SET active_job=? WHERE id=1 AND active_job IS NULL AND EXISTS(SELECT 1 FROM fixture_flow_jobs WHERE id=?)",id,id)]);
      job=await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',id);if(!job)return {status:'claim_lost',sends};
    }
    const sendTime=instant(input.now);if(date(sendTime)!==job.day){await abandon(env,job,'cancelled','day_changed_before_intent');continue;}
    const current=posts.find(p=>p.postId===job!.post),snapshot=JSON.parse(job.snapshot) as Candidate;
    if(!current||JSON.stringify(current)!==job.snapshot||eligibility(current,await context(env,sendTime,job.post)).length){await abandon(env,job,'failed','snapshot_no_longer_eligible');continue;}
    const attempt='fixture-attempt:'+crypto.randomUUID();
    await batch(env,[stmt(env,`INSERT INTO fixture_flow_attempts SELECT ?,id,tries+1,'intent',?,NULL,NULL FROM fixture_flow_jobs
      WHERE id=? AND state IN ('held','retry_wait') AND tries<3 AND (next_at IS NULL OR next_at<=?)
      AND EXISTS(SELECT 1 FROM fixture_flow_config WHERE active_job=? AND paused=0 AND maintenance=0 AND blocked IS NULL AND revision=?)`,attempt,sendTime,job.id,sendTime,job.id,job.config_revision),
      stmt(env,"UPDATE fixture_flow_jobs SET state='requested',tries=tries+1,next_at=NULL,lease_until=? WHERE id=? AND EXISTS(SELECT 1 FROM fixture_flow_attempts WHERE id=?)",sendTime+60000,job.id,attempt)]);
    if(!await one(env,'SELECT 1 FROM fixture_flow_attempts WHERE id=?',attempt)){if(config.revision!==job.config_revision)await abandon(env,job,'failed','configuration_changed');return {status:'intent_blocked',sends};}
    job={...job,tries:job.tries+1,state:'requested'};
    // Crossing midnight after intent is conservative unknown, never a second send.
    if(date(instant(input.now))!==job.day){await receipt(env,job,attempt,{kind:'unknown'},sendTime);return {status:'reconciliation_required',sends};}
    let result:SimulatedOutcome;try{result=await input.publisher.send({attemptId:attempt,target:config.target,postId:job.post,caption:job.caption,checksum:job.checksum,ordinal:job.tries});}catch{result={kind:'unknown'};}
    sends++;
    if(!result||!['confirmed','retryable','policy','global','unknown'].includes(result.kind))result={kind:'unknown'};
    await receipt(env,job,attempt,result,sendTime,instant(input.now));
    if(result.kind==='confirmed'){const final=await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',job.id);if(final?.state!=='confirmed')return {status:'reconciliation_required',sends};await stockAlert(env,instant(input.now));return {status:'confirmed',sends};}
    if(result.kind==='unknown')return {status:'reconciliation_required',sends};
    if(result.kind==='global')return {status:'connection_error',sends};
    if(result.kind==='retryable'&&job.tries<3){const next=await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',job.id);return {status:'retry_wait',sends,nextAt:next?.next_at};}
  }
  return {status:'budget_exhausted',sends};
}

export async function reconcileCloudSimulation(env:CloudBindings,publisher:FakeCloudPublisher,attemptId:string,result:SimulatedOutcome,now:number){
  await isolated(env,publisher);if(!Number.isSafeInteger(now)||now<0)throw new Error('INVALID_CLOCK');
  const attempt=await one<{job:string;state:string;created_at:number}>(env,'SELECT * FROM fixture_flow_attempts WHERE id=?',attemptId);
  if(!attempt)throw new Error('ATTEMPT_NOT_FOUND');if(attempt.state==='confirmed')return {replayed:true};
  const job=await one<Job>(env,'SELECT * FROM fixture_flow_jobs WHERE id=?',attempt.job);
  if(!job||job.state!=='unknown'||attempt.state!=='unknown')throw new Error('UNKNOWN_REQUIRED');
  if(now<attempt.created_at)throw new Error('INVALID_CLOCK');
  await receipt(env,job,attemptId,result,attempt.created_at,now);return {replayed:false};
}

export async function resumeCloudSimulation(env:CloudBindings,publisher:FakeCloudPublisher,now:()=>number=Date.now){
  const config=await isolated(env,publisher);if(config.blocked!=='stock_empty')throw new Error('STOCK_EMPTY_BLOCK_REQUIRED');
  const inventory=stock(await catalog(env),await context(env,instant(now)));if(!inventory.eligible_distinct_post_count)throw new Error('STOCK_STILL_EMPTY');
  await stmt(env,"UPDATE fixture_flow_config SET blocked=NULL WHERE id=1 AND blocked='stock_empty' AND revision=?",config.revision).run();
}
