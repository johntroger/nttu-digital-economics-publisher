import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { openCatalog, importBriefs, reader } from './catalog-store.mjs';
import { readCatalog } from '../src/storage/catalog.ts';
import { stock } from '../src/domain/content.ts';
import { FOOTER_VERSION } from '../src/domain/footer.ts';

// Local inspection only. This command never creates jobs, slots or remote connections.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--database')) throw new Error('Usage: npm run catalog -- [--database tmp/catalog.sqlite]');
let path = ':memory:';
if (args[1]) {
  path = resolve(args[1]);
  const within = relative(resolve('tmp'), path);
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Local database must stay under workspace tmp/');
  mkdirSync(dirname(path), { recursive: true });
}
const db = openCatalog(path);
try {
  const input = JSON.parse(readFileSync(new URL('../content/content-plan-40.json', import.meta.url), 'utf8'));
  const now = new Date().toISOString();
  if (db.prepare('SELECT count(*) n FROM page_connections').get().n) throw new Error('Inspection database must be unconnected; use page-scoped repository for connected inventory');
  const result = importBriefs(db, input, { now });
  const catalog = readCatalog(reader(db));
  const context = { now, footerVersion: FOOTER_VERSION, cohort: 2026, usedPostIds: new Set(), heldPostIds: new Set(),
    publishedPostIds: new Set(), recentAngles: new Set(), publishedBodies: new Set() };
  console.log(JSON.stringify({ mode: 'local-inspection', database: path, import: result, stock: stock(catalog, context),
    drafts: catalog.filter(p => p.stage === 'brief').length,
    note: 'Nguồn gợi ý chưa được kiểm định; chưa có caption/PNG hoàn chỉnh. Không đăng bài.' }, null, 2));
} finally { db.close(); }
