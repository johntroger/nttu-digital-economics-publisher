export interface Brief {
  id: string; slot: number | null; pool: 'main' | 'reserve'; group: string; audience: 'SV' | 'HS';
  title: string; brief: string; image_brief: string; source_start: string; level: string;
  prerequisites: string[];
}
export function validateBriefs(input: unknown): Brief[] {
  if (!input || typeof input !== 'object' || !('posts' in input) || !Array.isArray(input.posts)
    || !('status' in input) || input.status !== 'briefs_only') throw new Error('Expected briefs_only catalog');
  const ids = new Set<string>();
  const posts: Brief[] = [];
  for (const row of input.posts) {
    if (!row || typeof row !== 'object') throw new Error('Invalid brief');
    const record = row as Record<string, unknown>;
    for (const key of ['id','title','brief','image_brief','source_start','level']) {
      if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`Missing brief field: ${key}`);
    }
    if (typeof record.id !== 'string' || !/^[PR]\d{2}$/.test(record.id) || ids.has(record.id)) throw new Error('Duplicate/invalid brief id');
    if (!['D','A','B','S','R','I'].includes(String(record.group)) || !['SV','HS'].includes(String(record.audience))
      || !['main','reserve'].includes(String(record.pool)) || record.status !== 'brief') throw new Error('Invalid brief classification');
    if ((record.pool === 'main' && (!Number.isInteger(record.slot) || Number(record.slot) < 1 || Number(record.slot) > 30))
      || (record.pool === 'reserve' && record.slot !== null)) throw new Error('Invalid brief slot');
    if (!Array.isArray(record.prerequisites) || record.prerequisites.some(id => typeof id !== 'string')) throw new Error('Invalid prerequisites');
    ids.add(record.id);
    posts.push(record as unknown as Brief);
  }
  if (posts.length !== 40 || posts.filter(p => p.pool === 'main').length !== 30
    || posts.filter(p => p.audience === 'SV').length !== 28 || posts.filter(p => p.group === 'I').length !== 8
    || new Set(posts.filter(p => p.pool === 'main').map(p => p.slot)).size !== 30) throw new Error('Initial catalog must match 40/30/10 and 70/30, 80/20');
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error('Cyclic prerequisite');
    const post = posts.find(p => p.id === id);
    if (!post) throw new Error('Unknown prerequisite');
    for (const prerequisite of post.prerequisites) visit(prerequisite, new Set([...path, id]));
  };
  for (const post of posts) visit(post.id, new Set());
  if (!('program_facts' in input) || !input.program_facts || typeof input.program_facts !== 'object'
    || !('training_duration_years' in input.program_facts) || input.program_facts.training_duration_years !== 3.5
    || !('cohort' in input.program_facts) || input.program_facts.cohort !== 2026
    || !('authority' in input.program_facts) || input.program_facts.authority !== 'user_confirmation') throw new Error('Program facts conflict with owner confirmation');
  return posts;
}
