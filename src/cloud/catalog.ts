import type { CloudBindings, Statement } from './runtime.ts';
import { readStatus } from './runtime.ts';
import { normalizedBody } from '../domain/content.ts';
import { composeCaption, FOOTER, CAPTION_SEPARATOR } from '../domain/footer.ts';
import type { OwnerSession } from './auth.ts';
import {createCloudReview} from './review.ts';
import {SOURCE_REGISTRY} from './source-registry.ts';
import type {SourceDefinition} from './source-registry.ts';
export class CatalogError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 422) { super(code); this.code = code; this.status = status; }
}
type Row = Record<string, unknown>;
async function rows(env: CloudBindings, sql: string, ...values: (string | number | null)[]): Promise<Row[]> {
  const statement = env.DB!.prepare(sql).bind(...values);
  if (!statement.all) throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE', 503);
  return (await statement.all<Row>()).results;
}
const POST_SQL = `SELECT p.id,p.content_key,p.topic_group,p.pool,v.id version_id,v.version,v.caption_title title,
  v.body,v.metadata_json,v.primary_audience,v.status,v.check_version,v.asset_id,e.stage,l.id image_file_id
  FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id
  LEFT JOIN cloud_library l ON 'library-'||l.id=v.asset_id AND l.kind='image' AND l.state='complete'`;
