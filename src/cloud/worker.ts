import { assertStaging, readStatus, recordHeartbeat } from './runtime.ts';
import type { CloudBindings } from './runtime.ts';
import { startGoogle, completeGoogle, ownerSession, requireMutation, clearSessionCookie, authConfigured, probeGoogleExchange, AuthError } from './auth.ts';
import { cloudCatalog, cloudPost, saveCloudCaption, CatalogError } from './catalog.ts';
import { library, readUpload, uploadFile, downloadFile } from './storage.ts';
import {createCloudReview} from './review.ts';
import {designResources,saveArtwork} from './artwork.ts';
import {DESIGN_REGISTRY} from './design-registry.ts';
import {listBackups,createBackup,continueBackup,checkBackup,backupManifest,backupFile} from './backups.ts';
import {telegramStatus,enqueueTelegramTest,retryTelegram,dispatchTelegram,discoverTelegram} from './telegram.ts';
import {cloudWorkflowStatus} from './workflow.ts';
import {metaStatus,checkMeta,monitorMetaExpiry} from './meta.ts';
import {dailyStatus,configureDaily,activateDaily,pauseDaily,reconcileDaily,runDaily} from './daily.ts';
import {contentTrialStatus,prepareContentTrial,sendContentTrial,reconcileContentTrial,monitorContentTrial} from './content-trial.ts';
import {readPresence,scanPresence} from './presence.ts';
import {trialStatus,prepareTrial,sendTrial,reconcileTrial} from './meta-trial.ts';

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
      return json({ service: 'nttu-publisher', step: 28, environment: 'staging',trialPublishingImplemented:true,presenceMonitoringImplemented:true,
        integrationMode: 'unconfigured', publishingImplemented: true,
        databaseChecked: false, schedulerImplemented: true, heartbeatImplemented: true,
        release: env.RELEASE_SHA ?? 'local' });
    }
    if (request.method === 'GET' && path === '/api/staging/status') {
      if (!await authorized(request, env)) return json({ code: 'UNAUTHORIZED' }, 401);
      try {
        const row = await readStatus(env);
        return json({ environment: row.environment, databaseChecked: true, paused: row.paused_by_user===1, publishingEnabled: env.DAILY_PUBLISHING_ENABLED==='true'&&row.paused_by_user===0,
          publishingImplemented: true, heartbeatCount: row.heartbeat_count,
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
      if (path.startsWith('/api/') || path.startsWith('/fonts/') || ['/auth/logout','/manager.html','/manager.js','/artwork.js','/artwork-ui.js','/backups.js','/zip.js','/telegram-ui.js','/meta-ui.js','/meta-trial-ui.js','/daily-ui.js','/content-trial-ui.js'].includes(path)) return json({ code: 'UNAUTHORIZED' }, 401);
      return json({ code: 'NOT_FOUND' }, 404);
    }
    try {
      if (path === '/api/me' && request.method === 'GET') return json({ email: session.email, csrf: session.csrf });
      if(path==='/api/presence')return request.method==='GET'?json(await readPresence(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(path==='/api/daily')return request.method==='GET'?json(await dailyStatus(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(['/api/daily/configure','/api/daily/activate','/api/daily/pause','/api/daily/reconcile'].includes(path)){
        if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
        requireMutation(request,env,session);const data=await input(request);
        return json(path.endsWith('/configure')?await configureDaily(env,session,data):path.endsWith('/activate')?await activateDaily(env,session,data):path.endsWith('/pause')?await pauseDaily(env):await reconcileDaily(env,data));
      }
      if(path==='/api/workflow')return request.method==='GET'?json(await cloudWorkflowStatus(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(path==='/api/meta')return request.method==='GET'?json(await metaStatus(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(path==='/api/meta/check'){
        if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
        requireMutation(request,env,session);const result=await checkMeta(env,session,await input(request));await monitorMetaExpiry(env);return json(result);
      }
      if(path==='/api/meta/content-trial')return request.method==='GET'?json(await contentTrialStatus(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(['/api/meta/content-trial/prepare','/api/meta/content-trial/send','/api/meta/content-trial/reconcile'].includes(path)){
        if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
        requireMutation(request,env,session);const data=await input(request);
        return json(path.endsWith('/prepare')?await prepareContentTrial(env,session,data):path.endsWith('/send')?await sendContentTrial(env,session,data):await reconcileContentTrial(env,data));
      }
      if(path==='/api/meta/trial')return request.method==='GET'?json(await trialStatus(env)):json({code:'METHOD_NOT_ALLOWED'},405);
      if(['/api/meta/trial/prepare','/api/meta/trial/send','/api/meta/trial/reconcile'].includes(path)){
        if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
        requireMutation(request,env,session);const data=await input(request);
        return json(path.endsWith('/prepare')?await prepareTrial(env,session,data):path.endsWith('/send')?await sendTrial(env,session,data):await reconcileTrial(env,data));
      }
      if(path==='/api/telegram'&&request.method==='GET')return json(await telegramStatus(env));
      if(['/api/telegram/test','/api/telegram/retry','/api/telegram/discover'].includes(path)){
        if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
        requireMutation(request,env,session);
        if(path.endsWith('/discover'))return json(await discoverTelegram(env));
        const result=path.endsWith('/test')?await enqueueTelegramTest(env,await input(request)):await retryTelegram(env,await input(request));
        await dispatchTelegram(env);return json(result);
      }
      if(path==='/api/backups'&&request.method==='GET')return json(await listBackups(env));
      if(path==='/api/backups/create'&&request.method==='POST'){requireMutation(request,env,session);return json(await createBackup(env,session,await input(request)));}
      const backupRoute=path.match(/^\/api\/backups\/(backup-[a-f0-9-]{36})\/(continue|check|manifest|files\/\d+)$/);
      if(backupRoute){const id=backupRoute[1]!,action=backupRoute[2]!;
        if(request.method==='GET'&&action==='manifest')return json(await backupManifest(env,id));
        if(request.method==='GET'&&action.startsWith('files/'))return await backupFile(env,id,Number(action.slice(6)));
        if(request.method==='POST'&&['continue','check'].includes(action)){requireMutation(request,env,session);const data=await input(request);return json(action==='continue'?await continueBackup(env,id,session):await checkBackup(env,id,data));}
        return json({code:'METHOD_NOT_ALLOWED'},405);
      }
      if (path === '/auth/logout' && request.method === 'POST') {
        requireMutation(request, env, session);
        const response = json({ loggedOut: true }); response.headers.append('Set-Cookie', clearSessionCookie()); return response;
      }
      if (path === '/api/catalog' && request.method === 'GET') return json(await cloudCatalog(env));
      if (path === '/api/library' && request.method === 'GET') return json(await library(env));
      if(path==='/api/design/resources'&&request.method==='GET')return json(await designResources(env));
      if(request.method==='GET'&&(DESIGN_REGISTRY.fonts.some(f=>path==='/fonts/'+f.name)||['/fonts/BricolageGrotesque-OFL.txt','/fonts/WorkSans-OFL.txt'].includes(path)))return asset(request,env);
      if (path === '/api/sources' && request.method === 'GET') return json(await createCloudReview(env).listSources());
      if (path === '/api/audit' && request.method === 'GET') return json(await createCloudReview(env).warehouseAudit());
      const pdfRoute=path.match(/^\/api\/sources\/(CAREER-(?:0[1-9]|10)|BM(?:03|11|12))\/pdf$/);
      if(pdfRoute&&request.method==='GET')return await createCloudReview(env).openPDF(pdfRoute[1]!);
      if (path === '/api/library/upload' && request.method === 'POST') {
        requireMutation(request,env,session,'application/octet-stream');
        const header=request.headers.get('X-File-Metadata');let metadata:unknown;
        if(!header||header.length>6000)throw new CatalogError('FILE_METADATA_INVALID');
        try {metadata=JSON.parse(decodeURIComponent(header));} catch {throw new CatalogError('FILE_METADATA_INVALID');}
        return json(await uploadFile(env,session,metadata,await readUpload(request)));
      }
      const fileRoute=path.match(/^\/api\/library\/files\/([a-f0-9-]{36})$/);
      if(fileRoute&&request.method==='GET')return await downloadFile(env,fileRoute[1]!);
      const route = path.match(/^\/api\/posts\/([^/]+)(?:\/(save|restore|image|audit|review|artwork))?$/);
      if (route) {
        const id = decodeURIComponent(route[1]!);
        if (id.length > 300) return json({ code: 'INVALID_POST_ID' }, 400);
        if (!route[2] && request.method === 'GET') return json(await cloudPost(env, id));
        if(route[2]==='audit'&&request.method==='GET')return json(await createCloudReview(env).auditPost(id));
        if(route[2]==='artwork'&&request.method==='POST'){
          requireMutation(request,env,session,'application/octet-stream');
          const header=request.headers.get('X-Design-Metadata');let metadata:unknown;
          if(!header||header.length>12000)throw new CatalogError('DESIGN_INVALID');
          try{metadata=JSON.parse(decodeURIComponent(header));}catch{throw new CatalogError('DESIGN_INVALID');}
          return json(await saveArtwork(env,session,id,metadata,await readUpload(request)));
        }
        if (route[2] && request.method === 'POST') {
          requireMutation(request, env, session);
          if(route[2]==='review')return json(await createCloudReview(env).reviewPost(id,session,await input(request)));
          if(route[2]==='audit')return json({code:'METHOD_NOT_ALLOWED'},405);
          if(route[2]==='image') {
            const data=await input(request) as Record<string,unknown>|null;
            if(!data||typeof data!=='object'||typeof data.libraryId!=='string'||data.libraryId.length>100)throw new CatalogError('IMAGE_NOT_AVAILABLE');
            const current=await cloudPost(env,id);
            return json(await saveCloudCaption(env,session,id,{expectedVersion:data.expectedVersion,requestId:data.requestId,
              title:current.title,body:current.body,sourceNote:current.sourceNote},false,data.libraryId));
          }
          return json(await saveCloudCaption(env, session, id, await input(request), route[2] === 'restore'));
        }
        return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      }
      if (['/', '/manager.html', '/manager.js','/artwork.js','/artwork-ui.js','/backups.js','/zip.js','/telegram-ui.js','/meta-ui.js','/meta-trial-ui.js','/daily-ui.js','/content-trial-ui.js'].includes(path) && request.method === 'GET') return asset(request, env, path === '/' ? '/manager.html' : undefined);
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
    // A durable send intent survives any error; the next tick reconciles before sending.
    let dailyState='unconfigured';
    try{dailyState=(await runDaily(env)).state;}catch{
      dailyState='runtime_error';
      if(env.DAILY_PUBLISHING_ENABLED==='true')await env.DB!.prepare('INSERT INTO notification_outbox(event_id,payload_json) VALUES(?,?) ON CONFLICT(event_id) DO NOTHING').bind('daily-runtime:'+new Date().toISOString().slice(0,10),JSON.stringify({kind:'connection_error',environment:'staging',title:'Luồng đăng bài cần kiểm tra; đối soát trước khi gửi lại'})).run();
    }
    // Defer notification delivery to the next tick after a send/recovery-heavy invocation.
    if(!['unconfigured','paused','not_due','prepared','day_complete','reconciliation_required'].includes(dailyState))return;
    // Give the real publishing preparation/send priority; presence only reads Facebook.
    if(['unconfigured','paused','not_due','day_complete'].includes(dailyState)){
      const presence=await scanPresence(env);if(presence.state==='processed')return;
    }
    await monitorContentTrial(env);
    await monitorMetaExpiry(env);
    await dispatchTelegram(env);
  },
};
