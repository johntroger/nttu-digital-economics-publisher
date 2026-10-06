// Real Workers runtime with local D1. No login, remote database, API or account required.
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { prepareCloud } from './cloud-prepare.mjs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { HEARTBEAT_CRON } from '../src/cloud/runtime.ts';
import { runManagementSmoke } from './cloud-management-smoke.mjs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {SignJWT} from 'jose';
import {POLICY} from '../src/domain/policy.ts';
const output = 'tmp/cloud-smoke/' + randomUUID();
const { directory } = prepareCloud({ output });
const configPath = resolve(directory, 'wrangler.json');
const cli = resolve('node_modules/wrangler/bin/wrangler.js');
const state = resolve(directory, 'state');
const token = randomBytes(32).toString('hex');
writeFileSync(resolve(directory, '.dev.vars'), 'STAGING_HEALTH_TOKEN=' + token + '\n');
const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
const run = args => {
  const result = spawnSync(process.execPath, [cli, ...args], { env: environment, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error('Wrangler check failed: ' + (result.stderr || result.stdout).replaceAll(token, '[redacted]'));
  return result.stdout;
};
mkdirSync(resolve(directory, 'bundle'), { recursive: true });
run(['deploy', '--dry-run', '--config', configPath, '--outdir', resolve(directory, 'bundle')]);
run(['d1', 'migrations', 'apply', 'DB', '--local', '--config', configPath, '--persist-to', state]);
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const child = spawn(process.execPath, [cli, 'dev', '--local', '--config', configPath, '--port', String(port), '--persist-to', state, '--test-scheduled'],
  { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
let exit; child.on('exit', code => { exit = code; });
const base = 'http://127.0.0.1:' + port;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  let started = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exit !== undefined) throw new Error('Workers runtime stopped');
    try { started = (await fetch(base + '/health')).status === 200; } catch {}
    if (started) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(started, 'Workers runtime did not start');
  assert((await fetch(base + '/api/staging/status')).status === 401, 'Status must be private');
  const status = async () => {
    const response = await fetch(base + '/api/staging/status', { headers: { Authorization: 'Bearer ' + token } });
    assert(response.status === 200, 'D1 status must be healthy'); return response.json();
  };
  const before = await status(); assert(before.paused === true && before.heartbeatCount === 0, 'Fresh D1 must start paused');
  const scheduled = await fetch(base + '/__scheduled?cron=' + encodeURIComponent(HEARTBEAT_CRON));
  assert(scheduled.status === 200, 'Scheduled handler must succeed');
  const after = await status(); assert(after.heartbeatCount === 1 && after.lastScheduledAt > 0, 'Cron must write to D1');
  assert((await fetch(base + '/api/trial-publish', { method: 'POST' })).status === 501, 'Publish must stay disabled');
    console.log('Cloud smoke passed: bundle, 13 D1 migrations, private status, scheduled heartbeat, publishing disabled. This is local emulation, not deployed cloud.');
} catch (error) {
  console.error(logs.replaceAll(token, '[redacted]')); throw error;
} finally {
  child.kill();
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
}
await runManagementSmoke();
await (await import('./cloud-workflow-smoke.mjs')).runCloudWorkflowSmoke({bundlePath:resolve(directory,'bundle/worker.js')});
// Exercise OAuth's actual fetch implementation inside workerd, not only Node mocks.
// This catches runtime differences such as unsupported redirect='error'. No Google request leaves this fixture.
let exchanges = 0, redirectFixture = false;
const oauth = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'oauth-fixture', modules: true,
  scriptPath: resolve(directory, 'bundle/worker.js'), compatibilityDate: '2026-10-05',
  bindings: { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured', STAGING_HEALTH_TOKEN: token,
    AUTH_ORIGIN: 'https://nttu-publisher-staging.example.workers.dev', GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'fixture-only-secret', SESSION_SIGNING_KEY: 'e'.repeat(64) },
  outboundService: async request => {
    exchanges++;
    assert(request.url === 'https://oauth2.googleapis.com/token', 'OAuth must use only the fixed token endpoint');
    const form = new URLSearchParams(await request.text());
    assert(form.get('grant_type') === 'authorization_code', 'OAuth form encoding must survive Workers runtime');
    assert(form.get('client_id') === 'fixture.apps.googleusercontent.com', 'OAuth client fixture must be preserved');
    if (redirectFixture) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid' } });
    return Response.json({ error: 'invalid_grant', error_description: 'fixture detail must remain private' }, { status: 400 });
  },
}] }));
try {
  const url = 'https://nttu-publisher-staging.example.workers.dev/api/staging/auth-check';
  assert((await oauth.dispatchFetch(url, { method: 'POST' })).status === 401, 'OAuth diagnostic must be bearer protected');
  assert(exchanges === 0, 'Anonymous diagnostic must not contact provider');
  const probe = () => oauth.dispatchFetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  const first = await (await probe()).json();
  assert(first.category === 'grant' && first.status === 400 && exchanges === 1, 'Real Workers fetch must reach provider and preserve safe error classification');
  redirectFixture = true;
  const second = await (await probe()).json();
  assert(second.category === 'provider' && second.status === 302 && exchanges === 2, 'OAuth must not follow provider redirects');
  console.log('OAuth Workers runtime passed: form POST, private diagnostic and redirects blocked; no real Google calls.');
} finally { await oauth.dispose(); }

