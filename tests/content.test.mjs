import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eligibility, stock, chooseReserve, normalizedBody } from '../src/domain/content.ts';
import { validateBriefs } from '../src/domain/briefs.ts';
import { readCatalog, readContext } from '../src/storage/catalog.ts';
import { openCatalog, importBriefs, reader, migrate } from '../scripts/catalog-store.mjs';
import { database, addJob, addPublication } from './helpers/database.mjs';
import { composeCaption, FOOTER, CAPTION_SEPARATOR } from '../src/domain/footer.ts';

const now = '2026-10-05T03:00:00Z';
const source = () => ({ id: 'source', status: 'verified', reviewedAt: '2026-10-04T00:00:00Z', reviewDueAt: null });
const context = () => ({ now, footerVersion: 'footer-v2', cohort: 2026, usedPostIds: new Set(), heldPostIds: new Set(), publishedPostIds: new Set(), recentAngles: new Set(), publishedBodies: new Set() });
const ready = (overrides = {}) => ({ postId: 'p', versionId: 'v', body: 'Nội dung hữu ích cho sinh viên', group: 'D', audience: 'student', pool: 'reserve',
  concept: 'data', angle: 'data-questions', order: 1, stage: 'caption', status: 'ready', checkVersion: 2, reviewDueAt: null,
  asset: { id: 'image', status: 'complete', checksum: 'fixture-hash', width: 1080, height: 1080, size: 2000, type: 'image/png' },
  binding: { assetId: 'image', checksum: 'fixture-hash', checkVersion: 2 },
  check: { checkVersion: 2, checksum: 'fixture-hash', footerVersion: 'footer-v2', checkedAt: '2026-10-04T01:00:00Z', passed: true },
  sources: [source()], facts: [], prerequisites: [], ...overrides });
const input = () => JSON.parse(readFileSync(new URL('../content/content-plan-40.json', import.meta.url), 'utf8'));
function scenario(name, fn) { test(name, () => { const db = database(); try { fn(db); } finally { db.close(); } }); }
function seedReady(db) {
  db.exec(`INSERT INTO content_entries VALUES ('p1','v1','data','questions',1,'caption');
    INSERT INTO sources VALUES ('source','Fixture only','sha-fixture','fixture.invalid','document','verified','2026-10-04T00:00:00Z',NULL);
    INSERT INTO version_sources VALUES ('v1','source','fixture page 1');
    INSERT INTO assets VALUES ('image','fixture.png','fixture-hash','image/png',1080,1080,2000,'complete');
    UPDATE post_versions SET asset_id='image',status='ready',metadata_json='{"angle":"questions"}' WHERE id='v1';
    INSERT INTO asset_bindings SELECT id,asset_id,check_version,'fixture-hash' FROM post_versions WHERE id='v1';
    INSERT INTO content_checks SELECT 'check',id,check_version,'fixture-hash','footer-v2','test fixture',
      '2026-10-04T01:00:00Z',1,1,1,1,1,1 FROM post_versions WHERE id='v1';`);
}

test('ready requires all gates; a passing score never overrides mandatory failure', () => {
  assert.deepEqual(eligibility(ready(), context()), []);
  const p = ready(); p.check.passed = false;
  assert.ok(eligibility(p, context()).includes('CHECKS_INVALID'));
});
test('mandatory footer is appended once with correct TikTok and one hashtag group', () => {
  const caption = composeCaption('Kiến thức cho sinh viên');
  assert.equal(composeCaption(caption), caption);
  assert.equal(caption.split('#NTTU').length - 1, 1);
  assert.ok(caption.endsWith(FOOTER));
  assert.ok(caption.includes('https://www.tiktok.com/@nganhkinhteso_nttu'));
  for (const body of ['', `${FOOTER}\nNội dung`, `${FOOTER}\n${FOOTER}`, '#NguyenTatThanhUniversity']) assert.throws(() => composeCaption(body));
});