function model(row: Row) {
  const metadata = JSON.parse(String(row.metadata_json)) as Record<string, unknown>;
  return { id: row.id, key: row.content_key, group: row.topic_group, pool: row.pool, title: row.title,
    body: row.body, caption: composeCaption(String(row.body)), versionId: row.version_id, version: row.version,
    audience: row.primary_audience, stage: row.stage, status: row.status, checkVersion:row.check_version, sourceNote: metadata.sourceNote ?? '',
    sourceHint: metadata.sourceHint ?? '', sourceRefs: metadata.sourceRefs ?? [], imageAvailable: Boolean(row.image_file_id),
    imageUrl: row.image_file_id ? '/api/library/files/' + row.image_file_id : null, ready: false };
}
export async function cloudCatalog(env: CloudBindings) {
  await readStatus(env);
  const posts = await rows(env, POST_SQL + ' ORDER BY p.content_key');
  const publications = await rows(env, `SELECT pub.remote_id,pub.confirmed_at,pub.caption_snapshot FROM publications pub ORDER BY pub.confirmed_at DESC LIMIT 100`);
  const notifications = await rows(env, 'SELECT event_id,state FROM notification_outbox ORDER BY event_id LIMIT 100');
  const schedule = await rows(env, 'SELECT business_date,status FROM schedule_slots ORDER BY business_date LIMIT 100');
  return { mode: 'staging', posts: posts.map(model), publications, notifications, schedule,
    footer: FOOTER, separator: CAPTION_SEPARATOR, paused: true, publishingImplemented: false,
    cloudImagesConfigured: Boolean(env.MEDIA), cloudDocumentsConfigured: Boolean(env.MEDIA) };
}
export async function cloudPost(env: CloudBindings, id: string) {
  await readStatus(env);
  const row = (await rows(env, POST_SQL + ' WHERE p.id=?', id))[0];
  if (!row) throw new CatalogError('POST_NOT_FOUND', 404);
  const versions = await rows(env, `SELECT v.id,v.version,v.caption_title title,v.body,v.metadata_json,v.status,
    r.created_at,r.actor,r.action FROM post_versions v LEFT JOIN editor_revisions r ON r.version_id=v.id
    WHERE v.post_id=? ORDER BY v.version DESC LIMIT 100`, id);
  return { ...model(row), versions: versions.map(version => ({ id: version.id, version: version.version, title: version.title,
    body: version.body, caption: composeCaption(String(version.body)), createdAt: version.created_at,
    actor: version.actor, action: version.action, status: version.status })) };
}
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
export async function saveCloudCaption(env: CloudBindings, owner: OwnerSession, postId: string, input: unknown, restore = false, imageFileId?: string,sourceRegistry:readonly SourceDefinition[]=SOURCE_REGISTRY) {
  await readStatus(env);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatalogError('INVALID_CAPTION');
  const data = input as Record<string, unknown>;
  if (!text(data.expectedVersion, 300) || typeof data.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(data.requestId)) throw new CatalogError('INVALID_SAVE_REQUEST');
  let draft = { title: data.title, body: data.body, sourceNote: data.sourceNote };
  let parentId = data.expectedVersion;
  if (restore) {
    if (!text(data.restoreVersion, 300)) throw new CatalogError('INVALID_RESTORE_REQUEST');
    const parent = (await rows(env, 'SELECT * FROM post_versions WHERE id=? AND post_id=?', data.restoreVersion, postId))[0];
    if (!parent) throw new CatalogError('VERSION_NOT_FOUND', 404);
    const metadata = JSON.parse(String(parent.metadata_json)) as Record<string, unknown>;
    draft = { title: parent.caption_title, body: parent.body, sourceNote: metadata.sourceNote ?? '' }; parentId = data.restoreVersion;
  }
  if (!text(draft.title, 200) || !text(draft.body, 20000) || draft.body.includes(FOOTER)
    || typeof draft.sourceNote !== 'string' || draft.sourceNote.length > 12000) throw new CatalogError('INVALID_CAPTION');
  let assetId: string|null = null;
  if (imageFileId !== undefined) {
    if (!env.MEDIA) throw new CatalogError('STORAGE_NOT_CONFIGURED',503);
    const file=(await rows(env,"SELECT a.id FROM cloud_library l JOIN assets a ON a.id='library-'||l.id WHERE l.id=? AND l.kind='image' AND l.state='complete' AND a.status='complete'",imageFileId))[0];
    if (!file) throw new CatalogError('IMAGE_NOT_AVAILABLE',422);
    assetId=String(file.id);
  }
  const sourceRecords=!restore&&data.sourceRefs!==undefined?await createCloudReview(env,sourceRegistry).resolveReferences(data.sourceRefs):undefined;
  const fingerprint = await hash(JSON.stringify({ postId, owner: owner.sub, expected: data.expectedVersion, draft, parentId, restore, assetId,sourceRecords }));
  const replay = (await rows(env, 'SELECT fingerprint,result_version_id FROM editor_requests WHERE request_id=?', data.requestId))[0];
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new CatalogError('REQUEST_REUSED', 409);
    return { versionId: replay.result_version_id, replayed: true };
  }
  const active = (await rows(env, POST_SQL + ' WHERE p.id=?', postId))[0];
  if (!active) throw new CatalogError('POST_NOT_FOUND', 404);
  if (active.version_id !== data.expectedVersion) throw new CatalogError('VERSION_CONFLICT', 409);
  const parent = (await rows(env, 'SELECT * FROM post_versions WHERE id=? AND post_id=?', parentId, postId))[0]!;
  const metadata = { ...JSON.parse(String(parent.metadata_json)) as Record<string, unknown>, isBrief: false, sourceNote: draft.sourceNote, editor: true };
  if(sourceRecords!==undefined)Object.assign(metadata,{sourceRefs:sourceRecords.map(({id,pages,section,supports,adaptation})=>({id,pages,section,supports,adaptation}))});
  const versionId = 'cloud-version-' + crypto.randomUUID(), checksum = await hash(normalizedBody(draft.body));
  const now = new Date().toISOString();
  if (!env.DB!.batch) throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE', 503);
  const sql = (query: string, ...values: (string | number | null)[]): Statement => env.DB!.prepare(query).bind(...values);
  try {
    await env.DB!.batch([
      sql(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_points,image_description,primary_audience,metadata_json,status,asset_id)
        SELECT ?,v.post_id,v.version+1,?,?,?,?,?,?,?,'needs_review',?
        FROM post_versions v JOIN content_entries e ON e.active_version_id=v.id
        WHERE v.id=? AND v.post_id=? AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
        AND NOT EXISTS(SELECT 1 FROM publish_jobs j JOIN post_versions p ON p.id=j.post_version_id WHERE p.post_id=v.post_id
          AND j.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))`, versionId, draft.body, draft.title,
        String(parent.image_headline), String(parent.image_points), String(parent.image_description), String(parent.primary_audience), JSON.stringify(metadata), assetId, data.expectedVersion, postId),
      sql('DELETE FROM cloud_caption_keys WHERE post_id=? AND EXISTS(SELECT 1 FROM post_versions WHERE id=?)', postId, versionId),
      // Unique normalized caption key and FK make duplicate/race/zero-row failures roll back the entire D1 batch.
      sql('INSERT INTO cloud_caption_keys VALUES (?,?,?)', checksum, postId, versionId),
      ...(sourceRecords===undefined?[
      sql(`INSERT INTO sources(id,title,revision,locator,authority,status,reviewed_at,review_due_at)
        SELECT ?||':source:'||s.id,s.title,s.revision,s.locator,s.authority,
        CASE WHEN s.authority='user_confirmation' THEN s.status ELSE 'pending' END,
        CASE WHEN s.authority='user_confirmation' THEN s.reviewed_at ELSE NULL END,s.review_due_at
        FROM sources s JOIN version_sources r ON r.source_id=s.id WHERE r.version_id=?`, versionId, parentId),
      sql(`INSERT INTO version_sources SELECT ?,?||':source:'||source_id,location FROM version_sources WHERE version_id=?`, versionId, versionId, parentId),
      ]:sourceRecords.flatMap((ref,index)=>{
        const sourceId=versionId+':source:'+index,confirmation=ref.authority==='user_confirmation';
        return [sql('INSERT INTO sources VALUES (?,?,?,?,?,?,?,NULL)',sourceId,ref.title,ref.revision,ref.section,ref.authority,confirmation?'verified':'pending',confirmation?now:null),
          sql('INSERT INTO version_sources VALUES (?,?,?)',versionId,sourceId,JSON.stringify({id:ref.id,pages:ref.pages,section:ref.section,supports:ref.supports,adaptation:ref.adaptation}))];
      })),
      sql('INSERT INTO version_facts SELECT ?,fact_id FROM version_facts WHERE version_id=?', versionId, parentId),
      sql(`INSERT INTO editor_revisions VALUES (?,?,?,?,?,?)`, versionId, data.expectedVersion, restore ? parentId : null, restore ? 'restore' : 'save', owner.email, now),
      sql("UPDATE content_entries SET active_version_id=?,stage='caption' WHERE post_id=? AND active_version_id=?", versionId, postId, data.expectedVersion),
      sql(`INSERT INTO asset_bindings(version_id,asset_id,check_version,checksum)
        SELECT v.id,a.id,v.check_version,a.checksum FROM post_versions v JOIN assets a ON a.id=v.asset_id
        WHERE v.id=? AND a.status='complete'`,versionId),
      sql('INSERT INTO editor_requests VALUES (?,?,?)', data.requestId, fingerprint, versionId),
    ]);
  } catch {
    const repeated = (await rows(env, 'SELECT fingerprint,result_version_id FROM editor_requests WHERE request_id=?', data.requestId))[0];
    if (repeated?.fingerprint === fingerprint) return { versionId: repeated.result_version_id, replayed: true };
    if (repeated) throw new CatalogError('REQUEST_REUSED', 409);
    const duplicate = (await rows(env, 'SELECT post_id FROM cloud_caption_keys WHERE checksum=? AND post_id<>?', checksum, postId))[0];
    if (duplicate) throw new CatalogError('DUPLICATE_CAPTION', 409);
    throw new CatalogError('VERSION_CONFLICT_OR_BUSY', 409);
  }
  return { versionId, replayed: false };
}
