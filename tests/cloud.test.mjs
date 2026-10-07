import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { openCatalog } from '../scripts/catalog-store.mjs';
import { prepareCloud } from '../scripts/cloud-prepare.mjs';
import worker from '../src/cloud/worker.ts';
import { recordHeartbeat, HEARTBEAT_CRON } from '../src/cloud/runtime.ts';
import { deploymentSettings, ensureStagingResources, verifyStaging, ensureSessionSecret } from '../scripts/cloud-deploy.mjs';

test('Session signing secret is created once in Cloudflare without overwriting an existing key', async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'fixture-only-token' };
  const calls = [];
  await ensureSessionSecret(env, async (url, options) => {
    calls.push({ url, options });
    return Response.json(options.method === 'PUT' ? { success: true } : { success: true, result: [{ name: 'GOOGLE_CLIENT_SECRET' }] });
  });
  assert.equal(calls.length, 2); assert.match(calls[0].url, /\/workers\/scripts\/nttu-publisher-staging\/secrets$/);
  const body = JSON.parse(calls[1].options.body); assert.equal(body.name, 'SESSION_SIGNING_KEY');
  assert.match(body.text, /^[a-f0-9]{64}$/); assert.equal(body.type, 'secret_text');
  let existingCalls = 0;
  await ensureSessionSecret(env, async () => { existingCalls++; return Response.json({ success: true, result: [{ name: 'GOOGLE_CLIENT_SECRET' }, { name: 'SESSION_SIGNING_KEY' }] }); });
  assert.equal(existingCalls, 1);
  await assert.rejects(ensureSessionSecret(env, async () => Response.json({ success: true, result: [] })));
  await assert.rejects(ensureSessionSecret(env, async () => Response.json({ success: false }, { status: 403 })));
});

const token = 'test-only-' + 'x'.repeat(40);
function fixture() {
  const db = openCatalog(); db.exec(readFileSync('cloud/runtime.sql', 'utf8'));
  const env = { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured', STAGING_HEALTH_TOKEN: token,
    DB: { prepare(sql) { let args = []; return {
      bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { return db.prepare(sql).run(...args); },
    }; } } };
  return { db, env };
}
const request = (path, authorized = false) => new Request('https://staging.invalid' + path,
  { headers: authorized ? { Authorization: 'Bearer ' + token } : {} });

