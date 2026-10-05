import type { Candidate, ContentContext, Source, Fact } from '../domain/content.ts';
import { normalizedBody } from '../domain/content.ts';
export interface ReadDatabase { all<T>(sql: string, ...parameters: string[]): T[] }
type VersionRow = {
  post_id: string; version_id: string; body: string; topic_group: Candidate['group']; pool: Candidate['pool'];
  primary_audience: Candidate['audience']; concept: string; angle: string; stable_order: number; stage: string;
  status: string; check_version: number; review_due_at: string | null; asset_id: string | null;
};
type SourceRow = { id: string; status: string; reviewed_at: string | null; review_due_at: string | null };
const source = (row: SourceRow | undefined): Source | null => row
  ? { id: row.id, status: row.status, reviewedAt: row.reviewed_at, reviewDueAt: row.review_due_at } : null;
export function readCatalog(db: ReadDatabase): Candidate[] {
  return db.all<VersionRow>(`SELECT p.id post_id,p.topic_group,p.pool,e.concept,e.angle,e.stable_order,e.stage,
    COALESCE(v.id,'') version_id,COALESCE(v.body,'') body,COALESCE(v.primary_audience,'student') primary_audience,
    COALESCE(v.status,'draft') status,COALESCE(v.check_version,0) check_version,v.review_due_at,v.asset_id
    FROM posts p LEFT JOIN content_entries e ON e.post_id=p.id LEFT JOIN post_versions v ON v.id=e.active_version_id`).map(row => {
    const asset = row.asset_id ? db.all<{ id: string; status: string; checksum: string; width: number; height: number; size_bytes: number; content_type: string }>(
      'SELECT * FROM assets WHERE id=?', row.asset_id)[0] : undefined;
    const binding = db.all<{ asset_id: string; checksum: string; check_version: number }>('SELECT * FROM asset_bindings WHERE version_id=?', row.version_id)[0];
    const check = db.all<{ check_version: number; asset_checksum: string; footer_version: string; checked_at: string;
      accuracy: number; usefulness: number; clarity: number; originality: number; visual_quality: number; mandatory_pass: number }>(
      'SELECT * FROM content_checks WHERE version_id=? AND check_version=?', row.version_id, String(row.check_version))[0];
    const sources = db.all<SourceRow>('SELECT s.* FROM version_sources r JOIN sources s ON s.id=r.source_id WHERE r.version_id=?', row.version_id).map(s => source(s));
    const facts = db.all<{ id: string; fact_key: string; value_json: string; source_id: string; status: string; cohort: number | null; review_due_at: string | null }>(
      'SELECT f.* FROM version_facts r JOIN facts f ON f.id=r.fact_id WHERE r.version_id=?', row.version_id).map(f => ({
      id: f.id, key: f.fact_key, value: JSON.parse(f.value_json) as unknown, status: f.status, cohort: f.cohort, reviewDueAt: f.review_due_at,
      source: source(db.all<SourceRow>('SELECT * FROM sources WHERE id=?', f.source_id)[0]),
    } satisfies Fact));
    return { postId: row.post_id, versionId: row.version_id, body: row.body, group: row.topic_group, pool: row.pool,
      audience: row.primary_audience, concept: row.concept ?? '', angle: row.angle ?? '', order: row.stable_order ?? 0, stage: row.stage ?? 'brief',
      status: row.status, checkVersion: row.check_version, reviewDueAt: row.review_due_at,
      asset: asset ? { id: asset.id, status: asset.status, checksum: asset.checksum, width: asset.width,
        height: asset.height, size: asset.size_bytes, type: asset.content_type } : null,
      binding: binding ? { assetId: binding.asset_id, checksum: binding.checksum, checkVersion: binding.check_version } : null,
      check: check ? { checkVersion: check.check_version, checksum: check.asset_checksum, footerVersion: check.footer_version,
        checkedAt: check.checked_at, passed: [check.accuracy,check.usefulness,check.clarity,check.originality,check.visual_quality,check.mandatory_pass].every(v => v === 1) } : null,
      sources, facts, prerequisites: db.all<{ prerequisite_id: string }>('SELECT prerequisite_id FROM post_prerequisites WHERE post_id=?', row.post_id).map(p => p.prerequisite_id),
    };
  });
}
export function readContext(db: ReadDatabase, page: string, now: string, footerVersion: string): ContentContext {
  if (!db.all('SELECT id FROM page_connections WHERE id=?', page).length) throw new Error('Unknown page connection');
  const published = db.all<{ post_id: string; body: string }>(`SELECT DISTINCT v.post_id,v.body
    FROM publications pub JOIN publish_jobs j ON j.id=pub.job_id JOIN post_versions v ON v.id=j.post_version_id
    WHERE j.page_connection_id=?`, page);
  const used = db.all<{ post_id: string }>('SELECT post_id FROM production_post_usage WHERE page_connection_id=?', page);
  const held = db.all<{ post_id: string }>(`SELECT DISTINCT v.post_id FROM publish_jobs j JOIN post_versions v ON v.id=j.post_version_id
    WHERE j.page_connection_id=? AND j.state IN ('held','publish_requested','evidence_pending','retry_wait','unknown')`, page);
  const recent = db.all<{ angle: string }>(`SELECT DISTINCT json_extract(v.metadata_json,'$.angle') angle FROM publications pub JOIN publish_jobs j ON j.id=pub.job_id
    JOIN post_versions v ON v.id=j.post_version_id
    WHERE j.page_connection_id=? AND julianday(pub.confirmed_at) >= julianday(?,'-14 days') AND julianday(pub.confirmed_at) <= julianday(?)`, page, now, now);
  return { now, footerVersion, cohort: 2026, usedPostIds: new Set(used.map(p => p.post_id)),
    heldPostIds: new Set(held.map(p => p.post_id)), publishedPostIds: new Set(published.map(p => p.post_id)),
    recentAngles: new Set(recent.map(p => p.angle).filter(Boolean)), publishedBodies: new Set(published.map(p => normalizedBody(p.body))) };
}
