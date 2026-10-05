import { FOOTER, removeTrailingSeparator } from './footer.ts';
export type Group = 'D' | 'A' | 'B' | 'S' | 'R' | 'I';
export type Audience = 'student' | 'prospective_student';
export interface Source {
  id: string; status: string; reviewedAt: string | null; reviewDueAt: string | null;
}
export interface Fact {
  id: string; key: string; value: unknown; source: Source | null; status: string; cohort: number | null; reviewDueAt: string | null;
}
export interface Candidate {
  postId: string; versionId: string; body: string; group: Group; audience: Audience; pool: 'scheduled' | 'reserve';
  concept: string; angle: string; order: number; stage: string; status: string;
  checkVersion: number; reviewDueAt: string | null;
  asset: { id: string; status: string; checksum: string; width: number; height: number; size: number; type: string } | null;
  binding: { assetId: string; checksum: string; checkVersion: number } | null;
  check: { checkVersion: number; checksum: string; footerVersion: string; checkedAt: string; passed: boolean } | null;
  sources: (Source | null)[]; facts: (Fact | null)[]; prerequisites: string[];
}
export interface ContentContext {
  now: string; footerVersion: string; cohort: number;
  usedPostIds: ReadonlySet<string>; heldPostIds: ReadonlySet<string>; publishedPostIds: ReadonlySet<string>;
  recentAngles: ReadonlySet<string>; publishedBodies: ReadonlySet<string>;
}
export function normalizedBody(body: string): string {
  const trimmed = body.trim();
  const withoutFooter = trimmed.endsWith(FOOTER) ? trimmed.slice(0, -FOOTER.length) : trimmed;
  return removeTrailingSeparator(withoutFooter).normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}
function timestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19) ? parsed : NaN;
}
function validBefore(value: string | null, now: number): boolean {
  return value === null || (Number.isFinite(timestamp(value)) && timestamp(value) > now);
}
function sourceValid(source: Source | null, now: number): boolean {
  return source !== null && source.status === 'verified' && source.reviewedAt !== null
    && Number.isFinite(timestamp(source.reviewedAt)) && timestamp(source.reviewedAt) <= now
    && validBefore(source.reviewDueAt, now);
}
export function eligibility(post: Candidate, context: ContentContext): string[] {
  const now = timestamp(context.now);
  if (!Number.isFinite(now)) throw new Error('Invalid checked_at');
  const reasons: string[] = [];
  if (post.stage !== 'caption') reasons.push('BRIEF_ONLY');
  if (post.status !== 'ready') reasons.push('NOT_READY');
  const body = normalizedBody(post.body);
  if (!body) reasons.push('BODY_EMPTY');
  if (context.publishedBodies.has(body)) reasons.push('DUPLICATE_PUBLISHED_BODY');
  if (!validBefore(post.reviewDueAt, now)) reasons.push('REVIEW_EXPIRED');
  if (context.usedPostIds.has(post.postId)) reasons.push('ALREADY_USED');
  if (context.heldPostIds.has(post.postId)) reasons.push('HELD_OR_UNCERTAIN');
  if (post.prerequisites.some(id => !context.publishedPostIds.has(id))) reasons.push('PREREQUISITE_MISSING');
  if (post.sources.length === 0) reasons.push('SOURCE_MISSING');
  if (post.sources.some(source => !sourceValid(source, now))) reasons.push('SOURCE_UNVERIFIED_OR_EXPIRED');
  if (post.facts.some(fact => !fact || fact.status !== 'verified' || !sourceValid(fact.source, now)
    || !validBefore(fact.reviewDueAt, now) || (fact.cohort !== null && fact.cohort !== context.cohort)
    || (fact.key === 'training_duration_years' && fact.value !== 3.5)
    || (fact.key === 'cohort' && fact.value !== context.cohort))) reasons.push('FACT_INVALID');
  if (post.group === 'I' && ['training_duration_years','cohort'].some(key => !post.facts.some(f => f?.key === key))) reasons.push('PROGRAM_FACTS_MISSING');
  const asset = post.asset;
  if (!asset || asset.status !== 'complete' || asset.type !== 'image/png' || asset.width !== 1080
    || asset.height !== 1080 || asset.size <= 0 || asset.size > 5242880 || !asset.checksum) reasons.push('ASSET_NOT_READY');
  if (!asset || !post.binding || post.binding.assetId !== asset.id || post.binding.checksum !== asset.checksum
    || post.binding.checkVersion !== post.checkVersion) reasons.push('IMAGE_OUT_OF_SYNC');
  const check = post.check;
  if (!check || !check.passed || check.checkVersion !== post.checkVersion || check.checksum !== asset?.checksum
    || check.footerVersion !== context.footerVersion || !Number.isFinite(timestamp(check.checkedAt))
    || timestamp(check.checkedAt) > now) reasons.push('CHECKS_INVALID');
  if (check && [...post.sources, ...post.facts.map(f => f?.source ?? null)].some(s => s?.reviewedAt
    && timestamp(s.reviewedAt) > timestamp(check.checkedAt))) reasons.push('SOURCE_REVIEW_AFTER_CHECK');
  return reasons;
}
function uniquePosts(posts: readonly Candidate[]): Candidate[] {
  const ids = new Set<string>();
  for (const post of posts) {
    if (ids.has(post.postId)) throw new Error('Catalog must contain one active version per post');
    ids.add(post.postId);
  }
  return [...posts];
}
export function stock(posts: readonly Candidate[], context: ContentContext) {
  const catalog = uniquePosts(posts);
  const reasonCounts: Record<string, number> = {};
  let scheduled = 0, reserve = 0;
  for (const post of catalog) {
    const reasons = eligibility(post, context);
    for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    if (!reasons.length) post.pool === 'scheduled' ? scheduled++ : reserve++;
  }
  return { checked_at: context.now, total_post_count: catalog.length,
    eligible_distinct_post_count: scheduled + reserve, scheduled_count: scheduled, reserve_count: reserve,
    coverage_days: scheduled + reserve, low_stock: scheduled + reserve <= 3, reason_counts: reasonCounts };
}
export function chooseReserve(posts: readonly Candidate[], failed: Pick<Candidate, 'group' | 'audience'>,
  context: ContentContext, excluded: ReadonlySet<string> = new Set()): Candidate | null {
  const bucket = (post: Candidate) => post.group === failed.group
    ? (post.audience === failed.audience ? 0 : 1) : (post.audience === failed.audience ? 2 : 3);
  const candidates = uniquePosts(posts).filter(post => post.pool === 'reserve'
    && !excluded.has(post.postId) && eligibility(post, context).length === 0);
  candidates.sort((a, b) => bucket(a) - bucket(b)
    || Number(context.recentAngles.has(a.angle)) - Number(context.recentAngles.has(b.angle))
    || a.order - b.order || (a.postId < b.postId ? -1 : a.postId > b.postId ? 1 : 0));
  return candidates[0] ?? null;
}