test('staging liveness exposes no database or account data, and makes no D1 call', async () => {
  const response = await worker.fetch(request('/health'), { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured' });
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.databaseChecked, false);
  assert.equal(body.schedulerImplemented, true); assert.equal(body.publishingImplemented, true);
  assert.equal(body.environment, 'staging');
});
test('cloud foundation rejects missing, local, fake and production configurations', async () => {
  for (const env of [{}, { APP_ENV: 'local', INTEGRATION_MODE: 'fake' },
    { APP_ENV: 'production', INTEGRATION_MODE: 'unconfigured' }, { APP_ENV: 'staging', INTEGRATION_MODE: 'fake' }]) {
    assert.equal((await worker.fetch(request('/health'), env)).status, 503);
    await assert.rejects(recordHeartbeat({ cron: HEARTBEAT_CRON, scheduledTime: 1 }, env));
  }
});
test('D1 status is private and fails closed when the token is absent or incorrect', async () => {
  const { db, env } = fixture(); try {
    assert.equal((await worker.fetch(request('/api/staging/status'), env)).status, 401);
    assert.equal((await worker.fetch(request('/api/staging/status', true), { ...env, STAGING_HEALTH_TOKEN: 'short' })).status, 401);
    const response = await worker.fetch(request('/api/staging/status', true), env);
    assert.equal(response.status, 200); assert.equal((await response.json()).paused, true);
  } finally { db.close(); }
});
test('missing or mismatched D1 schema/identity/pause returns sanitized unavailable status', async () => {
  const { db, env } = fixture(); try {
    for (const changed of [{ ...env, DB: undefined }]) {
      if (changed === env) db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'");
      const response = await worker.fetch(request('/api/staging/status', true), changed);
      assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'DATABASE_NOT_READY' });
    }
    db.exec("UPDATE application_state SET paused_by_user=1 WHERE environment='staging'; DELETE FROM schema_migrations WHERE name='0006_editor.sql'");
    assert.equal((await worker.fetch(request('/api/staging/status', true), env)).status, 503);
  } finally { db.close(); }
});
test('heartbeat is monotonic and duplicate-safe, without altering publication state', async () => {
  const { db, env } = fixture(); try {
    for (const scheduledTime of [1000, 1000, 999, 2000]) await worker.scheduled({ cron: HEARTBEAT_CRON, scheduledTime }, env);
    const row = db.prepare('SELECT * FROM cloud_runtime').get();
    assert.equal(row.heartbeat_count, 2); assert.equal(row.last_scheduled_at, 2000);
    assert.equal(db.prepare('SELECT count(*) AS n FROM publish_jobs').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM application_state WHERE paused_by_user=1').get().n, 3);
    assert.equal(db.prepare('SELECT last_run_at FROM application_state WHERE environment=?').get('staging').last_run_at, null);
  } finally { db.close(); }
});
test('unexpected cron and malformed scheduled times cannot write heartbeat', async () => {
  const { db, env } = fixture(); try {
    for (const event of [{ cron: '0 3 * * *', scheduledTime: 1 }, { cron: HEARTBEAT_CRON, scheduledTime: NaN }]) {
      await assert.rejects(worker.scheduled(event, env));
    }
    assert.equal(db.prepare('SELECT heartbeat_count FROM cloud_runtime').get().heartbeat_count, 0);
  } finally { db.close(); }
});
test('cloud exposes only login publicly and blocks private GUI, content, source and publishing', async () => {
  const { db, env } = fixture(); try {
    assert.equal((await worker.fetch(request('/'), env)).status, 200);
    assert.equal((await worker.fetch(request('/manager.html'), env)).status, 401);
    for (const path of ['/assets/sources/BM03.pdf', '/editor-assets/anything.png']) assert.equal((await worker.fetch(request(path, true), env)).status, 404);
    assert.equal((await worker.fetch(request('/api/editor/posts'), env)).status, 401);
    for (const path of ['/api/publishing/resume', '/api/trial-publish']) assert.equal((await worker.fetch(request(path, true), env)).status, 501);
    assert.equal((await worker.fetch(new Request('https://staging.invalid/api/staging/status', { method: 'POST' }), env)).status, 401);
  } finally { db.close(); }
});
test('cloud migration preparation preserves original schema hashes and never imports private data', () => {
  const { directory, config } = prepareCloud({ output: 'tmp/tests/cloud-preparation' });
  assert.equal(config.vars.APP_ENV, 'staging'); assert.deepEqual(config.triggers.crons, [HEARTBEAT_CRON]);
  assert.equal(config.keep_vars, true);
  assert.equal(config.assets.run_worker_first, true); assert.equal('r2_buckets' in config, false);
  const storage = prepareCloud({ output: 'tmp/tests/cloud-storage-preparation', storageEnabled: true }).config;
  assert.deepEqual(storage.r2_buckets, [{ binding: 'MEDIA', bucket_name: 'nttu-publisher-staging-assets' }]);
  const db = new DatabaseSync(':memory:'); try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of readdirSync(directory + '/migrations').sort()) db.exec(readFileSync(directory + '/migrations/' + name, 'utf8'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM posts').get().n, 40);
    const reference = openCatalog(); try {
      assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY name').all(), reference.prepare('SELECT * FROM schema_migrations ORDER BY name').all());
    } finally { reference.close(); }
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
  assert.throws(() => prepareCloud({ output: '../escape' }));
  assert.throws(() => prepareCloud({ databaseId: 'bad' }));
});
test('deployment refuses placeholders, production targets and incomplete release identity', () => {
  const valid = { STAGING_D1_DATABASE_ID: '12345678-1234-1234-1234-123456789abc',
    GITHUB_SHA: 'a'.repeat(40), STAGING_HEALTH_TOKEN: 'b'.repeat(64),
    STAGING_WORKER_URL: 'https://nttu-publisher-staging.example.workers.dev',
    CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), CLOUDFLARE_API_TOKEN: 'test-only-token' };
  assert.equal(deploymentSettings(valid).releaseSha, valid.GITHUB_SHA);
  for (const patch of [{ STAGING_D1_DATABASE_ID: '00000000-0000-0000-0000-000000000000' },
    { GITHUB_SHA: 'main' }, { STAGING_HEALTH_TOKEN: 'weak' },
    { STAGING_WORKER_URL: 'https://nttu-publisher-production.example.workers.dev' },
    { STAGING_WORKER_URL: 'https://nttu-publisher-staging.example.workers.dev/extra' },
    { CLOUDFLARE_API_TOKEN: '' }]) assert.throws(() => deploymentSettings({ ...valid, ...patch }));
});
test('heartbeat continues when a configured schedule is unpaused', async () => {
  const { db, env } = fixture(); try {
    const prepare = env.DB.prepare;
    env.DB.prepare = sql => {
      if (sql.startsWith('UPDATE cloud_runtime')) db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'");
      return prepare(sql);
    };
    await recordHeartbeat({ cron: HEARTBEAT_CRON, scheduledTime: 1000 }, env);
    assert.equal(db.prepare('SELECT heartbeat_count FROM cloud_runtime').get().heartbeat_count, 1);
  } finally { db.close(); }
});
test('deployment validates D1 identity and preserves an existing account subdomain', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET' });
    return Response.json({ success: true, result: url.includes('/d1/') ? { name: 'nttu-publisher-staging' } : { subdomain: 'example' } });
  };
  const settings = { databaseId: 'test-id', url: 'https://nttu-publisher-staging.example.workers.dev' };
  await ensureStagingResources(settings, { CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_API_TOKEN: 'test-only' }, fetcher);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.method === 'GET'));
  await assert.rejects(ensureStagingResources({ ...settings, url: 'https://nttu-publisher-staging.different.workers.dev' }, {}, fetcher), /differs/);
  await assert.rejects(ensureStagingResources(settings, {}, async () => Response.json({ success: true, result: { name: 'production' } })), /D1 identity/);
});
test('account subdomain is created only for the explicit not-registered error, never for missing permission', async () => {
  const settings = { databaseId: 'test-id', url: 'https://nttu-publisher-staging.example.workers.dev' };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(options.method ?? 'GET');
    if (url.includes('/d1/')) return Response.json({ success: true, result: { name: 'nttu-publisher-staging' } });
    if (options.method === 'PUT') { assert.equal(JSON.parse(options.body).subdomain, 'example'); return Response.json({ success: true, result: { subdomain: 'example' } }); }
    return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
  };
  await ensureStagingResources(settings, {}, fetcher); assert.deepEqual(calls, ['GET', 'GET', 'PUT']);
  let mutations = 0;
  await assert.rejects(ensureStagingResources(settings, {}, async (url, options) => {
    if (options.method === 'PUT') mutations++;
    return url.includes('/d1/') ? Response.json({ success: true, result: { name: 'nttu-publisher-staging' } })
      : Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 });
  }), /permissions/);
  assert.equal(mutations, 0);
});
test('first-deployment verification tolerates transient DNS failure and still verifies identity/privacy', async () => {
  let time = 0, calls = 0;
  const settings = { url: 'https://staging.invalid', releaseSha: 'a'.repeat(40), token: 'test-only' };
  await verifyStaging(settings, { now: () => time, pause: async milliseconds => { time += milliseconds; }, timeoutMs: 20000,
    fetcher: async (url, options) => {
      if (++calls <= 2) throw new TypeError('Temporary DNS failure');
      if (url.endsWith('/health')) return Response.json({ release: settings.releaseSha, environment: 'staging', publishingImplemented: true, schedulerImplemented: true });
      return options.headers ? Response.json({ paused: true, databaseChecked: true }) : Response.json({}, { status: 401 });
    } });
  assert.equal(time, 10000); assert.equal(calls, 5);
});
test('deployment verification times out without accepting wrong release, unpaused state or public private status', async () => {
  const settings = { url: 'https://staging.invalid', releaseSha: 'a'.repeat(40), token: 'test-only' };
  for (const failure of ['release', 'paused', 'privacy']) {
    let time = 0;
    await assert.rejects(verifyStaging(settings, { now: () => time, pause: async milliseconds => { time += milliseconds; }, timeoutMs: 10000,
      fetcher: async (url, options) => {
        if (url.endsWith('/health')) return Response.json({ release: failure === 'release' ? 'wrong' : settings.releaseSha, environment: 'staging', publishingImplemented: true, schedulerImplemented: true });
        return options.headers ? Response.json({ paused: failure !== 'paused', databaseChecked: true }) : Response.json({}, { status: failure === 'privacy' ? 200 : 401 });
      } }), /bounded waiting/);
    assert.equal(time, 10000);
  }
});

