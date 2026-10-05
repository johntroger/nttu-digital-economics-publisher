import { readCatalog, readContext } from './catalog.ts';
import { eligibility } from '../domain/content.ts';
import { composeCaption, FOOTER_VERSION } from '../domain/footer.ts';
import { businessDate, scheduledInstant, POLICY } from '../domain/policy.ts';

type Parameter = string | number | null;
export interface TransactionDatabase {
  all<T>(sql: string, ...parameters: Parameter[]): T[];
  run(sql: string, ...parameters: Parameter[]): number;
  immediate<T>(work: () => T): T;
}
export class WorkflowError extends Error {
  code: string;
  reasons: string[];
  constructor(code: string, reasons: string[] = []) { super(code); this.code = code; this.reasons = reasons; }
}
type State = { environment: string; paused_by_user: number; blocked_reasons: string; maintenance_owner: string | null; operation_generation: number; maintenance_generation: number };
type Job = { id: string; environment: string; page_connection_id: string; slot_id: string | null; request_id: string | null;
  post_version_id: string; state: string; owner_token: string | null; generation: number; lease_until: string | null;
  attempt_count: number; next_attempt_at: string | null; caption_snapshot: string; asset_checksum: string; footer_version: string };
type Claim = { check_version: number; asset_id: string; asset_key: string; asset_size: number; operation_generation: number };
type Owner = { jobId: string; token: string; generation: number; now: string; actor: string };
function fail(code: string, reasons: string[] = []): never { throw new WorkflowError(code, reasons); }
function instant(now: string): number {
  const ms = Date.parse(now);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z','Z') !== now.replace('.000Z','Z')) fail('INVALID_TIME');
  return ms;
}
function identity(...values: string[]) {
  if (values.some(value => !value.trim() || value.length > 200)) fail('INVALID_IDENTITY');
}
function row<T>(db: TransactionDatabase, sql: string, ...parameters: Parameter[]): T | undefined { return db.all<T>(sql,...parameters)[0]; }
function changed(count: number) { if (count !== 1) fail('OWNERSHIP_CONFLICT'); }
function state(db: TransactionDatabase, environment: string): State {
  const result = row<State>(db,'SELECT * FROM application_state WHERE environment=?',environment);
  if (!result) fail('UNKNOWN_ENVIRONMENT');
  return result;
}
function allowed(s: State) {
  if (s.paused_by_user) fail('PAUSED');
  if (s.maintenance_owner !== null) fail('MAINTENANCE');
  const blocks: unknown = JSON.parse(s.blocked_reasons);
  if (!Array.isArray(blocks) || blocks.some(v => typeof v !== 'string')) fail('INVALID_BARRIER');
  if (blocks.length) fail('ENVIRONMENT_BLOCKED');
}
function job(db: TransactionDatabase, id: string): Job {
  const result = row<Job>(db,`SELECT j.*,p.environment FROM publish_jobs j JOIN page_connections p ON p.id=j.page_connection_id WHERE j.id=?`,id);
  if (!result) fail('UNKNOWN_JOB');
  return result;
}
function audit(db: TransactionDatabase, environment: string, jobId: string | null, action: string, actor: string, now: string,
  previous: string | null, next: string | null, reason: string) {
  db.run('INSERT INTO operation_events(environment,job_id,action,actor,occurred_at,previous_state,new_state,reason) VALUES (?,?,?,?,?,?,?,?)',
    environment,jobId,action,actor,now,previous,next,reason);
}
function day(db: TransactionDatabase, page: string, slotId: string | null, environment: string, now: string) {
  if (environment === 'production' && slotId === null) fail('PRODUCTION_REQUIRES_SLOT');
  if (environment !== 'production' && slotId !== null) fail('TRIAL_REQUIRES_REQUEST');
  if (slotId) {
    const slot = row<{ business_date: string; status: string }>(db,'SELECT business_date,status FROM schedule_slots WHERE id=? AND page_connection_id=?',slotId,page);
    if (!slot) fail('SLOT_NOT_FOUND');
    if (slot.business_date !== businessDate(new Date(now))) fail('SLOT_DATE_MISMATCH');
    if (instant(now) < scheduledInstant(slot.business_date).getTime()) fail('NOT_DUE');
    if (!['planned','held','requested'].includes(slot.status)) fail('SLOT_CLOSED');
    if (row(db,'SELECT 1 FROM actual_day_guards WHERE page_connection_id=? AND business_date=?',page,slot.business_date)) fail('DAY_ALREADY_PUBLISHED');
  }
}
function recheck(db: TransactionDatabase, j: Job, c: Claim, now: string) {
  const post = readCatalog(db).find(p => p.versionId === j.post_version_id);
  if (!post) fail('ACTIVE_VERSION_CHANGED');
  const context = readContext(db,j.page_connection_id,now,FOOTER_VERSION);
  // The current job owns this hold; every other active hold still blocks this identity.
  const other = row(db,`SELECT 1 FROM publish_jobs x JOIN post_versions v ON v.id=x.post_version_id
    WHERE x.page_connection_id=? AND v.post_id=? AND x.id!=? AND x.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown')`,j.page_connection_id,post.postId,j.id);
  if (other) fail('POST_HELD_ELSEWHERE');
  const held = new Set(context.heldPostIds); held.delete(post.postId);
  const reasons = eligibility(post,{ ...context, heldPostIds: held });
  if (reasons.length) fail('CONTENT_INELIGIBLE',reasons);
  if (post.checkVersion !== c.check_version || post.asset?.id !== c.asset_id
    || post.asset.checksum !== j.asset_checksum || j.footer_version !== FOOTER_VERSION
    || composeCaption(post.body) !== j.caption_snapshot) fail('SNAPSHOT_MISMATCH');
}
function gateFree(db: TransactionDatabase, page: string) {
  db.run('INSERT INTO page_publish_gates(page_connection_id) VALUES (?) ON CONFLICT DO NOTHING',page);
  const gate = row<{ active_job_id: string | null; generation: number }>(db,'SELECT * FROM page_publish_gates WHERE page_connection_id=?',page)!;
  if (gate.active_job_id !== null) fail('PAGE_BUSY');
  // Defensive check for old data missing its gate, including expired uncertain requests.
  if (pageBlocked(db,page,null)) fail('PAGE_BUSY');
  return gate.generation + 1;
}
function pageBlocked(db: TransactionDatabase, page: string, except: string | null) {
  return row(db,`SELECT 1 FROM publish_jobs j WHERE j.page_connection_id=? AND (? IS NULL OR j.id!=?)
    AND (j.state IN ('held','publish_requested','evidence_pending','unknown') OR
      (j.state='retry_wait' AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.job_id=j.id
        AND a.ordinal=j.attempt_count AND a.outcome='verified_failed_retryable')))`,page,except,except);
}
export function claimJob(db: TransactionDatabase, input: {
  id: string; page: string; postId: string; expectedVersion: string; slotId: string | null; requestId: string | null;
  token: string; actor: string; now: string;
}) {
  identity(input.id,input.page,input.postId,input.expectedVersion,input.token,input.actor);
  const lease = new Date(instant(input.now)+120_000).toISOString();
  if ((input.slotId === null) === (input.requestId === null)) fail('INVALID_TARGET');
  if (input.slotId !== null) identity(input.slotId);
  if (input.requestId !== null) identity(input.requestId);
  return db.immediate(() => {
    const page = row<{ environment: string }>(db,'SELECT environment FROM page_connections WHERE id=?',input.page);
    if (!page) fail('UNKNOWN_PAGE');
    const s = state(db,page.environment); allowed(s);
    if (row(db,'SELECT 1 FROM publish_jobs WHERE id=?',input.id)
      || (input.requestId && row(db,'SELECT 1 FROM publish_jobs WHERE page_connection_id=? AND request_id=?',input.page,input.requestId))) fail('CLAIM_ALREADY_EXISTS');
    day(db,input.page,input.slotId,page.environment,input.now);
    if (input.slotId && row(db,"SELECT 1 FROM schedule_slots WHERE id=? AND status!='planned'",input.slotId)) fail('SLOT_NOT_PLANNED');
    const generation = gateFree(db,input.page);
    const post = readCatalog(db).find(p => p.postId === input.postId);
    if (!post || post.versionId !== input.expectedVersion) fail('ACTIVE_VERSION_CHANGED');
    const reasons = eligibility(post,readContext(db,input.page,input.now,FOOTER_VERSION));
    if (reasons.length) fail('CONTENT_INELIGIBLE',reasons);
    const asset = row<{ storage_key: string; size_bytes: number }>(db,'SELECT storage_key,size_bytes FROM assets WHERE id=?',post.asset!.id)!;
    db.run(`INSERT INTO publish_jobs(id,page_connection_id,slot_id,request_id,post_version_id,caption_snapshot,asset_checksum,footer_version,owner_token,generation,lease_until)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,input.id,input.page,input.slotId,input.requestId,post.versionId,composeCaption(post.body),post.asset!.checksum,FOOTER_VERSION,input.token,generation,lease);
    db.run('INSERT INTO job_claims VALUES (?,?,?,?,?,?,?)',input.id,post.checkVersion,post.asset!.id,asset.storage_key,asset.size_bytes,s.operation_generation,input.now);
    changed(db.run('UPDATE page_publish_gates SET active_job_id=?,generation=?,lease_until=? WHERE page_connection_id=? AND active_job_id IS NULL',input.id,generation,lease,input.page));
    if (input.slotId) changed(db.run("UPDATE schedule_slots SET status='held' WHERE id=? AND status='planned'",input.slotId));
    audit(db,page.environment,input.id,'claim',input.actor,input.now,null,'held','eligible_snapshot');
    return { jobId: input.id, generation, leaseUntil: lease };
  });
}
export function takeOwnership(db: TransactionDatabase, input: { jobId: string; token: string; actor: string; now: string }) {
  identity(input.jobId,input.token,input.actor); const ms = instant(input.now);
  return db.immediate(() => {
    const j = job(db,input.jobId), s = state(db,j.environment); allowed(s);
    if (!['held','retry_wait'].includes(j.state)) fail('JOB_NOT_UNSENT');
    if (j.state === 'held' && row(db,'SELECT 1 FROM attempts WHERE job_id=?',j.id)) fail('INTENT_ALREADY_RECORDED');
    if (j.state === 'retry_wait') retryAllowed(db,j,input.now);
    const c = row<Claim>(db,'SELECT * FROM job_claims WHERE job_id=?',j.id); if (!c) fail('CLAIM_MISSING');
    const g = row<{ active_job_id: string | null; generation: number }>(db,'SELECT * FROM page_publish_gates WHERE page_connection_id=?',j.page_connection_id);
    if (!g || (g.active_job_id !== j.id && (j.state !== 'retry_wait' || g.active_job_id !== null))) fail('OWNERSHIP_CONFLICT');
    if (g.active_job_id === j.id && j.lease_until && instant(j.lease_until) > ms && c.operation_generation === s.operation_generation) fail('OWNER_STILL_ACTIVE');
    if (j.owner_token === input.token) fail('NEW_OWNER_REQUIRED');
    day(db,j.page_connection_id,j.slot_id,j.environment,input.now); recheck(db,j,c,input.now);
    if (g.active_job_id === j.id && g.generation !== j.generation) fail('OWNERSHIP_CONFLICT');
    if (pageBlocked(db,j.page_connection_id,j.id)) fail('PAGE_BUSY');
    const generation = g.generation+1, lease = new Date(ms+120_000).toISOString();
    changed(db.run("UPDATE publish_jobs SET owner_token=?,generation=?,lease_until=? WHERE id=? AND generation=? AND state IN ('held','retry_wait')",input.token,generation,lease,j.id,j.generation));
    changed(db.run('UPDATE page_publish_gates SET active_job_id=?,generation=?,lease_until=? WHERE page_connection_id=? AND active_job_id IS ? AND generation=?',j.id,generation,lease,j.page_connection_id,g.active_job_id,g.generation));
    changed(db.run('UPDATE job_claims SET operation_generation=? WHERE job_id=?',s.operation_generation,j.id));
    audit(db,j.environment,j.id,'take_ownership',input.actor,input.now,j.state,j.state,'safe_owner_replaced');
    return { jobId: j.id, generation, leaseUntil: lease };
  });
}
function retryAllowed(db: TransactionDatabase, j: Job, now: string) {
  if (j.attempt_count >= POLICY.maxPublishAttempts) fail('ATTEMPT_LIMIT');
  const attempts=db.all<{ ordinal: number; outcome: string | null }>('SELECT ordinal,outcome FROM attempts WHERE job_id=? ORDER BY ordinal',j.id);
  if (!attempts.length || attempts.length !== j.attempt_count || attempts.some((a,i) => a.ordinal !== i+1)
    || attempts[attempts.length-1]?.outcome !== 'verified_failed_retryable') fail('RETRY_NOT_VERIFIED');
  if (!j.next_attempt_at || instant(j.next_attempt_at)>instant(now)) fail('RETRY_NOT_DUE');
}
function owned(db: TransactionDatabase, input: Owner): { j: Job; c: Claim; s: State } {
  identity(input.jobId,input.token,input.actor); const ms=instant(input.now);
  const j=job(db,input.jobId), s=state(db,j.environment); allowed(s);
  const c=row<Claim>(db,'SELECT * FROM job_claims WHERE job_id=?',j.id);
  const g=row<{ active_job_id: string | null; generation: number; lease_until: string | null }>(db,'SELECT * FROM page_publish_gates WHERE page_connection_id=?',j.page_connection_id);
  if (!c || !g || j.owner_token !== input.token || j.generation !== input.generation || g.generation !== input.generation
    || g.active_job_id !== j.id || c.operation_generation !== s.operation_generation || !j.lease_until || !g.lease_until
    || instant(j.lease_until) <= ms || instant(g.lease_until) <= ms) fail('OWNERSHIP_CONFLICT');
  return { j,c,s };
}
export function recordIntent(db: TransactionDatabase, input: Owner & { attemptId: string }) {
  identity(input.attemptId);
  return db.immediate(() => {
    const { j,c }=owned(db,input);
    if (!['held','retry_wait'].includes(j.state)) fail('JOB_NOT_UNSENT');
    if (j.state === 'held' && (j.attempt_count !== 0 || row(db,'SELECT 1 FROM attempts WHERE job_id=?',j.id))) fail('INTENT_ALREADY_RECORDED');
    if (j.state === 'retry_wait') retryAllowed(db,j,input.now);
    if (j.attempt_count >= POLICY.maxPublishAttempts) fail('ATTEMPT_LIMIT');
    day(db,j.page_connection_id,j.slot_id,j.environment,input.now); recheck(db,j,c,input.now);
    db.run('INSERT INTO attempts(id,job_id,ordinal,intent_at) VALUES (?,?,?,?)',input.attemptId,j.id,j.attempt_count+1,input.now);
    changed(db.run("UPDATE publish_jobs SET state='publish_requested',attempt_count=attempt_count+1 WHERE id=? AND state=? AND owner_token=? AND generation=?",j.id,j.state,input.token,input.generation));
    if (j.slot_id) changed(db.run("UPDATE schedule_slots SET status='requested' WHERE id=? AND status IN ('held','requested')",j.slot_id));
    audit(db,j.environment,j.id,'intent',input.actor,input.now,j.state,'publish_requested','attempt_recorded');
    // Only this successful call creates a permit; replay/recovery never returns another one.
    return { attemptId: input.attemptId, jobId: j.id, caption: j.caption_snapshot, assetKey: c.asset_key,
      checksum: j.asset_checksum, footerVersion: j.footer_version, pageConnection: j.page_connection_id };
  });
}
export function cancelUnsent(db: TransactionDatabase, input: Owner) {
  return db.immediate(() => {
    const { j }=owned(db,input);
    if (j.state !== 'held' || row(db,'SELECT 1 FROM attempts WHERE job_id=?',j.id)) fail('JOB_NOT_UNSENT');
    changed(db.run("UPDATE publish_jobs SET state='cancelled' WHERE id=? AND state='held' AND generation=?",j.id,input.generation));
    changed(db.run('UPDATE page_publish_gates SET active_job_id=NULL,lease_until=NULL WHERE page_connection_id=? AND active_job_id=? AND generation=?',j.page_connection_id,j.id,input.generation));
    if (j.slot_id) changed(db.run("UPDATE schedule_slots SET status='planned' WHERE id=? AND status='held'",j.slot_id));
    audit(db,j.environment,j.id,'cancel_unsent',input.actor,input.now,'held','cancelled','no_attempt_exists');
  });
}
export function markExpiredIntentUnknown(db: TransactionDatabase, input: { jobId: string; actor: string; now: string }) {
  identity(input.jobId,input.actor); const ms=instant(input.now);
  return db.immediate(() => {
    const j=job(db,input.jobId);
    if (j.state !== 'publish_requested' || !j.lease_until || instant(j.lease_until)>ms) fail('NOT_EXPIRED_INTENT');
    changed(db.run("UPDATE publish_jobs SET state='unknown' WHERE id=? AND state='publish_requested'",j.id));
    if (j.slot_id) db.run("UPDATE schedule_slots SET status='unknown' WHERE id=? AND status='requested'",j.slot_id);
    audit(db,j.environment,j.id,'intent_unknown',input.actor,input.now,'publish_requested','unknown','expired_intent_requires_reconciliation');
    // Keep the gate and durable attempt; do not invent a remote outcome.
  });
}
export function setPaused(db: TransactionDatabase, input: { environment: string; paused: boolean; actor: string; now: string }) {
  identity(input.environment,input.actor); instant(input.now);
  return db.immediate(() => {
    const s=state(db,input.environment);
    changed(db.run('UPDATE application_state SET paused_by_user=? WHERE environment=?',Number(input.paused),input.environment));
    audit(db,input.environment,null,'pause',input.actor,input.now,String(s.paused_by_user),String(Number(input.paused)),'owner_setting');
  });
}
export function beginMaintenance(db: TransactionDatabase, input: { environment: string; owner: string; actor: string; now: string }) {
  identity(input.environment,input.owner,input.actor); instant(input.now);
  return db.immediate(() => {
    const s=state(db,input.environment);
    if (s.maintenance_owner !== null || row(db,`SELECT 1 FROM publish_jobs j JOIN page_connections p ON p.id=j.page_connection_id
      WHERE p.environment=? AND j.state IN ('publish_requested','evidence_pending','unknown')`,input.environment)) return { acquired: false };
    changed(db.run('UPDATE application_state SET maintenance_owner=?,maintenance_generation=maintenance_generation+1 WHERE environment=? AND maintenance_owner IS NULL',input.owner,input.environment));
    audit(db,input.environment,null,'maintenance_begin',input.actor,input.now,null,'maintenance','environment_barrier');
    return { acquired: true, generation:s.maintenance_generation+1 };
  });
}
export function finishMaintenance(db: TransactionDatabase, input: { environment: string; owner: string; generation: number; actor: string; now: string; databaseAvailable: boolean; exportFinished: boolean }) {
  identity(input.environment,input.owner,input.actor); instant(input.now);
  if (!input.databaseAvailable || !input.exportFinished) fail('EXPORT_NOT_VERIFIED');
  return db.immediate(() => {
    state(db,input.environment);
    changed(db.run('UPDATE application_state SET maintenance_owner=NULL WHERE environment=? AND maintenance_owner=? AND maintenance_generation=?',input.environment,input.owner,input.generation));
    audit(db,input.environment,null,'maintenance_finish',input.actor,input.now,'maintenance',null,'database_export_finished');
  });
}
