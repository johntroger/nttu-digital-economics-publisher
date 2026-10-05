import { openCatalog, importBriefs } from './catalog-store.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizedBody } from '../src/domain/content.ts';
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
export function cloudSeedSQL() {
  const db = openCatalog();
  try {
    importBriefs(db, JSON.parse(readFileSync('content/content-plan-40.json', 'utf8')), { batch: 'staging-2026-v1' });
    const sql = ['-- Independent initial staging briefs, not a copy of the private local warehouse.'];
    for (const table of ['sources', 'facts', 'posts', 'post_versions', 'content_entries', 'version_sources', 'version_facts', 'post_prerequisites', 'content_imports']) {
      for (const row of db.prepare('SELECT * FROM ' + table).all()) {
        sql.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`);
      }
    }
    for (const row of db.prepare('SELECT p.id,v.id version_id,v.body FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id').all()) {
      sql.push(`INSERT INTO cloud_caption_keys VALUES (${[createHash('sha256').update(normalizedBody(row.body)).digest('hex'), row.id, row.version_id].map(literal).join(',')});`);
    }
    return sql.join('\n') + '\n';
  } finally { db.close(); }
}