test('Live UI deployment rejects backend/schema changes and verifies unchanged enabled state',async()=>{
 const {assertLiveUiChanges}=await import('../scripts/cloud-deploy.mjs');
 assert.doesNotThrow(()=>assertLiveUiChanges(['ui/cloud/manager.js','scripts/cloud-deploy.mjs','tests/cloud.test.mjs']));
 for(const path of ['src/cloud/daily.ts','cloud/daily.sql','scripts/cloud-prepare.mjs','.github/workflows/ci.yml'])assert.throws(()=>assertLiveUiChanges(['ui/cloud/manager.js',path]),/pause required/);
 const settings={url:'https://staging.invalid',releaseSha:'a'.repeat(40),token:'fixture'};
 for(const changed of [false,true]){let time=0;const fn=()=>verifyStaging(settings,{expectedState:{paused:false,publishingEnabled:true},now:()=>time,pause:async n=>{time+=n;},timeoutMs:1000,fetcher:async(url,opts)=>url.endsWith('/health')?Response.json({release:settings.releaseSha,environment:'staging',publishingImplemented:true,schedulerImplemented:true}):opts.headers?Response.json({paused:changed,publishingEnabled:!changed,databaseChecked:true}):Response.json({}, {status:401})});if(changed)await assert.rejects(fn(),/schedule-state/);else await fn();}
});
test('Deployment preflight refuses unavailable or inconsistent schedule state',async()=>{const {deploymentState}=await import('../scripts/cloud-deploy.mjs');const settings={url:'https://staging.invalid',token:'fixture'};for(const response of [Response.json({code:'DATABASE_NOT_READY'},{status:503}),Response.json({environment:'staging',databaseChecked:true,paused:false,publishingEnabled:false}),Response.json({}, {status:401})])await assert.rejects(deploymentState(settings,async()=>response),/schedule state/);assert.deepEqual(await deploymentState(settings,async()=>Response.json({environment:'staging',databaseChecked:true,paused:true,publishingEnabled:false})),{paused:true,publishingEnabled:false});});

