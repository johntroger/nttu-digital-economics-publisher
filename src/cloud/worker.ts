import { assertStaging, readStatus, recordHeartbeat } from './runtime.ts';
import type { CloudBindings } from './runtime.ts';
import { startGoogle, completeGoogle, ownerSession, requireMutation, clearSessionCookie, authConfigured, probeGoogleExchange, AuthError } from './auth.ts';
import { cloudCatalog, cloudPost, saveCloudCaption, CatalogError } from './catalog.ts';

const UI_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
function loginPage(ready: boolean, failed: boolean, reason = ''): Response {
  const messages: Record<string, string> = {
    flow: 'Phiên đăng nhập bị thiếu, hết hạn hoặc không khớp. Bấm đăng nhập lại từ trang này và hoàn tất trong cùng trình duyệt.',
    client: 'Google từ chối cấu hình ứng dụng. Cần kiểm tra Client ID và Client Secret có thuộc cùng một OAuth Client.',
    grant: 'Google từ chối mã đăng nhập. Bấm đăng nhập lại để lấy mã mới; nếu lặp lại cần kiểm tra callback.',
    exchange: 'Chưa trao đổi được token với Google. Thử lại; nếu lặp lại cần kiểm tra cấu hình kết nối.',
    network: 'Máy chủ chưa kết nối được đến Google. Cần kiểm tra kết nối từ Cloudflare.',
    runtime: 'Runtime chưa thực hiện được yêu cầu đăng nhập. Cần kiểm tra mã kết nối của ứng dụng.',
    timeout: 'Google chưa phản hồi trong thời gian cho phép. Thử đăng nhập lại.',
    provider: 'Google trả về lỗi khi trao đổi mã đăng nhập. Cần kiểm tra phản hồi của dịch vụ.',
    request: 'Google từ chối định dạng yêu cầu đăng nhập. Cần kiểm tra cấu hình ứng dụng.',
    response: 'Phản hồi từ Google chưa có token đăng nhập hợp lệ. Cần kiểm tra cấu hình ứng dụng.',
    identity: 'Chưa xác minh được thông tin đăng nhập Google. Cần kiểm tra bước xác minh token.',
    owner: 'Tài khoản Google chưa được cấp quyền quản lý. Chọn tài khoản quản lý đã đăng ký.',
    session: 'Chưa tạo được phiên quản lý. Cần kiểm tra cấu hình phiên đăng nhập.',
  };
  const failure = messages[reason] ?? 'Không hoàn tất được đăng nhập. Bấm đăng nhập lại để thử một phiên mới.';
  const body = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập | Phòng nội dung</title><link rel="stylesheet" href="/cloud.css"></head><body><main class="login"><strong>Ngành Kinh tế số · NTTU</strong><h1>Phòng nội dung</h1><p>Đăng nhập tài khoản Google của người quản lý để mở kho bài staging.</p>${failed ? '<p role="alert">' + failure + '</p>' : ''}${ready ? '<a href="/auth/google/start">Đăng nhập bằng Google</a>' : '<p role="status">Đang thiết lập đăng nhập Google. Kho bài chưa được mở truy cập.</p>'}<small>Lịch đăng Facebook đang dừng.</small></main></body></html>`;
  return new Response(body, { headers: { ...UI_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}
async function asset(request: Request, env: CloudBindings, path?: string): Promise<Response> {
  if (!env.ASSETS) return json({ code: 'UI_NOT_CONFIGURED' }, 503);
  const response = await env.ASSETS.fetch(path ? new Request(new URL(path, request.url), { method: 'GET' }) : request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(UI_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}
async function input(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) throw new CatalogError('INVALID_JSON', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break;
    length += value.length; if (length > 65536) { await reader.cancel(); throw new CatalogError('BODY_TOO_LARGE', 413); } chunks.push(value);
  }
  const data = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(data)); } catch { throw new CatalogError('INVALID_JSON', 400); }
}

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
      return json({ service: 'nttu-publisher', step: 13, environment: 'staging',
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
    if (path === '/api/staging/auth-check') {
      if (!await authorized(request, env)) return json({ code: 'UNAUTHORIZED' }, 401);
      if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      return json(await probeGoogleExchange(env));
    }
    if (['/api/trial-publish', '/api/publishing/resume'].includes(path)) return json({ code: 'CLOUD_FEATURE_PENDING' }, 501);
    if (request.method === 'GET' && path === '/cloud.css') return asset(request, env);
    if (path === '/auth/google/start' || path === '/auth/google/callback') {
      if (request.method !== 'GET') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      try { return path.endsWith('/start') ? await startGoogle(request, env) : await completeGoogle(request, env); }
      catch { return json({ code: 'AUTH_NOT_CONFIGURED' }, 503); }
    }
    const session = await ownerSession(request, env);
    if (!session) {
      if (path === '/' && request.method === 'GET') return loginPage(authConfigured(env), new URL(request.url).searchParams.get('login') === 'failed', new URL(request.url).searchParams.get('reason') ?? '');
      if (path.startsWith('/api/') || path === '/auth/logout' || path === '/manager.html' || path === '/manager.js') return json({ code: 'UNAUTHORIZED' }, 401);
      return json({ code: 'NOT_FOUND' }, 404);
    }
    try {
      if (path === '/api/me' && request.method === 'GET') return json({ email: session.email, csrf: session.csrf });
      if (path === '/auth/logout' && request.method === 'POST') {
        requireMutation(request, env, session);
        const response = json({ loggedOut: true }); response.headers.append('Set-Cookie', clearSessionCookie()); return response;
      }
      if (path === '/api/catalog' && request.method === 'GET') return json(await cloudCatalog(env));
      const route = path.match(/^\/api\/posts\/([^/]+)(?:\/(save|restore))?$/);
      if (route) {
        const id = decodeURIComponent(route[1]!);
        if (id.length > 300) return json({ code: 'INVALID_POST_ID' }, 400);
        if (!route[2] && request.method === 'GET') return json(await cloudPost(env, id));
        if (route[2] && request.method === 'POST') {
          requireMutation(request, env, session);
          return json(await saveCloudCaption(env, session, id, await input(request), route[2] === 'restore'));
        }
        return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      }
      if (['/', '/manager.html', '/manager.js'].includes(path) && request.method === 'GET') return asset(request, env, path === '/' ? '/manager.html' : undefined);
      if (path.startsWith('/api/')) return json({ code: 'CLOUD_FEATURE_PENDING' }, 501);
    } catch (error) {
      if (error instanceof AuthError) return json({ code: 'CSRF_REQUIRED' }, 403);
      if (error instanceof CatalogError) return json({ code: error.code }, error.status);
      return json({ code: 'CLOUD_DATABASE_UNAVAILABLE' }, 503);
    }
    return json({ code: 'NOT_FOUND' }, 404);
  },
  async scheduled(event: { cron: string; scheduledTime: number }, env: CloudBindings): Promise<void> {
    await recordHeartbeat(event, env);
  },
};