// Verify native Workers fetch and JSON parsing for Telegram; provider stays inside fixture.
const telegramOrigin='https://nttu-publisher-staging.example.workers.dev',signing='a'.repeat(64);
let telegramCalls=0;
const telegram=new Miniflare(convertV4MiniflareOptions({workers:[{name:'telegram-fixture',modules:true,scriptPath:resolve(directory,'bundle/worker.js'),compatibilityDate:'2026-10-05',d1Databases:['DB'],bindings:{APP_ENV:'staging',INTEGRATION_MODE:'unconfigured',AUTH_ORIGIN:telegramOrigin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only-secret',SESSION_SIGNING_KEY:signing,TELEGRAM_BOT_TOKEN:'123456789:'+'t'.repeat(35)},outboundService:async request=>{telegramCalls++;assert(request.url.endsWith('/getUpdates'),'Telegram endpoint must be fixed');assert(request.method==='POST','Telegram JSON POST required');return Response.json({ok:true,result:[{message:{text:'/start',chat:{id:12345678,type:'private'}}}]});}}]}));
try{
  const db=await telegram.getD1Database('DB');
  for(const sql of ["CREATE TABLE cloud_runtime(id INTEGER,environment TEXT,last_scheduled_at INTEGER,heartbeat_count INTEGER)","INSERT INTO cloud_runtime VALUES(1,'staging',NULL,0)","CREATE TABLE application_state(environment TEXT,paused_by_user INTEGER)","INSERT INTO application_state VALUES('staging',1)","CREATE TABLE schema_migrations(name TEXT)","INSERT INTO schema_migrations VALUES('1'),('2'),('3'),('4'),('5'),('6')"])await db.prepare(sql).run();
  const jwt=await new SignJWT({email:POLICY.ownerEmail,csrf:'c'.repeat(64)}).setSubject('fixture').setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(telegramOrigin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signing));
  const response=await telegram.dispatchFetch(telegramOrigin+'/api/telegram/discover',{method:'POST',headers:{Cookie:'__Host-nttu_session='+jwt,Origin:telegramOrigin,'X-CSRF-Token':'c'.repeat(64),'Content-Type':'application/json'},body:'{}'});
  const result=await response.json();assert(response.status===200&&result.chatIds?.[0]==='12345678','Native Telegram fetch/JSON failed: '+JSON.stringify(result));assert(telegramCalls===1,'Exactly one fixture API call required');console.log('Telegram native Workers fetch passed: bounded JSON POST, private chat discovery; no external Telegram request.');
}finally{await telegram.dispose();}
