import type { TransactionDatabase } from './claims.ts';
import { WorkflowError } from './claims.ts';
import { businessDate, POLICY } from '../domain/policy.ts';

type Outcome = 'confirmed' | 'verified_failed_retryable' | 'verified_failed_final' | 'unknown';
type FailureKind = 'retryable' | 'final' | 'policy' | 'global';
export interface EvidenceInput {
  id: string; eventKey: string; attemptId: string; page: string; outcome: Outcome;
  remoteId: string | null; remotePublishedAt: string | null; remoteLink: string | null;
  failureKind: FailureKind | null; retryAt: string | null; observedAt: string;
}
type Details = Pick<EvidenceInput,'page'|'remotePublishedAt'|'remoteLink'|'failureKind'|'retryAt'>;
type Evidence = { id: string; attempt_id: string; outcome: Outcome; remote_id: string | null; observed_at: string;
  normalized_json: string; state: string; next_at: string | null };
type Job = { id: string; state: string; environment: string; page_connection_id: string; slot_id: string | null;
  post_version_id: string; post_id: string; attempt_count: number; caption_snapshot: string; asset_checksum: string; footer_version: string };
function fail(code: string): never { throw new WorkflowError(code); }
function time(value: string): number {
  const ms=Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z','Z')!==value.replace('.000Z','Z')) fail('INVALID_TIME');
  return ms;
}
function identity(...values: string[]) { if(values.some(v=>!v.trim()||v.length>200)) fail('INVALID_IDENTITY'); }
function one<T>(db: TransactionDatabase,sql: string,...p: (string|number|null)[]): T|undefined { return db.all<T>(sql,...p)[0]; }
function jobFor(db: TransactionDatabase,attempt: string): Job {
  const j=one<Job>(db,`SELECT j.*,p.environment,v.post_id FROM attempts a JOIN publish_jobs j ON j.id=a.job_id
    JOIN page_connections p ON p.id=j.page_connection_id JOIN post_versions v ON v.id=j.post_version_id WHERE a.id=?`,attempt);
  if(!j) fail('UNKNOWN_ATTEMPT'); return j;
}
function details(input: EvidenceInput): Details {
  return {page:input.page,remotePublishedAt:input.remotePublishedAt,remoteLink:input.remoteLink,failureKind:input.failureKind,retryAt:input.retryAt};
}
export function intakeEvidence(db: TransactionDatabase,input: EvidenceInput) {
  identity(input.id,input.eventKey,input.attemptId,input.page); time(input.observedAt);
  if(!['confirmed','verified_failed_retryable','verified_failed_final','unknown'].includes(input.outcome)) fail('INVALID_OUTCOME');
  if(input.remotePublishedAt!==null && time(input.remotePublishedAt)>time(input.observedAt)) fail('REMOTE_TIME_IN_FUTURE');
  if(input.retryAt!==null) time(input.retryAt);
  if(input.remoteId!==null) identity(input.remoteId);
  if(input.remoteLink!==null && (!input.remoteLink.startsWith('https://') || input.remoteLink.length>2000)) fail('INVALID_REMOTE_LINK');
  if(input.outcome==='confirmed' && (!input.remoteId || input.failureKind!==null || input.retryAt!==null)) fail('INVALID_CONFIRMATION');
  if(input.outcome==='verified_failed_retryable' && !['retryable','global'].includes(input.failureKind??'')) fail('INVALID_FAILURE_KIND');
  if(input.outcome==='verified_failed_final' && !['final','policy','global'].includes(input.failureKind??'')) fail('INVALID_FAILURE_KIND');
  if(input.outcome.startsWith('verified_failed') && (input.remoteId!==null || input.remotePublishedAt!==null || input.remoteLink!==null)) fail('FAILURE_HAS_REMOTE_PUBLICATION');
  if(input.outcome==='unknown' && (input.failureKind!==null || input.retryAt!==null)) fail('INVALID_UNKNOWN');
  const normalized=JSON.stringify(details(input));
  // Separate transaction: subsequent finalizer rollback cannot remove this observation.
  return db.immediate(()=>{
    const j=jobFor(db,input.attemptId); if(j.page_connection_id!==input.page) fail('EVIDENCE_PAGE_MISMATCH');
    const a=one<{intent_at:string}>(db,'SELECT intent_at FROM attempts WHERE id=?',input.attemptId)!;
    if(time(input.observedAt)<time(a.intent_at)) fail('EVIDENCE_BEFORE_INTENT');
    // Remote creation timestamps may be rounded to whole seconds.
    if(input.remotePublishedAt!==null && time(input.remotePublishedAt)<Math.floor(time(a.intent_at)/1000)*1000) fail('REMOTE_PUBLICATION_BEFORE_INTENT');
    const previous=one<Evidence>(db,'SELECT * FROM publish_evidence WHERE event_key=?',input.eventKey);
    if(previous) {
      if(previous.attempt_id!==input.attemptId || previous.outcome!==input.outcome || previous.remote_id!==input.remoteId
        || previous.observed_at!==input.observedAt || previous.normalized_json!==normalized) fail('EVIDENCE_EVENT_CONFLICT');
      return {id:previous.id,duplicate:true};
    }
    db.run(`INSERT INTO publish_evidence(id,attempt_id,event_key,outcome,remote_id,observed_at,normalized_json) VALUES (?,?,?,?,?,?,?)`,
      input.id,input.attemptId,input.eventKey,input.outcome,input.remoteId,input.observedAt,normalized);
    // Do not regress a newer attempt or an already confirmed job on late intake.
    const updated=db.run(`UPDATE publish_jobs SET state='evidence_pending' WHERE id=? AND state IN ('publish_requested','unknown')
      AND attempt_count=(SELECT ordinal FROM attempts WHERE id=?)`,j.id,input.attemptId);
    if(updated) audit(db,j,'evidence-adapter',input.observedAt,'evidence_pending','intake_committed','intake_evidence');
    return {id:input.id,duplicate:false};
  });
}
function notify(db: TransactionDatabase,event: string,publication: string|null,payload: object) {
  db.run('INSERT INTO notification_outbox(event_id,publication_id,payload_json) VALUES (?,?,?) ON CONFLICT(event_id) DO NOTHING',event,publication,JSON.stringify(payload));
}
function incident(db: TransactionDatabase,j: Job,e: Evidence,code: string,now: string) {
  const key=`incident:${j.id}:${code}`;
  db.run('INSERT INTO incidents(incident_key,environment,page_connection_id,job_id,evidence_id,code,opened_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',key,j.environment,j.page_connection_id,j.id,e.id,code,now);
  const s=one<{blocked_reasons:string}>(db,'SELECT blocked_reasons FROM application_state WHERE environment=?',j.environment)!;
  const parsed:unknown=JSON.parse(s.blocked_reasons);
  const blocks=Array.isArray(parsed)&&parsed.every(v=>typeof v==='string')?parsed:['invalid_barrier'];
  if(!blocks.includes(key)) db.run('UPDATE application_state SET blocked_reasons=? WHERE environment=?',JSON.stringify([...blocks,key]),j.environment);
  notify(db,`${key}:alert`,null,{kind:'needs_action',environment:j.environment,page:j.page_connection_id,job:j.id,code});
}
function audit(db: TransactionDatabase,j: Job,actor: string,now: string,next: string,reason: string,action='finalize_evidence') {
  db.run('INSERT INTO operation_events(environment,job_id,action,actor,occurred_at,previous_state,new_state,reason) VALUES (?,?,?,?,?,?,?,?)',j.environment,j.id,action,actor,now,j.state,next,reason);
}
function release(db: TransactionDatabase,j: Job) {
  // Only this job's gate; never release a newer owner's different job.
  db.run('UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=?',j.page_connection_id,j.id);
}
function dateProof(db: TransactionDatabase,j: Job,e: Evidence,pub: string,d: Details,now: string): boolean {
  if(d.remotePublishedAt===null) {
    if(one(db,'SELECT 1 FROM publication_dates WHERE publication_id=?',pub)) return false;
    incident(db,j,e,'REMOTE_DATE_UNVERIFIED',now); return true;
  }
  const date=businessDate(new Date(d.remotePublishedAt));
  const old=one<{business_date:string}>(db,'SELECT business_date FROM publication_dates WHERE publication_id=?',pub);
  if(old && old.business_date!==date) {incident(db,j,e,'REMOTE_DATE_CONFLICT',now);return true;}
  db.run('INSERT INTO publication_dates VALUES (?,?,?,?) ON CONFLICT DO NOTHING',pub,e.id,d.remotePublishedAt,date);
  if(j.environment!=='production') return false;
  const guard=one<{publication_id:string}>(db,'SELECT publication_id FROM actual_day_guards WHERE page_connection_id=? AND business_date=?',j.page_connection_id,date);
  if(guard && guard.publication_id!==pub) {incident(db,j,e,'ACTUAL_DAY_CONFLICT',now);return true;}
  db.run('INSERT INTO actual_day_guards VALUES (?,?,?) ON CONFLICT DO NOTHING',j.page_connection_id,date,pub);
  if(j.slot_id) {
    const slot=one<{business_date:string}>(db,'SELECT business_date FROM schedule_slots WHERE id=?',j.slot_id)!;
    if(date!==slot.business_date) {
      const other=one<{id:string;status:string}>(db,'SELECT id,status FROM schedule_slots WHERE page_connection_id=? AND business_date=?',j.page_connection_id,date);
      if(other && other.id!==j.slot_id) {
        db.run("UPDATE schedule_slots SET status='replaced_by_late_publication' WHERE id=? AND status='planned'",other.id);
        if(other.status==='planned') db.run(`UPDATE posts SET pool='reserve' WHERE id=(SELECT planned_post_id FROM schedule_slots WHERE id=?)
          AND NOT EXISTS(SELECT 1 FROM production_post_usage u WHERE u.post_id=posts.id AND u.page_connection_id=?)`,other.id,j.page_connection_id);
        if(other.status!=='planned' && other.status!=='replaced_by_late_publication') {incident(db,j,e,'LATE_SLOT_CONFLICT',now);return true;}
      }
    }
  }
  return false;
}
function confirmed(db: TransactionDatabase,j: Job,e: Evidence,d: Details,now: string): boolean {
  let conflict=false;
  const existing=one<{id:string;job_id:string}>(db,`SELECT p.id,p.job_id FROM publications p JOIN publish_jobs x ON x.id=p.job_id
    WHERE x.page_connection_id=? AND p.remote_id=?`,j.page_connection_id,e.remote_id);
  if(existing && existing.job_id!==j.id) {incident(db,j,e,'REMOTE_ID_OTHER_JOB',now); return true;}
  const prior=one(db,'SELECT 1 FROM publications WHERE job_id=? AND remote_id!=?',j.id,e.remote_id);
  if(prior) {incident(db,j,e,'MULTIPLE_REMOTE_IDS',now);conflict=true;}
  const pub=existing?.id??`publication:${e.id}`;
  if(!existing) db.run(`INSERT INTO publications(id,job_id,remote_id,remote_link,caption_snapshot,asset_checksum,footer_version,confirmed_at,remote_published_at,remote_business_date)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,pub,j.id,e.remote_id,d.remoteLink??'',j.caption_snapshot,j.asset_checksum,j.footer_version,now,d.remotePublishedAt,
    d.remotePublishedAt?businessDate(new Date(d.remotePublishedAt)):null);
  if(dateProof(db,j,e,pub,d,now)) conflict=true;
  if(j.environment==='production') {
    const usage=one<{first_publication_id:string}>(db,'SELECT first_publication_id FROM production_post_usage WHERE page_connection_id=? AND post_id=?',j.page_connection_id,j.post_id);
    if(usage && usage.first_publication_id!==pub) {incident(db,j,e,'POST_USAGE_CONFLICT',now);conflict=true;}
    db.run('INSERT INTO production_post_usage VALUES (?,?,?,?) ON CONFLICT DO NOTHING',j.page_connection_id,j.post_id,pub,now);
  }
  const attempt=one<{outcome:string|null}>(db,'SELECT outcome FROM attempts WHERE id=?',e.attempt_id)!;
  if(attempt.outcome?.startsWith('verified_failed')) {incident(db,j,e,'CONTRADICTORY_OUTCOME',now);conflict=true;}
  const unresolved=one(db,"SELECT 1 FROM attempts WHERE job_id=? AND id!=? AND (outcome IS NULL OR outcome='unknown')",j.id,e.attempt_id);
  if(unresolved) {incident(db,j,e,'OTHER_ATTEMPT_UNRESOLVED',now);conflict=true;}
  const gate=one<{active_job_id:string|null}>(db,'SELECT active_job_id FROM page_publish_gates WHERE page_connection_id=?',j.page_connection_id);
  if(gate?.active_job_id && gate.active_job_id!==j.id) {incident(db,j,e,'PAGE_OWNER_CONFLICT',now);conflict=true;}
  db.run("UPDATE attempts SET outcome='confirmed' WHERE id=?",e.attempt_id);
  db.run('UPDATE publish_jobs SET state=?,next_attempt_at=NULL WHERE id=?',unresolved?'unknown':'confirmed',j.id);
  if(j.slot_id) db.run("UPDATE schedule_slots SET status='confirmed' WHERE id=?",j.slot_id);
  if(!unresolved) release(db,j);
  notify(db,`published:${pub}`,pub,{kind:'published',environment:j.environment,page:j.page_connection_id,job:j.id,remoteId:e.remote_id,link:d.remoteLink});
  return conflict;
}
function failed(db: TransactionDatabase,j: Job,e: Evidence,d: Details,now: string): boolean {
  if(d.failureKind==='global') incident(db,j,e,'GLOBAL_CONNECTION_FAULT',now);
  const a=one<{ordinal:number;outcome:string|null}>(db,'SELECT ordinal,outcome FROM attempts WHERE id=?',e.attempt_id)!;
  if(a.outcome==='confirmed' || one(db,'SELECT 1 FROM publications WHERE job_id=?',j.id)) {incident(db,j,e,'FAILURE_AFTER_CONFIRMATION',now);return true;}
  // A late failure of an earlier attempt cannot change the current request's state.
  if(a.ordinal!==j.attempt_count) return false;
  if(a.outcome?.startsWith('verified_failed')) {
    if(a.outcome!==e.outcome) {incident(db,j,e,'CONTRADICTORY_OUTCOME',now);return true;}
    return false;
  }
  db.run('UPDATE attempts SET outcome=? WHERE id=?',e.outcome,e.attempt_id);
  const retry=e.outcome==='verified_failed_retryable' && j.attempt_count<POLICY.maxPublishAttempts;
  const next=retry?new Date(Math.max(time(now)+POLICY.retryDelayMinutes*60_000,d.retryAt?time(d.retryAt):0)).toISOString():null;
  const status=retry?'retry_wait':d.failureKind==='policy'?'quarantined':'failed';
  db.run('UPDATE publish_jobs SET state=?,next_attempt_at=? WHERE id=?',status,next,j.id);
  release(db,j);
  if(!retry) {
    db.run('UPDATE post_versions SET status=? WHERE id=?',d.failureKind==='policy'?'quarantined':'needs_review',j.post_version_id);
    if(j.slot_id) {
      const slot=one<{business_date:string}>(db,'SELECT business_date FROM schedule_slots WHERE id=?',j.slot_id)!;
      db.run("UPDATE schedule_slots SET status=? WHERE id=? AND status IN ('held','requested','unknown')",slot.business_date===businessDate(new Date(now))?'planned':'expired',j.slot_id);
    }
    notify(db,`failed:${j.id}`,null,{kind:'post_failed',environment:j.environment,page:j.page_connection_id,job:j.id,reason:d.failureKind});
  }
  return false;
}
export function finalizeEvidence(db: TransactionDatabase,input: { id:string; actor:string; now:string }) {
  identity(input.id,input.actor);time(input.now);
  try {
    return db.immediate(()=>{
      const e=one<Evidence>(db,'SELECT * FROM publish_evidence WHERE id=?',input.id);if(!e) fail('UNKNOWN_EVIDENCE');
      if(e.state!=='pending') return {state:e.state,duplicate:true};
      if(e.next_at && time(e.next_at)>time(input.now)) return {state:'pending',deferred:true};
      const j=jobFor(db,e.attempt_id),d=JSON.parse(e.normalized_json) as Details;
      if(d.page!==j.page_connection_id) fail('EVIDENCE_PAGE_MISMATCH');
      const s=one<{maintenance_owner:string|null}>(db,'SELECT maintenance_owner FROM application_state WHERE environment=?',j.environment)!;
      if(s.maintenance_owner!==null) return {state:'pending',deferred:true};
      if(time(input.now)<time(e.observed_at)) fail('FINALIZATION_BEFORE_OBSERVATION');
      let conflict=false;
      if(e.outcome==='confirmed') conflict=confirmed(db,j,e,d,input.now);
      else if(e.outcome==='unknown') {
        const a=one<{ordinal:number;outcome:string|null}>(db,'SELECT ordinal,outcome FROM attempts WHERE id=?',e.attempt_id)!;
        if(a.ordinal===j.attempt_count && (!a.outcome || a.outcome==='unknown')) {
          db.run("UPDATE attempts SET outcome='unknown' WHERE id=?",e.attempt_id);
          db.run("UPDATE publish_jobs SET state='unknown' WHERE id=?",j.id);
          if(j.slot_id) db.run("UPDATE schedule_slots SET status='unknown' WHERE id=? AND status IN ('requested','held')",j.slot_id);
          notify(db,`unknown:${j.id}:${a.ordinal}`,null,{kind:'needs_reconciliation',environment:j.environment,page:j.page_connection_id,job:j.id});
        }
      } else conflict=failed(db,j,e,d,input.now);
      const state=conflict?'conflict':'applied';
      db.run('UPDATE publish_evidence SET state=?,next_at=NULL,last_error=NULL WHERE id=?',state,e.id);
      const status=one<{state:string}>(db,'SELECT state FROM publish_jobs WHERE id=?',j.id)!.state;
      audit(db,j,input.actor,input.now,status,`evidence_${state}`);
      return {state,duplicate:false};
    });
  } catch(error) {
    // Preserve intake and schedule only the internal finalizer retry. No raw errors/tokens stored.
    db.immediate(()=>db.run("UPDATE publish_evidence SET next_at=?,last_error='FINALIZATION_FAILED' WHERE id=? AND state='pending'",new Date(time(input.now)+60_000).toISOString(),input.id));
    throw error;
  }
}