test('External monitor deployment preserves active backend/schema restrictions',async()=>{const {assertLiveUiChanges}=await import('../scripts/cloud-deploy.mjs');assert.doesNotThrow(()=>assertLiveUiChanges(['scripts/monitor.mjs','tests/monitor.test.mjs','.github/workflows/monitor.yml','docs/steps/29-independent-monitor.md']));for(const path of ['src/cloud/worker.ts','cloud/runtime.sql','scripts/cloud-prepare.mjs','.github/workflows/other.yml'])assert.throws(()=>assertLiveUiChanges([path]),/pause required/);});

test('Active deployment permits only the exact login status wording replacement in the worker',async()=>{const {loginStatusCopyOnly,assertLiveUiChanges}=await import('../scripts/cloud-deploy.mjs');const before='prefix<small>Lịch đăng Facebook đang dừng.</small>suffix',after='prefix<small>Đăng nhập để xem trạng thái lịch đăng Facebook.</small>suffix';assert.equal(loginStatusCopyOnly(before,after),true);for(const changed of [after+'backend change',after.replace('prefix','modified'),before])assert.equal(loginStatusCopyOnly(before,changed),false);assert.equal(loginStatusCopyOnly(before+before,after+after),false);assert.doesNotThrow(()=>assertLiveUiChanges(['src/cloud/worker.ts','docs/steps/30-operational-acceptance.md'],false,true));assert.throws(()=>assertLiveUiChanges(['src/cloud/worker.ts']),/pause required/);assert.throws(()=>assertLiveUiChanges(['src/cloud/worker.ts','src/cloud/daily.ts'],false,true),/pause required/);});

test('Only full-history checkout addition is allowed as an active UI workflow exception',async()=>{const {historyCheckoutOnly,assertLiveUiChanges}=await import('../scripts/cloud-deploy.mjs');const before='steps:\n  persist-credentials: false\nnext:\n';const after='steps:\n  persist-credentials: false\n  fetch-depth: 0\nnext:\n';assert.equal(historyCheckoutOnly(before,after),true);assert.equal(historyCheckoutOnly(before,after.replace('false','true')),false);assert.equal(historyCheckoutOnly(before,after+'permissions: write-all\n'),false);assert.doesNotThrow(()=>assertLiveUiChanges(['.github/workflows/ci.yml'],true));assert.throws(()=>assertLiveUiChanges(['.github/workflows/ci.yml'],false),/pause required/);});
