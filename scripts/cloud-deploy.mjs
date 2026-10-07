import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareCloud } from './cloud-prepare.mjs';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

export async function ensureSessionSecret(env, fetcher = fetch) {
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID
    + '/workers/scripts/nttu-publisher-staging/secrets';
  const headers = { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
  const response = await fetcher(endpoint, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok || !data.success || !Array.isArray(data.result)) throw new Error('Cannot check staging secret names');
  if (!data.result.some(item => item.name === 'GOOGLE_CLIENT_SECRET')) throw new Error('Store GOOGLE_CLIENT_SECRET in the staging Worker before deployment');
  if (data.result.some(item => item.name === 'SESSION_SIGNING_KEY')) return;
  // Generate once in memory and store only in Cloudflare. Never rotate on an ordinary deployment.
  const created = await fetcher(endpoint, { method: 'PUT', headers, redirect: 'error', signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ name: 'SESSION_SIGNING_KEY', text: randomBytes(32).toString('hex'), type: 'secret_text' }) });
  const result = await created.json();
  if (!created.ok || !result.success) throw new Error('Cannot create staging session signing secret');
}

export function deploymentSettings(env) {
  const databaseId = env.STAGING_D1_DATABASE_ID;
  const releaseSha = env.GITHUB_SHA;
  const token = env.STAGING_HEALTH_TOKEN;
  const url = new URL(env.STAGING_WORKER_URL ?? 'https://invalid.local');
  if (!databaseId || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(databaseId)) throw new Error('Real staging D1 ID required');
  if (!releaseSha || !/^[a-f0-9]{40}$/i.test(releaseSha)) throw new Error('Full release SHA required');
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('Staging health secret must be 32 random bytes encoded as hex');
  if (url.protocol !== 'https:' || !/^nttu-publisher-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
    || url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port) throw new Error('Expected staging workers.dev URL required');
  if (!env.CLOUDFLARE_ACCOUNT_ID || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID) || !env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare deployment credentials missing');
  return { databaseId, releaseSha, token, url: url.origin };
}
export async function ensureStagingResources(settings, env, fetcher = fetch) {
  const prefix = 'https://api.cloudflare.com/client/v4/accounts/' + env.CLOUDFLARE_ACCOUNT_ID;
  const headers = { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
  const database = await fetcher(prefix + '/d1/database/' + settings.databaseId, { headers });
  const db = await database.json();
  if (!database.ok || !db.success || db.result?.name !== 'nttu-publisher-staging') {
    throw new Error('D1 identity check failed; no migrations applied');
  }
  const expected = new URL(settings.url).hostname.split('.')[1];
  const response = await fetcher(prefix + '/workers/subdomain', { headers });
  const data = await response.json();
  if (response.ok && data.success && data.result?.subdomain) {
    if (data.result.subdomain !== expected) throw new Error('Existing Workers subdomain differs; no account domain was changed');
    return;
  }
  if (!data.errors?.some(error => error.code === 10007)) throw new Error('Cannot read Workers subdomain; verify token permissions');
  const created = await fetcher(prefix + '/workers/subdomain', { method: 'PUT', headers, body: JSON.stringify({ subdomain: expected }) });
  const result = await created.json();
  if (!created.ok || !result.success || result.result?.subdomain !== expected) throw new Error('Workers subdomain setup failed');
}
export function historyCheckoutOnly(before,after) {
  return typeof before==='string' && typeof after==='string' && after!==before && after.replace(/^\s*fetch-depth: 0\r?\n/m,'')===before;
}
export function loginStatusCopyOnly(before,after) {
  const original='<small>Lịch đăng Facebook đang dừng.</small>',replacement='<small>Đăng nhập để xem trạng thái lịch đăng Facebook.</small>';
  return typeof before==='string'&&typeof after==='string'&&before.split(original).length===2&&after===before.replace(original,replacement);
}
export function assertLiveUiChanges(paths,historyCheckout=false,loginStatusCopy=false) {
  if (!Array.isArray(paths) || paths.some(path =>
    !path.startsWith('ui/cloud/') && !['scripts/cloud-deploy.mjs','tests/cloud.test.mjs','tests/cloud-auth.test.mjs','tests/helpers/cloud-daily-fixture.mjs','tests/cloud-content-trial.test.mjs','docs/steps/28-nearest-scheduled-trial.md','scripts/monitor.mjs','tests/monitor.test.mjs','.github/workflows/monitor.yml','docs/steps/29-independent-monitor.md','docs/steps/30-operational-acceptance.md','docs/operations.md'].includes(path) && !(historyCheckout&&path==='.github/workflows/ci.yml') && !(loginStatusCopy&&path==='src/cloud/worker.ts'))) {
    throw new Error('Active schedule only permits reviewed UI/deployment-verification changes; pause required for backend/schema changes');
  }
}
export async function deploymentState(settings, fetcher = fetch) {
  const response = await fetcher(settings.url+'/api/staging/status', {headers:{Authorization:'Bearer '+settings.token},redirect:'error',signal:AbortSignal.timeout(10000)});
  if (response.status===404) return {paused:true,publishingEnabled:false};
  const state=await response.json();
  if (!response.ok || state.environment!=='staging' || state.databaseChecked!==true || typeof state.paused!=='boolean' || typeof state.publishingEnabled!=='boolean' || state.paused===state.publishingEnabled) throw new Error('Cannot establish existing staging schedule state');
  if (!state.paused) {
    const health=await fetcher(settings.url+'/health',{redirect:'error',signal:AbortSignal.timeout(10000)}),body=await health.json();
    if (!health.ok || body.environment!=='staging' || !/^[a-f0-9]{40}$/.test(body.release??'')) throw new Error('Existing release identity unavailable');
    let diff=spawnSync('git',['diff','--name-only',body.release,settings.releaseSha],{encoding:'utf8'});
    if(diff.status!==0){
      // GitHub's shallow checkout may omit the previously deployed commit.
      const fetched=spawnSync('git',['fetch','--no-tags','--depth=1','origin',body.release],{encoding:'utf8'});
      if(fetched.status!==0)throw new Error('Cannot obtain deployed release for comparison');
      diff=spawnSync('git',['diff','--name-only',body.release,settings.releaseSha],{encoding:'utf8'});
    }
    if(diff.status!==0)throw new Error('Cannot compare deployed release');
    const paths=diff.stdout.trim().split('\n').filter(Boolean);
    let historyCheckout=false;
    if(paths.includes('.github/workflows/ci.yml')){
      const old=spawnSync('git',['show',body.release+':.github/workflows/ci.yml'],{encoding:'utf8'}),next=spawnSync('git',['show',settings.releaseSha+':.github/workflows/ci.yml'],{encoding:'utf8'});
      historyCheckout=old.status===0&&next.status===0&&historyCheckoutOnly(old.stdout,next.stdout);
    }
    let loginStatusCopy=false;
    if(paths.includes('src/cloud/worker.ts')){
      const old=spawnSync('git',['show',body.release+':src/cloud/worker.ts'],{encoding:'utf8'}),next=spawnSync('git',['show',settings.releaseSha+':src/cloud/worker.ts'],{encoding:'utf8'});
      loginStatusCopy=old.status===0&&next.status===0&&loginStatusCopyOnly(old.stdout,next.stdout);
    }
    assertLiveUiChanges(paths,historyCheckout,loginStatusCopy);
  }
  return {paused:state.paused,publishingEnabled:state.publishingEnabled};
}
export async function verifyStaging(settings, { fetcher = fetch, now = Date.now, expectedState,
  pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), timeoutMs = 300000 } = {}) {
  const deadline = now() + timeoutMs;
  do {
    try {
      const health = await fetcher(settings.url + '/health', { signal: AbortSignal.timeout(5000), redirect: 'error' });
      const body = await health.json();
      const status = await fetcher(settings.url + '/api/staging/status', {
        headers: { Authorization: 'Bearer ' + settings.token }, signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      const privateBody = await status.json();
      const anonymous = await fetcher(settings.url + '/api/staging/status', { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (health.status === 200 && body.release === settings.releaseSha && body.environment === 'staging'
        && body.publishingImplemented === true && body.schedulerImplemented === true && status.status === 200
        && privateBody.paused === (expectedState?.paused??true)
        && (expectedState ? privateBody.publishingEnabled===expectedState.publishingEnabled : privateBody.publishingEnabled!==true)
        && privateBody.databaseChecked === true && anonymous.status === 401) return;
    } catch {}
    if (now() >= deadline) break;
    await pause(Math.min(5000, deadline - now()));
  } while (now() < deadline);
  throw new Error('Deployment health/identity/schedule-state verification failed after bounded waiting.');
}
export async function deployStaging(env = process.env) {
  const settings = deploymentSettings(env);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  if (head.status !== 0 || head.stdout.trim() !== settings.releaseSha || dirty.status !== 0 || dirty.stdout.trim()) throw new Error('Deployment must use the clean tested checkout of release SHA');
  const expectedState=await deploymentState(settings);
  await ensureStagingResources(settings, env);
  if(expectedState.paused) await ensureSessionSecret(env);
  const { directory } = prepareCloud({ databaseId: settings.databaseId, releaseSha: settings.releaseSha });
  const config = resolve(directory, 'wrangler.json');
  const secretsFile = resolve(directory, 'deploy-secrets.json');
  const cli = resolve('node_modules/wrangler/bin/wrangler.js');
  const run = args => {
    const result = spawnSync(process.execPath, [cli, ...args], { env: { ...env, WRANGLER_SEND_METRICS: 'false', CI: 'true' }, encoding: 'utf8', timeout: 180000 });
    // Never forward CLI output: error messages or binding displays could contain secrets.
    if (result.status !== 0) throw new Error('Cloudflare operation failed; inspect account deployment status. Command: ' + args[0]);
  };
  try {
    writeFileSync(secretsFile, JSON.stringify({ STAGING_HEALTH_TOKEN: settings.token }), { mode: 0o600 });
    if(expectedState.paused) run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', config]);
    run(['deploy', '--config', config, '--secrets-file', secretsFile, '--message', 'Staging foundation ' + settings.releaseSha]);
  } finally { rmSync(secretsFile, { force: true }); }
  await verifyStaging(settings,{expectedState});
  console.log('Staging deployment verified: ' + settings.url + ' release ' + settings.releaseSha);
  console.log('Cloud cron delivery remains to be observed; local cron tests are not proof of remote scheduling.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await deployStaging(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
