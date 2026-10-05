// Narrow asynchronous D1 interface: never adapt synchronous local transactions by awaiting them.
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface CloudBindings {
  APP_ENV?: string;
  INTEGRATION_MODE?: string;
  DB?: { prepare(sql: string): Statement };
  STAGING_HEALTH_TOKEN?: string;
  RELEASE_SHA?: string;
}
export const HEARTBEAT_CRON = '17 * * * *';
export const STATUS_SQL = `SELECT r.environment, r.last_scheduled_at, r.heartbeat_count,
  a.paused_by_user, (SELECT count(*) FROM schema_migrations) AS migration_count
  FROM cloud_runtime r JOIN application_state a ON a.environment=r.environment
  WHERE r.id=1`;
export function assertStaging(env: CloudBindings): void {
  if (env.APP_ENV !== 'staging' || env.INTEGRATION_MODE !== 'unconfigured') {
    throw new Error('Staging foundation requires explicitly unconfigured integrations');
  }
}
export interface RuntimeStatus {
  environment: string; paused_by_user: number; migration_count: number;
  last_scheduled_at: number | null; heartbeat_count: number;
}
export async function readStatus(env: CloudBindings): Promise<RuntimeStatus> {
  assertStaging(env);
  if (!env.DB) throw new Error('D1 binding missing');
  const row = await env.DB.prepare(STATUS_SQL).first<RuntimeStatus>();
  if (!row || row.environment !== 'staging' || row.paused_by_user !== 1 || row.migration_count !== 6) {
    throw new Error('Database identity, schema or pause state is invalid');
  }
  return row;
}
export async function recordHeartbeat(event: { cron: string; scheduledTime: number }, env: CloudBindings): Promise<void> {
  assertStaging(env);
  if (event.cron !== HEARTBEAT_CRON || !Number.isSafeInteger(event.scheduledTime) || event.scheduledTime < 0) {
    throw new Error('Unexpected staging schedule');
  }
  await readStatus(env);
  // Duplicate or out-of-order cron delivery cannot increase the counter or roll time back.
  // Recheck pause in the write itself, instead of trusting the earlier observation.
  await env.DB!.prepare(`UPDATE cloud_runtime SET last_scheduled_at=?, heartbeat_count=heartbeat_count+1
    WHERE id=1 AND environment='staging' AND (last_scheduled_at IS NULL OR last_scheduled_at < ?)
    AND EXISTS (SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1)`)
    .bind(event.scheduledTime, event.scheduledTime).run();
}
