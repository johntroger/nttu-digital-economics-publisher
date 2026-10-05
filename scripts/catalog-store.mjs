import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateBriefs } from '../src/domain/briefs.ts';

export function migrate(db) {
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    const sql = readFileSync(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = db.prepare('SELECT checksum FROM schema_migrations WHERE name=?').get(name);
    if (previous) {
      if (previous.checksum !== checksum) throw new Error(`Migration changed: ${name}`);
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, checksum);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
export function openCatalog(path = ':memory:') {
  const db = new DatabaseSync(path);
  try { migrate(db); return db; } catch (error) { db.close(); throw error; }
}
export const reader = db => ({ all: (sql, ...parameters) => db.prepare(sql).all(...parameters) });

export function importBriefs(db, input, { batch = 'initial-2026-v1', now = '2026-10-05T00:00:00Z' } = {}) {
  const briefs = validateBriefs(input);
  if (!Number.isFinite(Date.parse(now)) || !batch.trim()) throw new Error('Invalid import identity/time');
  const checksum = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT checksum FROM content_imports WHERE batch_id=?').get(batch);
    if (existing) {
      if (existing.checksum !== checksum) throw new Error('Batch changed: use a new reviewed batch, never overwrite');
      db.exec('COMMIT');
      return { imported: 0, unchanged: briefs.length, batch };
    }
    const ownerSource = `${batch}:owner-confirmation`;
    db.prepare(`INSERT INTO sources(id,title,revision,locator,authority,status,reviewed_at)
      VALUES (?,?,?,'Owner conversation: duration/cohort','user_confirmation','verified',?)`)
      .run(ownerSource, 'Thông tin khóa 2026 do chủ tài khoản xác nhận', '2026-10-04', '2026-10-04T00:00:00Z');
    for (const [key, value] of [['training_duration_years', 3.5], ['cohort', 2026]]) {
      db.prepare(`INSERT INTO facts(id,source_id,fact_key,value_json,cohort,status) VALUES (?,?,?,?,2026,'verified')`)
        .run(`${batch}:${key}`, ownerSource, key, JSON.stringify(value));
    }
    for (const [index, brief] of briefs.entries()) {
      const id = `${batch}:${brief.id}`, version = `${id}:v1`, hintSource = `${id}:source-hint`;
      db.prepare('INSERT INTO posts VALUES (?,?,?,?,?,?)').run(id, batch, brief.id, brief.group, brief.pool === 'main' ? 'scheduled' : 'reserve', now);
      db.prepare(`INSERT INTO post_versions(id,post_id,version,body,caption_title,image_headline,image_description,primary_audience,metadata_json)
        VALUES (?,?,1,?,?,?,?,?,?)`).run(version, id, brief.brief, brief.title, brief.title, brief.image_brief,
        brief.audience === 'SV' ? 'student' : 'prospective_student', JSON.stringify({
          isBrief: true, level: brief.level, sourceHint: brief.source_start, plannedSlot: brief.slot,
          concept: brief.group, angle: brief.id,
        }));
      db.prepare('INSERT INTO content_entries VALUES (?,?,?,?,?,?)').run(id, version, brief.group, brief.id, index + 1, 'brief');
      db.prepare(`INSERT INTO sources(id,title,revision,locator,authority) VALUES (?,?,'hint-only',?,'document')`)
        .run(hintSource, `Nguồn cần đối chiếu cho ${brief.id}`, brief.source_start);
      db.prepare('INSERT INTO version_sources VALUES (?,?,?)').run(version, hintSource, brief.source_start);
      if (brief.group === 'I') {
        db.prepare('INSERT INTO version_sources VALUES (?,?,?)').run(version, ownerSource, 'Xác nhận khóa 2026, thời lượng 3,5 năm');
        for (const key of ['training_duration_years','cohort']) db.prepare('INSERT INTO version_facts VALUES (?,?)').run(version, `${batch}:${key}`);
      }
    }
    for (const brief of briefs) for (const prerequisite of brief.prerequisites) {
      db.prepare('INSERT INTO post_prerequisites VALUES (?,?)').run(`${batch}:${brief.id}`, `${batch}:${prerequisite}`);
    }
    db.prepare('INSERT INTO content_imports VALUES (?,?,?)').run(batch, checksum, now);
    db.exec('COMMIT');
    return { imported: briefs.length, unchanged: 0, batch };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
