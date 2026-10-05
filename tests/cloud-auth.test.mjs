import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, jwtVerify } from 'jose';
import { startGoogle, completeGoogle, verifyGoogleIdentity, ownerSession, requireMutation, authConfigured, probeGoogleExchange } from '../src/cloud/auth.ts';
import worker from '../src/cloud/worker.ts';
import { POLICY } from '../src/domain/policy.ts';

const env = { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured',
  AUTH_ORIGIN: 'https://nttu-publisher-staging.example.workers.dev',
  GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-only-secret', SESSION_SIGNING_KEY: 'a'.repeat(64) };
const key = new TextEncoder().encode(env.SESSION_SIGNING_KEY);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = await exportJWK(publicKey); jwk.kid = 'fixture';
const keys = createLocalJWKSet({ keys: [jwk] });
const request = (path, cookie = '', extra = {}) => new Request(env.AUTH_ORIGIN + path, { headers: { Cookie: cookie, ...extra } });
async function identity(nonce, changes = {}, signingKey = privateKey) {
  return new SignJWT({ nonce, email: POLICY.ownerEmail, email_verified: true, ...changes })
    .setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setSubject('google-owner-id')
    .setIssuer('https://accounts.google.com').setAudience(env.GOOGLE_CLIENT_ID)
    .setIssuedAt().setExpirationTime('5m').sign(signingKey);
}
async function session(changes = {}, secret = key, expiration = '1h') {
  return new SignJWT({ email: POLICY.ownerEmail, csrf: 'c'.repeat(64), ...changes })
    .setProtectedHeader({ alg: 'HS256', typ: 'nttu-session+jwt' }).setSubject('google-owner-id')
    .setIssuer(env.AUTH_ORIGIN).setAudience('nttu-manager').setIssuedAt().setExpirationTime(expiration).sign(secret);
}
test('OAuth starts with signed flow, state, nonce, PKCE and minimal scopes', async () => {
  const response = await startGoogle(request('/auth/google/start'), env);
  const url = new URL(response.headers.get('Location'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), 'openid email');
  assert.equal(url.searchParams.get('redirect_uri'), env.AUTH_ORIGIN + '/auth/google/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /Secure; HttpOnly; SameSite=Lax/);
  const { payload } = await jwtVerify(cookie.split(';')[0].split('=')[1], key);
  assert.equal(payload.state, url.searchParams.get('state')); assert.equal(payload.nonce, url.searchParams.get('nonce'));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload.verifier));
  assert.equal(Buffer.from(digest).toString('base64url'), url.searchParams.get('code_challenge'));
  await assert.rejects(startGoogle(new Request('https://other.invalid/auth/google/start'), env));
});
test('Google identity rejects wrong owner, nonce, unverified email, azp, expiry, audience and signature', async () => {
  assert.equal((await verifyGoogleIdentity(await identity('nonce'), env, 'nonce', keys)).email, POLICY.ownerEmail);
  for (const change of [{ email: 'other@example.com' }, { email_verified: false }, { email_verified: 'true' }, { nonce: 'wrong' }, { azp: 'other' }]) {
    await assert.rejects(verifyGoogleIdentity(await identity('nonce', change), env, 'nonce', keys));
  }
  const wrongAudience = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer('https://accounts.google.com').setAudience('other').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await assert.rejects(verifyGoogleIdentity(wrongAudience, env, 'nonce', keys));
  const expired = await new SignJWT({ nonce: 'nonce' }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer('https://accounts.google.com').setAudience(env.GOOGLE_CLIENT_ID).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)-60).sign(privateKey);
  await assert.rejects(verifyGoogleIdentity(expired, env, 'nonce', keys));
  const foreign = await generateKeyPair('RS256');
  await assert.rejects(verifyGoogleIdentity(await identity('nonce', {}, foreign.privateKey), env, 'nonce', keys));
});
test('Callback exchanges only a validated flow and creates a restricted owner session', async () => {
  const start = await startGoogle(request('/auth/google/start'), env);
  const url = new URL(start.headers.get('Location')), cookie = start.headers.getSetCookie()[0].split(';')[0];
  const callback = '/auth/google/callback?code=fixture-code&state=' + url.searchParams.get('state');
  let calls = 0;
  const fetcher = async (endpoint, options) => {
    calls++; assert.equal(endpoint, 'https://oauth2.googleapis.com/token'); assert.equal(options.redirect, 'error');
    assert.equal(typeof options.body, 'string');
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('client_id'), env.GOOGLE_CLIENT_ID);
    assert.equal(form.get('redirect_uri'), env.AUTH_ORIGIN + '/auth/google/callback');
    return Response.json({ id_token: await identity(url.searchParams.get('nonce')) });
  };
  const success = await completeGoogle(request(callback, cookie), env, { fetcher, keys });
  assert.equal(success.headers.get('Location'), '/'); assert.equal(calls, 1);
  const ownerCookie = success.headers.getSetCookie().find(item => item.startsWith('__Host-nttu_session=')).split(';')[0];
  assert.equal((await ownerSession(request('/', ownerCookie), env)).email, POLICY.ownerEmail);
  for (const [path, cookies] of [[callback, ''], [callback.replace(/state=.*/, 'state=wrong'), cookie], [callback + '&code=duplicate', cookie]]) {
    const failed = await completeGoogle(request(path, cookies), env, { fetcher, keys });
    assert.equal(failed.headers.get('Location'), '/?login=failed&reason=flow');
  }
  assert.equal(calls, 1);
  const refused = await completeGoogle(request(callback, cookie), env, { fetcher: async () => new Response('', { status: 400 }), keys });
  assert.equal(refused.headers.get('Location'), '/?login=failed&reason=provider');
  for (const [error,reason] of [['invalid_client','client'],['invalid_grant','grant'],['arbitrary <script> secret','provider']]) {
    const failed = await completeGoogle(request(callback,cookie),env,{keys,fetcher:async()=>Response.json({error,error_description:'private fixture value'},{status:400})});
    assert.equal(failed.headers.get('Location'),'/?login=failed&reason='+reason);
  }
  const other = await completeGoogle(request(callback,cookie),env,{keys,fetcher:async()=>Response.json({id_token:await identity(url.searchParams.get('nonce'),{email:'other@example.com'})})});
  assert.equal(other.headers.get('Location'),'/?login=failed&reason=owner');
  const untrusted = await worker.fetch(request('/?login=failed&reason=%3Cscript%3E'),env);
  assert.doesNotMatch(await untrusted.text(),/<script>/);
});
test('Server exchange diagnostics return only safe categories and never response details', async () => {
  assert.deepEqual(await probeGoogleExchange(env, async () => Response.json({error:'invalid_client',error_description:'private fixture value'},{status:401})),{category:'client',status:401});
  assert.deepEqual(await probeGoogleExchange(env, async () => {throw new TypeError('private internal detail');}),{category:'network',status:null});
  assert.deepEqual(await probeGoogleExchange(env, async () => {throw new DOMException('private detail','TimeoutError');}),{category:'timeout',status:null});
  assert.deepEqual(await probeGoogleExchange(env, async () => Response.json({error:'invalid_grant'},{status:400})),{category:'grant',status:400});
  assert.deepEqual(await probeGoogleExchange(env, async () => Response.json({access_token:'private fixture value'})),{category:'response',status:200});
  assert.equal((await worker.fetch(request('/api/staging/auth-check'),env)).status,401);
});
test('Session cookies fail closed for tamper, expiration, wrong owner, duplicate cookie and key rotation', async () => {
  const good = '__Host-nttu_session=' + await session();
  assert.ok(await ownerSession(request('/', good), env));
  for (const cookie of ['__Host-nttu_session=' + await session({ email: 'other@example.com' }),
    '__Host-nttu_session=' + await session({}, key, Math.floor(Date.now()/1000)-10),
    '__Host-nttu_session=' + await session({}, new TextEncoder().encode('b'.repeat(64))), good + '; ' + good, good + 'tamper']) {
    assert.equal(await ownerSession(request('/', cookie), env), null);
  }
  assert.equal(await ownerSession(request('/', good), { ...env, SESSION_SIGNING_KEY: 'b'.repeat(64) }), null);
  assert.equal(authConfigured({ ...env, GOOGLE_CLIENT_SECRET: undefined }), false);
});
test('Management authorization requires owner cookie; mutations require exact Origin and CSRF; logout clears cookie', async () => {
  const cookie = '__Host-nttu_session=' + await session();
  assert.equal((await worker.fetch(request('/api/me'), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/me', cookie), env)).status, 200);
  const owner = await ownerSession(request('/', cookie), env);
  assert.throws(() => requireMutation(request('/', cookie), env, owner));
  const headers = { Cookie: cookie, Origin: env.AUTH_ORIGIN, 'X-CSRF-Token': owner.csrf, 'Content-Type': 'application/json' };
  for (const change of [{ Origin: 'https://other.invalid' }, { 'X-CSRF-Token': 'wrong' }]) {
    assert.equal((await worker.fetch(new Request(env.AUTH_ORIGIN + '/auth/logout', { method: 'POST', headers: { ...headers, ...change }, body: '{}' }), env)).status, 403);
  }
  const logout = await worker.fetch(new Request(env.AUTH_ORIGIN + '/auth/logout', { method: 'POST', headers, body: '{}' }), env);
  assert.equal(logout.status, 200); assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
});
