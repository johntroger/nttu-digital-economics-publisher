import type { TransactionDatabase } from '../storage/claims.ts';
import { claimJob,recordIntent,takeOwnership,markExpiredIntentUnknown,WorkflowError } from '../storage/claims.ts';
import { intakeEvidence,finalizeEvidence } from '../storage/evidence.ts';
import { readCatalog,readContext } from '../storage/catalog.ts';
import { eligibility,stock,chooseReserve } from '../domain/content.ts';
import type {Group,Audience} from '../domain/content.ts';
import { FOOTER_VERSION } from '../domain/footer.ts';
import { businessDate,scheduledInstant } from '../domain/policy.ts';
import { FakePublisher } from './fake-adapter.ts';

type Params=string|number|null;
function one<T>(db:TransactionDatabase,sql:string,...p:Params[]):T|undefined{return db.all<T>(sql,...p)[0];}
function fail(code:string):never{throw new WorkflowError(code);}
function clock(now:()=>string):string {
  const value=now(),ms=Date.parse(value);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z'))fail('INVALID_TIME');
  return value;
}
function isolated(db:TransactionDatabase,page:string):string {
  if(one<{enabled:number}>(db,'SELECT enabled FROM simulation_settings WHERE id=1')?.enabled!==1)fail('LOCAL_SIMULATION_REQUIRED');
  if(one(db,"SELECT 1 FROM page_connections WHERE page_id NOT LIKE 'fixture:%'"))fail('REAL_DESTINATION_FORBIDDEN');
  const p=one<{environment:string}>(db,'SELECT environment FROM page_connections WHERE id=?',page);if(!p)fail('UNKNOWN_PAGE');
  if(p.environment!=='production')fail('SIMULATION_REQUIRES_PRODUCTION_FIXTURE');return p.environment;
}
export function enableSimulation(db:TransactionDatabase) {
  db.immediate(()=>{
    if(one(db,"SELECT 1 FROM page_connections WHERE page_id NOT LIKE 'fixture:%'"))fail('REAL_DESTINATION_FORBIDDEN');
    if(one(db,'SELECT 1 FROM publish_jobs')||one(db,'SELECT 1 FROM publications'))fail('SIMULATION_MUST_START_EMPTY');
    db.run('UPDATE simulation_settings SET enabled=1 WHERE id=1');
  });
}
export function configureSimulationSchedule(db:TransactionDatabase,input:{page:string;startDate:string}) {
  scheduledInstant(input.startDate);isolated(db,input.page);
  db.immediate(()=>{
    const previous=one<{start_date:string}>(db,'SELECT start_date FROM simulation_schedules WHERE page_connection_id=?',input.page);
    if(previous&&previous.start_date!==input.startDate)fail('SCHEDULE_ALREADY_CONFIGURED');
    db.run('INSERT INTO simulation_schedules VALUES (?,?) ON CONFLICT DO NOTHING',input.page,input.startDate);
    const posts=readCatalog(db).filter(p=>p.pool==='scheduled').sort((a,b)=>a.order-b.order||(a.postId<b.postId?-1:1));
    for(const [index,post] of posts.entries()) {
      const date=new Date(Date.parse(`${input.startDate}T00:00:00Z`)+index*86_400_000).toISOString().slice(0,10);
      db.run("INSERT INTO schedule_slots(id,page_connection_id,business_date,planned_post_id) VALUES (?,?,?,?) ON CONFLICT(page_connection_id,business_date) DO NOTHING",`slot:${input.page}:${date}`,input.page,date,post.postId);
    }
  });
}
function audit(db:TransactionDatabase,environment:string,job:string|null,now:string,previous:string,next:string,reason:string) {
  db.run("INSERT INTO operation_events(environment,job_id,action,actor,occurred_at,previous_state,new_state,reason) VALUES (?,?,'local_tick','local-runner',?,?,?,?)",environment,job,now,previous,next,reason);
}
function expireUnsent(db:TransactionDatabase,page:string,environment:string,now:string) {
  db.immediate(()=>{
    const today=businessDate(new Date(now));
    const slots=db.all<{id:string;planned_post_id:string|null;status:string}>('SELECT id,planned_post_id,status FROM schedule_slots WHERE page_connection_id=? AND business_date<? AND status NOT IN (\'confirmed\',\'expired\',\'skipped\',\'replaced_by_late_publication\')',page,today);
    for(const s of slots) {
      const active=db.all<{id:string;state:string;attempt_count:number;post_version_id:string}>("SELECT * FROM publish_jobs WHERE slot_id=? AND state IN ('held','publish_requested','evidence_pending','retry_wait','unknown')",s.id);
      if(active.some(j=>['publish_requested','evidence_pending','unknown'].includes(j.state)))continue;
      let safe=true;
      for(const j of active) {
        if(j.state==='held'&&one(db,'SELECT 1 FROM attempts WHERE job_id=?',j.id)){safe=false;break;}
        if(j.state==='retry_wait'&&!one(db,"SELECT 1 FROM attempts WHERE job_id=? AND ordinal=? AND outcome='verified_failed_retryable'",j.id,j.attempt_count)){safe=false;break;}
      }
      if(!safe)continue;
      for(const j of active){
        db.run('UPDATE publish_jobs SET state=?,next_attempt_at=NULL WHERE id=?',j.state==='held'?'cancelled':'failed',j.id);
        db.run('UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=?',page,j.id);
        if(j.state==='retry_wait'){
          db.run("UPDATE post_versions SET status='needs_review' WHERE id=?",j.post_version_id);
          db.run('INSERT INTO notification_outbox(event_id,payload_json) VALUES (?,?) ON CONFLICT DO NOTHING',`failed:${j.id}`,JSON.stringify({kind:'post_failed',environment,page,job:j.id,reason:'previous_day_ended'}));
        }
        audit(db,environment,j.id,now,j.state,j.state==='held'?'cancelled':'failed','previous_day_unsent');
      }
      db.run("UPDATE schedule_slots SET status='expired' WHERE id=?",s.id);
      audit(db,environment,null,now,s.status,'expired',`slot_expired:${s.id}`);
      if(s.planned_post_id)db.run("UPDATE posts SET pool='reserve' WHERE id=? AND NOT EXISTS(SELECT 1 FROM production_post_usage WHERE page_connection_id=? AND post_id=?)",s.planned_post_id,page,s.planned_post_id);
    }
  });
}
function alerts(db:TransactionDatabase,page:string,environment:string,now:string,emptyStop=false) {
  return db.immediate(()=>{
    const inventory=stock(readCatalog(db),readContext(db,page,now,FOOTER_VERSION));
    const level=inventory.eligible_distinct_post_count===0?'empty':inventory.low_stock?'low':'normal';
    const old=one<{level:string;episode:number}>(db,'SELECT * FROM stock_alert_state WHERE page_connection_id=?',page);
    const episode=(old?.episode??0)+(old?.level!==level?1:0);
    db.run('INSERT INTO stock_alert_state VALUES (?,?,?,?) ON CONFLICT(page_connection_id) DO UPDATE SET level=excluded.level,episode=excluded.episode,eligible_count=excluded.eligible_count',page,level,episode,inventory.eligible_distinct_post_count);
    if(level!=='normal'&&old?.level!==level)db.run('INSERT INTO notification_outbox(event_id,payload_json) VALUES (?,?) ON CONFLICT DO NOTHING',`stock:${page}:${episode}:${level}`,JSON.stringify({kind:level==='empty'?'stock_empty':'stock_low',environment,page,eligibleCount:inventory.eligible_distinct_post_count,coverageDays:inventory.coverage_days}));
    if(emptyStop){
      const s=one<{blocked_reasons:string}>(db,'SELECT blocked_reasons FROM application_state WHERE environment=?',environment)!;
      const blocks:unknown=JSON.parse(s.blocked_reasons);if(!Array.isArray(blocks)||blocks.some(v=>typeof v!=='string'))fail('INVALID_BARRIER');
      const reason=`stock_empty:${page}`;
      if(!blocks.includes(reason)){db.run('UPDATE application_state SET blocked_reasons=? WHERE environment=?',JSON.stringify([...blocks,reason]),environment);audit(db,environment,null,now,'running','stock_empty','refill_requires_explicit_resume');}
    }
    return inventory;
  });
}
export function resumeSimulationAfterRefill(db:TransactionDatabase,input:{page:string;now:string}) {
  const env=isolated(db,input.page);
  db.immediate(()=>{
    const inventory=stock(readCatalog(db),readContext(db,input.page,input.now,FOOTER_VERSION));if(!inventory.eligible_distinct_post_count)fail('STOCK_STILL_EMPTY');
    const s=one<{blocked_reasons:string}>(db,'SELECT blocked_reasons FROM application_state WHERE environment=?',env)!;
    const blocks:unknown=JSON.parse(s.blocked_reasons);if(!Array.isArray(blocks)||blocks.some(v=>typeof v!=='string'))fail('INVALID_BARRIER');
    db.run('UPDATE application_state SET blocked_reasons=? WHERE environment=?',JSON.stringify(blocks.filter(v=>v!==`stock_empty:${input.page}`)),env);
    audit(db,env,null,input.now,'stock_empty','refilled','explicit_resume_keeps_other_controls');
  });
}
export async function runLocalTick(db:TransactionDatabase,publisher:FakePublisher,input:{page:string;now:()=>string;id:()=>string;budget?:number}) {
  const env=isolated(db,input.page);if(!(publisher instanceof FakePublisher)||publisher.mode!=='local_fake')fail('FAKE_ADAPTER_REQUIRED');
  const budget=input.budget??16;if(!Number.isInteger(budget)||budget<1||budget>100)fail('INVALID_BUDGET');
  let sends=0;
  for(let work=0;work<budget;work++) {
    let now=clock(input.now);
    const due=db.all<{id:string}>(`SELECT e.id FROM publish_evidence e JOIN attempts a ON a.id=e.attempt_id JOIN publish_jobs j ON j.id=a.job_id
      WHERE j.page_connection_id=? AND e.state='pending' AND (e.next_at IS NULL OR julianday(e.next_at)<=julianday(?)) ORDER BY e.observed_at,e.id LIMIT 20`,input.page,now);
    for(const e of due){try{finalizeEvidence(db,{id:e.id,actor:'local-runner',now:clock(input.now)});}catch{return {status:'finalization_wait',sends};}}
    if(one(db,`SELECT 1 FROM publish_evidence e JOIN attempts a ON a.id=e.attempt_id JOIN publish_jobs j ON j.id=a.job_id WHERE j.page_connection_id=? AND e.state='pending'`,input.page))return {status:'evidence_pending',sends};
    if(one<{maintenance_owner:string|null}>(db,'SELECT maintenance_owner FROM application_state WHERE environment=?',env)?.maintenance_owner!==null)return {status:'maintenance',sends};
    now=clock(input.now);
    const interrupted=db.all<{id:string;lease_until:string|null}>("SELECT id,lease_until FROM publish_jobs WHERE page_connection_id=? AND state='publish_requested'",input.page);
    for(const j of interrupted)if(j.lease_until&&Date.parse(j.lease_until)<=Date.parse(now)){
      markExpiredIntentUnknown(db,{jobId:j.id,actor:'local-runner',now});
      const ordinal=one<{attempt_count:number}>(db,'SELECT attempt_count FROM publish_jobs WHERE id=?',j.id)!.attempt_count;
      db.run('INSERT INTO notification_outbox(event_id,payload_json) VALUES (?,?) ON CONFLICT DO NOTHING',`unknown:${j.id}:${ordinal}`,JSON.stringify({kind:'needs_reconciliation',environment:env,page:input.page,job:j.id}));
    }
    if(one(db,"SELECT 1 FROM publish_jobs WHERE page_connection_id=? AND state IN ('publish_requested','evidence_pending','unknown')",input.page))return {status:'reconciliation_required',sends};
    expireUnsent(db,input.page,env,now);
    const inventory=alerts(db,input.page,env,now);
    const controls=one<{paused_by_user:number;blocked_reasons:string;maintenance_owner:string|null}>(db,'SELECT * FROM application_state WHERE environment=?',env)!;
    if(controls.paused_by_user)return {status:'paused',sends};
    if(controls.maintenance_owner!==null)return {status:'maintenance',sends};
    const blocks:unknown=JSON.parse(controls.blocked_reasons);if(!Array.isArray(blocks)||blocks.length)return {status:'blocked',sends};
    const schedule=one<{start_date:string}>(db,'SELECT start_date FROM simulation_schedules WHERE page_connection_id=?',input.page);
    const date=businessDate(new Date(now));if(!schedule||date<schedule.start_date)return {status:'schedule_not_started',sends};
    if(Date.parse(now)<scheduledInstant(date).getTime())return {status:'not_due',sends};
    if(one(db,'SELECT 1 FROM actual_day_guards WHERE page_connection_id=? AND business_date=?',input.page,date))return {status:'day_complete',sends};
    db.immediate(()=>db.run('INSERT INTO schedule_slots(id,page_connection_id,business_date) VALUES (?,?,?) ON CONFLICT(page_connection_id,business_date) DO NOTHING',`slot:${input.page}:${date}`,input.page,date));
    const slot=one<{id:string;status:string;planned_post_id:string|null}>(db,'SELECT * FROM schedule_slots WHERE page_connection_id=? AND business_date=?',input.page,date)!;
    if(['confirmed','skipped','expired','replaced_by_late_publication'].includes(slot.status))return {status:'slot_closed',sends};
    const held=one<{id:string;state:string;next_attempt_at:string|null}>(db,"SELECT id,state,next_attempt_at FROM publish_jobs WHERE slot_id=? AND state IN ('held','retry_wait')",slot.id);
    let ownerToken:string,generation:number,jobId:string;
    if(held){
      if(held.state==='retry_wait'&&held.next_attempt_at&&Date.parse(held.next_attempt_at)>Date.parse(now))return {status:'retry_wait',sends,nextAt:held.next_attempt_at};
      ownerToken=`owner:${input.id()}`;
      try{const taken=takeOwnership(db,{jobId:held.id,token:ownerToken,actor:'local-runner',now:clock(input.now)});generation=taken.generation;jobId=taken.jobId;}
      catch(error){return {status:error instanceof WorkflowError?error.code:'ownership_wait',sends};}
    }else{
      const posts=readCatalog(db),context=readContext(db,input.page,now,FOOTER_VERSION);
      const root=posts.find(p=>p.postId===slot.planned_post_id);
      const failed=one<{topic_group:Group;primary_audience:Audience}>(db,`SELECT p.topic_group,v.primary_audience FROM publish_jobs j JOIN post_versions v ON v.id=j.post_version_id JOIN posts p ON p.id=v.post_id
        WHERE j.slot_id=? AND j.state IN ('failed','quarantined') ORDER BY j.rowid DESC LIMIT 1`,slot.id);
      let candidate=!failed&&root&&eligibility(root,context).length===0?root:null;
      if(!candidate){
        const preference=failed?{group:failed.topic_group,audience:failed.primary_audience}:root;
        candidate=preference?chooseReserve(posts,preference,context):posts.filter(p=>p.pool==='reserve'&&eligibility(p,context).length===0).sort((a,b)=>a.order-b.order||(a.postId<b.postId?-1:1))[0]??null;
      }
      if(!candidate){
        if(inventory.eligible_distinct_post_count===0)alerts(db,input.page,env,now,true);
        return {status:inventory.eligible_distinct_post_count===0?'stock_empty':'no_eligible_reserve',sends};
      }
      jobId=`job:${input.id()}`;ownerToken=`owner:${input.id()}`;
      try{const claim=claimJob(db,{id:jobId,page:input.page,postId:candidate.postId,expectedVersion:candidate.versionId,slotId:slot.id,requestId:null,token:ownerToken,actor:'local-runner',now:clock(input.now)});generation=claim.generation;}
      catch(error){return {status:error instanceof WorkflowError?error.code:'claim_wait',sends};}
    }
    let permit;
    try{permit=recordIntent(db,{jobId,token:ownerToken,generation,actor:'local-runner',now:clock(input.now),attemptId:`attempt:${input.id()}`});}
    catch(error){return {status:error instanceof WorkflowError?error.code:'intent_wait',sends};}
    // No SQL transaction crosses this asynchronous boundary.
    sends++;
    let observation;
    try{observation=await publisher.publish(permit,clock(input.now));}
    catch{observation={attemptId:permit.attemptId,page:input.page,outcome:'unknown' as const,remoteId:null,remotePublishedAt:null,remoteLink:null,failureKind:null,retryAt:null,observedAt:clock(input.now)};}
    const id=`evidence:${input.id()}`;
    try{intakeEvidence(db,{...observation,id,eventKey:`result:${permit.attemptId}`});finalizeEvidence(db,{id,actor:'local-runner',now:clock(input.now)});}
    catch{return {status:'evidence_recovery_required',sends};}
  }
  return {status:'budget_exhausted',sends};
}