test('caption places one separator before footer and normalizes already composed captions', () => {
  const body = 'Nội dung bài viết';
  const expected = `${body}\n\n${CAPTION_SEPARATOR}\n\n${FOOTER}`;
  for (const input of [body, `${body}\n\n${FOOTER}`, expected,
    `${body}\n${CAPTION_SEPARATOR}\n\n${CAPTION_SEPARATOR}\n\n${FOOTER}`,
    `${body}\n${CAPTION_SEPARATOR}`]) assert.equal(composeCaption(input), expected);
  assert.equal(expected.split(CAPTION_SEPARATOR).length - 1, 1);
  assert.equal(normalizedBody(expected), normalizedBody(body));
  assert.equal(normalizedBody(`${body}\n\n${FOOTER}`), normalizedBody(expected));
});

test('checks for caption format without separator cannot grant new-format readiness', () => {
  const post=ready();post.check.footerVersion='footer-v1';
  assert.ok(eligibility(post,context()).includes('CHECKS_INVALID'));
});
test('source review expires exactly at deadline, malformed and future reviews fail closed', () => {
  for (const change of [{ reviewDueAt: now }, { reviewDueAt: 'bad' }, { reviewedAt: '2026-10-06T00:00:00Z' },
    { reviewedAt: '2026-02-30T00:00:00Z' }, { status: 'pending' }, { status: 'blocked' }]) {
    assert.ok(eligibility(ready({ sources: [{ ...source(), ...change }] }), context()).includes('SOURCE_UNVERIFIED_OR_EXPIRED'));
  }
  assert.ok(eligibility(ready({ sources: [] }), context()).includes('SOURCE_MISSING'));
  assert.throws(() => eligibility(ready(), { ...context(), now: 'bad' }));
});
test('expired post and source verification newer than QA require review', () => {
  assert.ok(eligibility(ready({ reviewDueAt: now }), context()).includes('REVIEW_EXPIRED'));
  assert.ok(eligibility(ready({ sources: [{ ...source(), reviewedAt: '2026-10-04T02:00:00Z' }] }), context()).includes('SOURCE_REVIEW_AFTER_CHECK'));
});
test('program facts honor 3.5 years and 2026; missing, wrong and expired facts block', () => {
  const duration = { id: 'duration', key: 'training_duration_years', value: 3.5, source: source(), status: 'verified', cohort: 2026, reviewDueAt: null };
  const cohort = { ...duration, id: 'cohort', key: 'cohort', value: 2026 };
  assert.deepEqual(eligibility(ready({ group: 'I', facts: [duration, cohort] }), context()), []);
  assert.ok(eligibility(ready({ group: 'I' }), context()).includes('PROGRAM_FACTS_MISSING'));
  for (const patch of [{ value: 4 }, { cohort: 2025 }, { reviewDueAt: now }, { status: 'blocked' }, { source: null }]) {
    assert.ok(eligibility(ready({ facts: [{ ...duration, ...patch }] }), context()).includes('FACT_INVALID'));
  }
});
test('image alignment and footer checks bind to exact content revision and checksum', () => {
  for (const patch of [{ checkVersion: 3 }, { binding: null }, { asset: null },
    { asset: { ...ready().asset, status: 'blocked' } }, { binding: { ...ready().binding, checksum: 'other' } },
    { check: { ...ready().check, footerVersion: 'old-footer' } }]) assert.notEqual(eligibility(ready(patch), context()).length, 0);
});
test('usage, uncertain hold and prerequisite are hard gates independent of ready', () => {
  const c = context(); c.usedPostIds.add('p'); c.heldPostIds.add('p');
  assert.deepEqual(eligibility(ready({ prerequisites: ['before'] }), c), ['ALREADY_USED','HELD_OR_UNCERTAIN','PREREQUISITE_MISSING']);
  c.publishedPostIds.add('before');
  assert.deepEqual(eligibility(ready({ postId: 'fresh', prerequisites: ['before'] }), c), []);
});
test('new identity cannot republish identical normalized body from history, including composed footer', () => {
  const c = context(); c.publishedBodies.add(normalizedBody(composeCaption('Nội dung hữu ích cho sinh viên')));
  assert.ok(eligibility(ready({ postId: 'new-id', body: '  NỘI DUNG HỮU ÍCH\n cho sinh viên  ' }), c).includes('DUPLICATE_PUBLISHED_BODY'));
  assert.deepEqual(eligibility(ready({ body: 'Một nội dung khác' }), c), []);
});
test('stock counts original posts once; reasons can overlap; low threshold is <=3', () => {
  const posts = [ready({ pool: 'scheduled' }), ready({ postId: 'q' }), ready({ postId: 'r', status: 'draft' })];
  assert.deepEqual(stock(posts, context()), { checked_at: now, total_post_count: 3, eligible_distinct_post_count: 2,
    scheduled_count: 1, reserve_count: 1, coverage_days: 2, low_stock: true, reason_counts: { NOT_READY: 1 } });
  assert.throws(() => stock([ready(), ready({ versionId: 'new-version' })], context()), /one active version/);
  assert.equal(stock([0,1,2,3].map(i => ready({ postId: String(i) })), context()).low_stock, false);
});
test('all four reserve buckets are ordered before angle preference; exclusion permits next reserve', () => {
  const candidates = [ready({ postId: 'd', group: 'A', audience: 'prospective_student', order: 0 }),
    ready({ postId: 'c', group: 'A', order: 0 }), ready({ postId: 'b', audience: 'prospective_student', order: 0 }),
    ready({ postId: 'a', order: 9 })];
  const c = context(); c.recentAngles.add('data-questions');
  for (const expected of ['a','b','c','d']) {
    assert.equal(chooseReserve(candidates, { group: 'D', audience: 'student' }, c).postId, expected);
    c.heldPostIds.add(expected);
  }
  assert.equal(chooseReserve(candidates, { group: 'D', audience: 'student' }, c), null);
  assert.equal(chooseReserve([ready(), ready({ postId: 'q' })], ready(), context(), new Set(['p'])).postId, 'q');
});
test('recent angle loses inside its bucket; stable order then ID makes selection deterministic', () => {
  const c = context(); c.recentAngles.add('recent');
  const posts = [ready({ postId: 'recent', angle: 'recent', order: 0 }), ready({ postId: 'z', angle: 'fresh', order: 5 }),
    ready({ postId: 'a', angle: 'fresh', order: 5 }), ready({ postId: 'scheduled', pool: 'scheduled', order: 0 })];
  assert.equal(chooseReserve(posts, ready(), c).postId, 'a');
  assert.equal(chooseReserve(posts.reverse(), ready(), c).postId, 'a');
});
test('invalid or unmet prerequisite reserve is skipped without limiting reserve attempts to three', () => {
  const posts = Array.from({ length: 6 }, (_, i) => ready({ postId: String(i), order: i }));
  posts.unshift(ready({ postId: 'blocked', prerequisites: ['missing'], order: -1 }));
  const excluded = new Set();
  for (let i = 0; i < 6; i++) { const selected = chooseReserve(posts, ready(), context(), excluded); assert.equal(selected.postId, String(i)); excluded.add(selected.postId); }
  assert.equal(chooseReserve(posts, ready(), context(), excluded), null);
});
test('actual 40 briefs import idempotently as zero eligible with original cohort facts', () => {
  const db = openCatalog();
  try {
    assert.equal(importBriefs(db, input()).imported, 40);
    assert.equal(importBriefs(db, input()).unchanged, 40);
    migrate(db);
    const posts = readCatalog(reader(db)); const counts = stock(posts, context());
    assert.equal(posts.length, 40); assert.equal(counts.eligible_distinct_post_count, 0);
    assert.equal(posts.filter(p => p.pool === 'scheduled').length, 30);
    assert.equal(posts.filter(p => p.audience === 'student').length, 28);
    assert.equal(posts.filter(p => p.group === 'I').length, 8);
    assert.equal(counts.reason_counts.BRIEF_ONLY, 40);
    assert.deepEqual(db.prepare('SELECT fact_key,value_json FROM facts ORDER BY fact_key').all().map(r => ({...r})),
      [{ fact_key: 'cohort', value_json: '2026' }, { fact_key: 'training_duration_years', value_json: '3.5' }]);
    assert.equal(db.prepare('SELECT count(*) n FROM sources WHERE authority=\'document\' AND status=\'verified\'').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM publish_jobs').get().n, 0);
    const changed = input(); changed.posts[0].title += ' edited';
    assert.throws(() => importBriefs(db, changed), /Batch changed/);
    assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, 40);
  } finally { db.close(); }
});
test('import rejects duplicate IDs, bad ratios, cycle, unknown prerequisite and conflicting duration', () => {
  for (const mutate of [x => x.posts[1].id = x.posts[0].id, x => x.posts.pop(), x => x.posts[0].slot = 2,
    x => x.posts[0].prerequisites = ['P99'], x => { x.posts[0].prerequisites = ['P02']; x.posts[1].prerequisites = ['P01']; },
    x => x.program_facts.training_duration_years = 4]) {
    const data = input(); mutate(data); assert.throws(() => validateBriefs(data));
  }
});
test('SQL failure during import rolls back the entire batch and permits recovery', () => {
  const db = openCatalog();
  try {
    db.exec(`CREATE TRIGGER fail_import BEFORE INSERT ON posts WHEN NEW.content_key='P20' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`);
    assert.throws(() => importBriefs(db, input()), /fixture failure/);
    for (const table of ['posts','sources','facts','post_versions','content_imports']) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    db.exec('DROP TRIGGER fail_import'); assert.equal(importBriefs(db, input()).imported, 40);
  } finally { db.close(); }
});
scenario('database-backed edits invalidate QA and image without silently using older ready version', db => {
  seedReady(db);
  const get = () => readCatalog(reader(db)).find(p => p.postId === 'p1');
  assert.deepEqual(eligibility(get(), context()), []);
  db.exec("UPDATE post_versions SET body='Edited caption' WHERE id='v1'");
  assert.ok(eligibility(get(), context()).includes('IMAGE_OUT_OF_SYNC'));
  assert.ok(eligibility(get(), context()).includes('CHECKS_INVALID'));
  db.exec("UPDATE content_entries SET active_version_id='v2' WHERE post_id='p1'");
  assert.equal(get().versionId, 'v2'); assert.ok(eligibility(get(), context()).includes('NOT_READY'));
  assert.equal(stock(readCatalog(reader(db)), context()).total_post_count, 2);
});
scenario('source and fact reference changes invalidate review; immutable reference contents need new revision', db => {
  seedReady(db);
  db.exec("UPDATE version_sources SET location='page 2' WHERE version_id='v1'");
  assert.ok(eligibility(readCatalog(reader(db))[0], context()).includes('CHECKS_INVALID'));
  assert.throws(() => db.exec("UPDATE sources SET revision='new' WHERE id='source'"), /new source revision/);
  assert.throws(() => db.exec("UPDATE content_checks SET accuracy=0 WHERE id='check'"), /immutable/);
  db.exec("INSERT INTO facts VALUES ('fact','source','cohort','2026',2026,'verified',NULL); INSERT INTO version_facts VALUES ('v1','fact')");
  assert.throws(() => db.exec("UPDATE facts SET value_json='2025' WHERE id='fact'"), /new fact revision/);
  assert.throws(() => db.exec("INSERT INTO content_entries VALUES ('p2','v1','ai','wrong',2,'caption')"), /another post/);
});
scenario('mandatory QA failure and expired source are enforced from persisted data', db => {
  seedReady(db);
  db.exec("UPDATE sources SET review_due_at='2026-10-05T03:00:00Z' WHERE id='source'");
  assert.ok(eligibility(readCatalog(reader(db))[0], context()).includes('SOURCE_UNVERIFIED_OR_EXPIRED'));
  db.exec("DELETE FROM content_checks; INSERT INTO content_checks SELECT 'fail',id,check_version,'fixture-hash','footer-v2','fixture','2026-10-04T01:00:00Z',1,1,1,1,1,0 FROM post_versions WHERE id='v1'");
  assert.ok(eligibility(readCatalog(reader(db))[0], context()).includes('CHECKS_INVALID'));
});
scenario('source/fact references of a held or historical version cannot be rewritten', db => {
  seedReady(db);
  db.exec("INSERT INTO facts VALUES ('fact','source','cohort','2026',2026,'verified',NULL); INSERT INTO version_facts VALUES ('v1','fact')");
  addJob(db);
  for (const sql of ["DELETE FROM version_sources WHERE version_id='v1'",
    "UPDATE version_sources SET location='changed' WHERE version_id='v1'",
    "DELETE FROM version_facts WHERE version_id='v1'",
    "UPDATE version_facts SET fact_id='fact' WHERE version_id='v1'",
    "INSERT INTO version_sources VALUES ('v1','source','new')",
    "INSERT INTO version_facts VALUES ('v1','fact')"]) assert.throws(() => db.exec(sql), /pinned version references/);
  db.exec("UPDATE sources SET status='blocked' WHERE id='source'");
  assert.ok(eligibility(readCatalog(reader(db))[0], context()).includes('SOURCE_UNVERIFIED_OR_EXPIRED'));
});
scenario('context isolates page history; unknown lease expiry holds original post across versions', db => {
  seedReady(db); addJob(db);
  db.exec("UPDATE publish_jobs SET state='unknown',lease_until='2020-01-01T00:00:00Z' WHERE id='j1'");
  const c = readContext(reader(db), 'prod', now, 'footer-v2');
  assert.equal(c.heldPostIds.has('p1'), true);
  assert.equal(readContext(reader(db), 'trial', now, 'footer-v2').heldPostIds.size, 0);
  assert.ok(eligibility(readCatalog(reader(db))[0], c).includes('HELD_OR_UNCERTAIN'));
  assert.throws(() => readContext(reader(db), 'missing', now, 'footer-v2'));
});
scenario('confirmed production usage consumes identity; trial history satisfies only its own prerequisites', db => {
  seedReady(db); addJob(db); addPublication(db);
  db.exec("UPDATE publish_jobs SET state='confirmed' WHERE id='j1'; INSERT INTO production_post_usage VALUES ('prod','p1','pub1','2026-10-05T03:00:00Z')");
  const c = readContext(reader(db), 'prod', now, 'footer-v2');
  assert.equal(c.usedPostIds.has('p1'), true); assert.equal(c.publishedPostIds.has('p1'), true);
  assert.equal(c.recentAngles.has('questions'), true);
  assert.equal(c.publishedBodies.has(normalizedBody('Nội dung một')), true);
  const trial = readContext(reader(db), 'trial', now, 'footer-v2');
  assert.equal(trial.usedPostIds.size, 0); assert.equal(trial.publishedPostIds.size, 0);
  db.exec("UPDATE content_entries SET angle='changed' WHERE post_id='p1'");
  assert.equal(readContext(reader(db), 'prod', now, 'footer-v2').recentAngles.has('questions'), true);
  addJob(db, { id: 'trialjob', page: 'trial', slot: null, request: 'trial1' }); addPublication(db, { id: 'trialpub', job: 'trialjob' });
  assert.equal(readContext(reader(db), 'trial', now, 'footer-v2').usedPostIds.size, 0);
  assert.equal(readContext(reader(db), 'trial', now, 'footer-v2').publishedPostIds.has('p1'), true);
});

