// Regenerate explicitly after a reviewed migration change. Contains no private content.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareCloud} from './cloud-prepare.mjs';
import {DESIGN_REGISTRY} from '../src/cloud/design-registry.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const {directory}=prepareCloud({output:'tmp/step-17/schema'}),db=new DatabaseSync(':memory:');
for(const name of readdirSync(directory+'/migrations').sort())db.exec(readFileSync(directory+'/migrations/'+name,'utf8'));
const schemas=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name NOT IN ('cloud_backups','cloud_backup_checks','cloud_telegram_runtime','cloud_telegram_attempts','cloud_meta_checks','cloud_meta_trial','cloud_daily_config','cloud_content_trial','cloud_presence_runs','cloud_presence_items') ORDER BY type,name").all();
const tables=schemas.filter(s=>s.type==='table').map(t=>({name:t.name,columns:db.prepare('PRAGMA table_info('+t.name+')').all().map(c=>c.name)}));
const extra=[...DESIGN_REGISTRY.fonts.map(f=>f.name),'BricolageGrotesque-OFL.txt','WorkSans-OFL.txt'].map(name=>{const bytes=readFileSync('assets/fonts/'+name);return {path:'fonts/'+name,sha256:hash(bytes),size:bytes.length};});
writeFileSync('src/cloud/backup-schema.ts','// Trusted schema/resource metadata; no snapshot contents.\nexport const BACKUP_SCHEMA = '+JSON.stringify({version:13,fingerprint:hash(JSON.stringify(schemas)),tables,extra},null,2)+';\n');db.close();
