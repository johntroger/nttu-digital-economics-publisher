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
import { uploadFile,downloadFile,checksum } from '../src/cloud/storage.ts';
import {createCloudReview,REVIEW_KEYS} from '../src/cloud/review.ts';
import { png,pdf } from '../tests/helpers/files.mjs';
import {DESIGN_REGISTRY} from '../src/cloud/design-registry.ts';
import {saveArtwork} from '../src/cloud/artwork.ts';
import {createBackup,continueBackup,checkBackup,backupManifest,backupFile} from '../src/cloud/backups.ts';
import {BACKUP_SCHEMA} from '../src/cloud/backup-schema.ts';

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
      if(name.startsWith('fonts/')&&([...DESIGN_REGISTRY.fonts.map(f=>'fonts/'+f.name),'fonts/BricolageGrotesque-OFL.txt','fonts/WorkSans-OFL.txt']).includes(name))return new Response(readFileSync(resolve('assets',name)),{headers:{'Content-Type':name.endsWith('.ttf')?'font/ttf':'text/plain'}});
      if (!['manager.html','manager.js','cloud.css','artwork.js','artwork-ui.js','backups.js','zip.js'].includes(name)) return new Response('', { status: 404 });
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
    // Injected registry is a service-level test dependency; HTTP never accepts a registry override.
    const registry=[{id:'BM03',name:'Runtime source fixture',pages:2,sha256:await checksum(pdf),authority:'document'}];
    const sourced=await cloudPost(f.env,a.id);
    await saveCloudCaption(f.env,f.owner,a.id,{expectedVersion:sourced.versionId,requestId:crypto.randomUUID(),title:sourced.title,body:sourced.body,
      sourceNote:'Runtime source fixture',sourceRefs:[{id:'BM03',pages:[1],section:'Fixture',supports:'Runtime test only.',adaptation:'Not a factual review.'}]},false,undefined,registry);
    const toAttach=await cloudPost(f.env,a.id);
    await saveCloudCaption(f.env,f.owner,a.id,{expectedVersion:toAttach.versionId,requestId:crypto.randomUUID(),title:toAttach.title,body:toAttach.body,sourceNote:toAttach.sourceNote},false,file.file.id);
    const reviewService=createCloudReview(f.env,registry),audit=await reviewService.auditPost(a.id);assert.deepEqual(audit.issues,[]);
    const reviewInput={expectedVersion:audit.versionId,expectedCheck:audit.checkVersion,requestId:crypto.randomUUID(),rubric:Object.fromEntries(REVIEW_KEYS.map(key=>[key,true]))};
    assert.equal((await reviewService.reviewPost(a.id,f.owner,reviewInput)).replayed,false);
    assert.equal((await reviewService.reviewPost(a.id,f.owner,reviewInput)).replayed,true);
    assert.equal((await reviewService.auditPost(a.id)).reviewed,true);
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM content_checks').first()).n,0);
    assert.equal((await worker.fetch(new Request(f.origin+'/api/sources'),f.env)).status,401);
    const designRegistry=structuredClone(DESIGN_REGISTRY);
    for(const [index,logo] of designRegistry.logos.entries()){const logoBytes=png(500+index*100,500);logo.sha256=await checksum(logoBytes);await uploadFile(f.env,f.owner,{kind:'logo',filename:logo.file,contentType:'image/png'},logoBytes);}
    const artworkParent=await cloudPost(f.env,a.id),designInput={requestId:crypto.randomUUID(),expectedVersion:artworkParent.versionId,spec:{layout:'illustration',motif:'portfolio',headline:'Hồ sơ năng lực',points:[],note:'Bằng chứng thực hành',paper:'#F2F6FA',ink:'#163348',accent:'#07559D'}};
    const artwork=await saveArtwork(f.env,f.owner,a.id,designInput,bytes,designRegistry);assert.equal((await saveArtwork(f.env,f.owner,a.id,designInput,bytes,designRegistry)).versionId,artwork.versionId);
    const artworkPost=await cloudPost(f.env,a.id);assert.equal(artworkPost.body,artworkParent.body);assert.equal(artworkPost.imageDesign.spec.motif,'portfolio');assert.equal(artworkPost.ready,false);
    assert.equal((await f.env.DB.prepare('SELECT count(*) n FROM content_checks').first()).n,0);
    console.log('Cloud artwork D1/R2 passed: private logo integrity, design snapshot, idempotent image binding, no publishing readiness.');
    let backup=await createBackup(f.env,f.owner,{requestId:crypto.randomUUID()});for(let i=0;i<265&&backup.state!=='complete';i++)backup=await continueBackup(f.env,backup.id,f.owner);assert.equal(backup.state,'complete');
    const checkInput={requestId:crypto.randomUUID()};let verification;for(let i=0;i<264;i++){verification=await checkBackup(f.env,backup.id,checkInput);if(verification.verified)break;}assert.equal(verification.verified,true);
    const backupManifestData=await backupManifest(f.env,backup.id);assert.equal(backupManifestData.counts.posts,40);assert.equal(backupManifestData.files.length,1+backupManifestData.counts.files+BACKUP_SCHEMA.extra.length);assert.equal((await backupFile(f.env,backup.id,0)).status,200);
    console.log('Cloud backup D1/R2 passed: transactional snapshot, conditional copies, readback SHA, manifest and persisted verification; no live restore.');
    console.log('Cloud source/review D1/R2 passed: version provenance, page validation, image alignment, CAS receipt and no readiness.');
    console.log('Private storage D1/R2 local passed: conditional upload, deduplication, verified download, PDF and new image version.');
    console.log('Management local D1 passed: concurrent CAS, duplicate rollback, owner API, bounded JSON and private UI. Google login is not emulated as remote acceptance.');
  } finally { await f.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runManagementSmoke();
