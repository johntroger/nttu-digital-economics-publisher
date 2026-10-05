import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareCloud } from '../scripts/cloud-prepare.mjs';
import { cloudCatalog, cloudPost, saveCloudCaption } from '../src/cloud/catalog.ts';
import { POLICY } from '../src/domain/policy.ts';

const owner = { email: POLICY.ownerEmail, sub: 'fixture-owner', csrf: 'c'.repeat(64) };
function fixture() {
  const { directory } = prepareCloud({ output: 'tmp/tests/cloud-caption-' + crypto.randomUUID() });
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(directory + '/migrations').sort()) db.exec(readFileSync(directory + '/migrations/' + file, 'utf8'));
  const DB = {
    prepare(sql) { let args = []; return { bind(...values) { args = values; return this; },
      async first() { return db.prepare(sql).get(...args) ?? null; }, async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return db.prepare(sql).run(...args); }, execute() { return db.prepare(sql).run(...args); } }; },
    async batch(statements) { db.exec('BEGIN'); try { const result = statements.map(item => item.execute()); db.exec('COMMIT'); return result; } catch(error) { db.exec('ROLLBACK'); throw error; } },
  };
  return { db, env: { APP_ENV: 'staging', INTEGRATION_MODE: 'unconfigured', DB } };
}
const draft = post => ({ expectedVersion: post.versionId, requestId: crypto.randomUUID(), title: 'Kỹ năng dữ liệu', body: 'Thực hành đọc dữ liệu và giải thích kết quả cho doanh nghiệp.', sourceNote: 'Cần kiểm định tài liệu.' });
test('Cloud catalog is independent, paused, includes 40 briefs, no ready image or private documents', async () => {
  const { db, env } = fixture(); try {
    const catalog = await cloudCatalog(env); assert.equal(catalog.posts.length, 40); assert.equal(catalog.paused, true);
    assert.equal(catalog.separator, '============'); assert.equal(catalog.cloudDocumentsConfigured, false);
    assert.ok(catalog.posts.every(post => !post.ready && !post.imageAvailable));
  } finally { db.close(); }
});
test('Save, replay and restore create immutable versions without ready status', async () => {
  const { db, env } = fixture(); try {
    const first = (await cloudCatalog(env)).posts[0], input = draft(first);
    const saved = await saveCloudCaption(env, owner, first.id, input);
    assert.equal(saved.replayed, false);
    assert.deepEqual(await saveCloudCaption(env, owner, first.id, input), { ...saved, replayed: true });
    await assert.rejects(saveCloudCaption(env, owner, first.id, { ...input, body: 'Thay đổi request đã dùng.' }), { code: 'REQUEST_REUSED' });
    await assert.rejects(saveCloudCaption(env, owner, first.id, { ...input, requestId: crypto.randomUUID() }), { code: 'VERSION_CONFLICT' });
    const current = await cloudPost(env, first.id); assert.equal(current.version, 2); assert.equal(current.status, 'needs_review');
    assert.equal(current.versions.find(version => version.id === first.versionId).body, first.body);
    const restored = await saveCloudCaption(env, owner, first.id, { expectedVersion: current.versionId, requestId: crypto.randomUUID(), restoreVersion: first.versionId }, true);
    const after = await cloudPost(env, first.id); assert.equal(after.versionId, restored.versionId); assert.equal(after.version, 3);
    assert.equal(after.body, first.body); assert.equal(after.ready, false);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
});
test('Duplicate normalized captions and busy/maintenance state roll back the whole batch', async () => {
  const { db, env } = fixture(); try {
    const [a,b] = (await cloudCatalog(env)).posts;
    await saveCloudCaption(env, owner, a.id, draft(a));
    const count = db.prepare('SELECT count(*) n FROM post_versions').get().n;
    await assert.rejects(saveCloudCaption(env, owner, b.id, draft(b)), { code: 'DUPLICATE_CAPTION' });
    assert.equal(db.prepare('SELECT count(*) n FROM post_versions').get().n, count);
    assert.equal((await cloudPost(env, b.id)).versionId, b.versionId);
    db.prepare("UPDATE application_state SET maintenance_owner='fixture' WHERE environment='staging'").run();
    await assert.rejects(saveCloudCaption(env, owner, b.id, { ...draft(b), body: 'Một nội dung khác không trùng.' }));
    assert.equal(db.prepare('SELECT count(*) n FROM post_versions').get().n, count);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
});
test('Concurrent save attempts preserve exactly one active version', async () => {
  const { db, env } = fixture(); try {
    const post = (await cloudCatalog(env)).posts[0];
    const outcomes = await Promise.allSettled([saveCloudCaption(env, owner, post.id, draft(post)), saveCloudCaption(env, owner, post.id, { ...draft(post), body: 'Một bản cập nhật cạnh tranh.' })]);
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal((await cloudPost(env, post.id)).versions.length, 2);
  } finally { db.close(); }
});
