import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareCloud } from './cloud-prepare.mjs';
import { pathToFileURL } from 'node:url';

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
export async function deployStaging(env = process.env) {
  const settings = deploymentSettings(env);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  if (head.status !== 0 || head.stdout.trim() !== settings.releaseSha || dirty.status !== 0 || dirty.stdout.trim()) throw new Error('Deployment must use the clean tested checkout of release SHA');
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
    run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', config]);
    run(['deploy', '--config', config, '--secrets-file', secretsFile, '--message', 'Staging foundation ' + settings.releaseSha]);
  } finally { rmSync(secretsFile, { force: true }); }
  let verified = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const health = await fetch(settings.url + '/health', { signal: AbortSignal.timeout(5000) });
      const body = await health.json();
      const status = await fetch(settings.url + '/api/staging/status', {
        headers: { Authorization: 'Bearer ' + settings.token }, signal: AbortSignal.timeout(5000),
      });
      const privateBody = await status.json();
      const anonymous = await fetch(settings.url + '/api/staging/status', { signal: AbortSignal.timeout(5000) });
      verified = health.status === 200 && body.release === settings.releaseSha && body.environment === 'staging'
        && body.publishingImplemented === false && status.status === 200 && privateBody.paused === true && anonymous.status === 401;
    } catch {}
    if (verified) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!verified) throw new Error('Deployment health/identity verification failed. No publishing was enabled.');
  console.log('Staging deployment verified: ' + settings.url + ' release ' + settings.releaseSha);
  console.log('Cloud cron delivery remains to be observed; local cron tests are not proof of remote scheduling.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await deployStaging(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
