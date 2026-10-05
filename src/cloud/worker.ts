import { assertStaging, readStatus, recordHeartbeat } from './runtime.ts';
import type { CloudBindings } from './runtime.ts';

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  } });
}
async function authorized(request: Request, env: CloudBindings): Promise<boolean> {
  const secret = env.STAGING_HEALTH_TOKEN;
  const supplied = request.headers.get('Authorization');
  if (!secret || secret.length < 32 || !supplied?.startsWith('Bearer ') || supplied.length > 1024) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(secret), digest(supplied.slice(7))]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}
export default {
  async fetch(request: Request, env: CloudBindings): Promise<Response> {
    try { assertStaging(env); } catch { return json({ code: 'CONFIGURATION_NOT_READY' }, 503); }
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/health') {
      return json({ service: 'nttu-publisher', step: 12, environment: 'staging',
        integrationMode: 'unconfigured', publishingImplemented: false,
        databaseChecked: false, schedulerImplemented: false, heartbeatImplemented: true,
        release: env.RELEASE_SHA ?? 'local' });
    }
    if (request.method === 'GET' && path === '/api/staging/status') {
      if (!await authorized(request, env)) return json({ code: 'UNAUTHORIZED' }, 401);
      try {
        const row = await readStatus(env);
        return json({ environment: row.environment, databaseChecked: true, paused: true,
          publishingImplemented: false, heartbeatCount: row.heartbeat_count,
          lastScheduledAt: row.last_scheduled_at });
      } catch { return json({ code: 'DATABASE_NOT_READY' }, 503); }
    }
    if (path.startsWith('/api/')) return json({ code: 'CLOUD_FEATURE_PENDING' }, 501);
    return json({ code: 'NOT_FOUND' }, 404);
  },
  async scheduled(event: { cron: string; scheduledTime: number }, env: CloudBindings): Promise<void> {
    await recordHeartbeat(event, env);
  },
};
