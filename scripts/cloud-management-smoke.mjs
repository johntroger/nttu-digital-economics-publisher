// Local D1 integration evidence. Fixture sessions never reach a remote Worker.
import { getPlatformProxy } from 'wrangler';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { SignJWT } from 'jose';
import { prepareCloud } from './cloud-prepare.mjs';
import { cloudCatalog, cloudPost, saveCloudCaption } from '../src/cloud/catalog.ts';
import { POLICY } from '../src/domain/policy.ts';
import worker from '../src/cloud/worker.ts';
import { uploadFile,downloadFile } from '../src/cloud/storage.ts';
import { png,pdf } from '../tests/helpers/files.mjs';

export async function managementFixture() {
  const output = 'tmp/cloud-management/' + crypto.randomUUID();
  const origin = 'https://nttu-publisher-staging.example.workers.dev';
  const { directory } = prepareCloud({ output, origin, storageEnabled: true });
  const configPath = resolve(directory, 'wrangler.json'), state = resolve(directory, 'state');
  const migration = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--config', configPath, '--persist-to', state],
    { encoding: 'utf8', timeout: 120000, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } });
  if (migration.status !== 0) throw new Error('Local D1 management migration failed: ' + migration.stderr);
  const platform = await getPlatformProxy({ configPath, persist: { path: resolve(state, 'v3') }, remoteBindings: false });
  const signing = 'd'.repeat(64);
  const env = { ...platform.env, AUTH_ORIGIN: origin, GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'fixture-only-secret', SESSION_SIGNING_KEY: signing,
    ASSETS: { async fetch(request) {
      const name = new URL(request.url).pathname.slice(1);
      if (!['manager.html','manager.js','cloud.css'].includes(name)) return new Response('', { status: 404 });
      return new Response(readFileSync(resolve('ui/cloud', name)), { headers: { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' } });
    } },
  };
  const owner = { email: POLICY.ownerEmail, sub: 'local-fixture', csrf: 'c'.repeat(64) };
  const jwt = await new SignJWT({ email: owner.email, csrf: owner.csrf }).setSubject(owner.sub)
    .setProtectedHeader({ alg: 'HS256', typ: 'nttu-session+jwt' }).setIssuer(origin).setAudience('nttu-manager')
    .setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signing));
  return { env, owner, origin, cookie: '__Host-nttu_session=' + jwt, dispose: platform.dispose, directory };
}
export async function runManagementSmoke() {
  const f = await managementFixture();
  try {
    const [a,b] = (await cloudCatalog(f.env)).posts;
    const draft = { expectedVersion: a.versionId, requestId: crypto.randomUUID(), title: 'D1 đồng thời', body: 'Kiểm tra ghi phiên bản trên D1 local.', sourceNote: '' };
    const results = await Promise.allSettled([saveCloudCaption(f.env,f.owner,a.id,draft),saveCloudCaption(f.env,f.owner,a.id,{...draft,requestId:crypto.randomUUID(),body:'Một thay đổi cạnh tranh.'})]);
    assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
    const after = await cloudPost(f.env,a.id); assert.equal(after.versions.length,2);
    const count = (await f.env.DB.prepare('SELECT count(*) n FROM post_versions').first()).n;
    await assert.rejects(saveCloudCaption(f.env,f.owner,b.id,{...draft,expectedVersion:b.versionId,requestId:crypto.randomUUID(),body:after.body}),{code:'DUPLICATE_CAPTION'});
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM post_versions').first()).n,count);
    assert.equal((await cloudPost(f.env,b.id)).versionId,b.versionId);
    const headers = { Cookie:f.cookie,Origin:f.origin,'X-CSRF-Token':f.owner.csrf,'Content-Type':'application/json' };
    const saved = await worker.fetch(new Request(f.origin+'/api/posts/'+encodeURIComponent(b.id)+'/save',{method:'POST',headers,body:JSON.stringify({...draft,expectedVersion:b.versionId,requestId:crypto.randomUUID(),body:'Kiểm tra endpoint thật với D1 local.'})}),f.env);
    assert.equal(saved.status,200);
    const invalid = await worker.fetch(new Request(f.origin+'/api/posts/'+encodeURIComponent(b.id)+'/save',{method:'POST',headers,body:'{broken'}),f.env);
    assert.equal(invalid.status,400);
    const tooLarge = await worker.fetch(new Request(f.origin+'/api/posts/'+encodeURIComponent(b.id)+'/save',{method:'POST',headers,body:'x'.repeat(65537)}),f.env);
    assert.equal(tooLarge.status,413);
    assert.equal((await worker.fetch(new Request(f.origin+'/manager.js'),f.env)).status,401);
    assert.equal((await worker.fetch(new Request(f.origin+'/',{headers:{Cookie:f.cookie}}),f.env)).status,200);
    assert.equal((await f.env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    const bytes=png();
    const file=await uploadFile(f.env,f.owner,{kind:'image',filename:'Runtime image.png',contentType:'image/png'},bytes);
    assert.equal(file.file.state,'complete');
    assert.equal((await uploadFile(f.env,f.owner,{kind:'image',filename:'Runtime image.png',contentType:'image/png'},bytes)).reused,true);
    assert.deepEqual(new Uint8Array(await (await downloadFile(f.env,file.file.id)).arrayBuffer()),bytes);
    const doc=await uploadFile(f.env,f.owner,{kind:'document',filename:'Runtime PDF.pdf',contentType:'application/pdf',sourceKey:'BM03'},pdf);
    assert.equal(doc.file.state,'complete');
    const active=await cloudPost(f.env,a.id);
    await saveCloudCaption(f.env,f.owner,a.id,{expectedVersion:active.versionId,requestId:crypto.randomUUID(),title:active.title,body:active.body,sourceNote:''},false,file.file.id);
    assert.ok((await cloudPost(f.env,a.id)).imageUrl);
    console.log('Private storage D1/R2 local passed: conditional upload, deduplication, verified download, PDF and new image version.');
    console.log('Management local D1 passed: concurrent CAS, duplicate rollback, owner API, bounded JSON and private UI. Google login is not emulated as remote acceptance.');
  } finally { await f.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runManagementSmoke();
