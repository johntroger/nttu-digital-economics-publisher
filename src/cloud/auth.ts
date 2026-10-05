import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { POLICY } from '../domain/policy.ts';
import type { CloudBindings } from './runtime.ts';
const SESSION = '__Host-nttu_session', FLOW = '__Host-nttu_oauth';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 5000 });
export interface OwnerSession { email: string; sub: string; csrf: string }
export class AuthError extends Error {}
function config(env: CloudBindings) {
  if (!env.AUTH_ORIGIN || !/^https:\/\/nttu-publisher-staging\.[a-z0-9-]+\.workers\.dev$/.test(env.AUTH_ORIGIN)
    || !env.GOOGLE_CLIENT_ID || !/^[\w-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID)
    || !env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET.length < 10
    || !env.SESSION_SIGNING_KEY || !/^[a-f0-9]{64}$/i.test(env.SESSION_SIGNING_KEY)) throw new AuthError('AUTH_NOT_CONFIGURED');
  return { origin: env.AUTH_ORIGIN, id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET,
    key: new TextEncoder().encode(env.SESSION_SIGNING_KEY) };
}
export function authConfigured(env: CloudBindings): boolean { try { config(env); return true; } catch { return false; } }
function random() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join(''); }
function cookie(request: Request, name: string) {
  const found = (request.headers.get('Cookie') ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith(name + '='));
  return found.length === 1 ? found[0]!.slice(name.length + 1) : '';
}
const setCookie = (name: string, token: string, age: number) => `${name}=${token}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
export const clearSessionCookie = () => setCookie(SESSION, '', 0);
const clearFlow = () => setCookie(FLOW, '', 0);
function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const item of cookies) headers.append('Set-Cookie', item);
  return new Response(null, { status: 302, headers });
}
export async function startGoogle(request: Request, env: CloudBindings): Promise<Response> {
  const cfg = config(env);
  if (new URL(request.url).origin !== cfg.origin) throw new AuthError('AUTH_ORIGIN_INVALID');
  const state = random(), nonce = random(), verifier = random();
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...hash)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const flow = await new SignJWT({ state, nonce, verifier }).setProtectedHeader({ alg: 'HS256', typ: 'nttu-flow+jwt' })
    .setIssuer(cfg.origin).setAudience('nttu-google-flow').setIssuedAt().setExpirationTime('10m').sign(cfg.key);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [key, value] of Object.entries({ client_id: cfg.id, response_type: 'code', scope: 'openid email',
    redirect_uri: cfg.origin + '/auth/google/callback', state, nonce, code_challenge: challenge,
    code_challenge_method: 'S256', prompt: 'select_account' })) url.searchParams.set(key, value);
  return redirect(url.href, [setCookie(FLOW, flow, 600)]);
}
export async function verifyGoogleIdentity(token: string, env: CloudBindings, nonce: string, keys: JWTVerifyGetKey = googleKeys): Promise<{ sub: string; email: string }> {
  const cfg = config(env);
  const { payload } = await jwtVerify(token, keys, { algorithms: ['RS256'], audience: cfg.id,
    issuer: ['https://accounts.google.com', 'accounts.google.com'], clockTolerance: 30, maxTokenAge: '2h' });
  if (!payload.exp || typeof payload.sub !== 'string' || !payload.sub || payload.nonce !== nonce
    || (payload.azp !== undefined && payload.azp !== cfg.id)) throw new AuthError('GOOGLE_IDENTITY_INVALID');
  if (payload.email_verified !== true || payload.email !== POLICY.ownerEmail) throw new AuthError('GOOGLE_OWNER_REQUIRED');
  return { sub: payload.sub, email: POLICY.ownerEmail };
}
export async function completeGoogle(request: Request, env: CloudBindings,
  { fetcher = fetch, keys = googleKeys }: { fetcher?: typeof fetch; keys?: JWTVerifyGetKey } = {}): Promise<Response> {
  const cfg = config(env), url = new URL(request.url);
  let reason = 'flow';
  try {
    if (url.origin !== cfg.origin || url.searchParams.has('error') || url.searchParams.getAll('state').length !== 1
      || url.searchParams.getAll('code').length !== 1) throw new AuthError('OAUTH_CALLBACK_INVALID');
    const { payload } = await jwtVerify(cookie(request, FLOW), cfg.key, { algorithms: ['HS256'], issuer: cfg.origin, audience: 'nttu-google-flow', typ: 'nttu-flow+jwt' });
    if (typeof payload.state !== 'string' || payload.state !== url.searchParams.get('state')
      || typeof payload.nonce !== 'string' || typeof payload.verifier !== 'string') throw new AuthError('OAUTH_STATE_INVALID');
    const code = url.searchParams.get('code')!;
    if (!code || code.length > 4096) throw new AuthError('OAUTH_CODE_INVALID');
    reason = 'exchange';
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
        code, client_id: cfg.id, client_secret: cfg.secret, grant_type: 'authorization_code',
        redirect_uri: cfg.origin + '/auth/google/callback', code_verifier: payload.verifier,
      }) });
    if (!response.ok) {
      // Only classify a known provider code; never forward descriptions, tokens or secrets.
      const rejected = await response.json().catch(() => ({})) as { error?: unknown };
      if (rejected.error === 'invalid_client') reason = 'client';
      else if (rejected.error === 'invalid_grant') reason = 'grant';
      throw new AuthError('GOOGLE_TOKEN_FAILED');
    }
    const tokens = await response.json() as { id_token?: unknown };
    if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 20000) throw new AuthError('GOOGLE_TOKEN_INVALID');
    reason = 'identity';
    const owner = await verifyGoogleIdentity(tokens.id_token, env, payload.nonce, keys);
    reason = 'session';
    const session = await new SignJWT({ email: owner.email, csrf: random() }).setProtectedHeader({ alg: 'HS256', typ: 'nttu-session+jwt' })
      .setSubject(owner.sub).setIssuer(cfg.origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(cfg.key);
    return redirect('/', [setCookie(SESSION, session, 3600), clearFlow()]);
  } catch (error) {
    if (error instanceof AuthError && error.message === 'GOOGLE_OWNER_REQUIRED') reason = 'owner';
    return redirect('/?login=failed&reason=' + reason, [clearSessionCookie(), clearFlow()]);
  }
}
export async function ownerSession(request: Request, env: CloudBindings): Promise<OwnerSession | null> {
  try {
    const cfg = config(env);
    if (new URL(request.url).origin !== cfg.origin) return null;
    const { payload } = await jwtVerify(cookie(request, SESSION), cfg.key, {
      algorithms: ['HS256'], issuer: cfg.origin, audience: 'nttu-manager', typ: 'nttu-session+jwt', maxTokenAge: '1h',
    });
    if (payload.email !== POLICY.ownerEmail || !payload.exp || typeof payload.sub !== 'string' || !payload.sub
      || typeof payload.csrf !== 'string' || !/^[a-f0-9]{64}$/.test(payload.csrf)) return null;
    return { email: POLICY.ownerEmail, sub: payload.sub, csrf: payload.csrf };
  } catch { return null; }
}
export function requireMutation(request: Request, env: CloudBindings, session: OwnerSession): void {
  if (request.headers.get('Origin') !== config(env).origin || request.headers.get('X-CSRF-Token') !== session.csrf
    || request.headers.get('Content-Type') !== 'application/json') throw new AuthError('CSRF_REQUIRED');
}
