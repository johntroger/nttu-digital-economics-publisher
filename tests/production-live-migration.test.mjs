import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {liveFixture} from './helpers/production-live-fixture.mjs';
const dbId='09cdecc7-36a2-4196-950e-ef68b1ecd834';
test('Publisher migration is atomic; empty closed rollback restores schema13; rollback refuses any send permit',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const migrations=productionMigrations(dbId);for(const m of migrations.slice(0,-1))db.exec(m.sql);
  db.exec('BEGIN');assert.throws(()=>db.exec(migrations.at(-1).sql+'SELECT absent_step37_table;'));db.exec('ROLLBACK');assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,13);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='production_publisher_config'").get().n,0);
  db.exec(migrations.at(-1).sql);assert.equal(db.prepare('SELECT enabled FROM production_publisher_config').get().enabled,0);assert.equal(db.prepare('SELECT paused_by_user FROM application_state').get().paused_by_user,1);
  db.exec('BEGIN');db.exec(readFileSync('cloud/production-publisher-rollback.sql','utf8'));db.exec('COMMIT');assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,13);
 }finally{db.close();}
 const f=await liveFixture({open:true});try{f.db.exec("UPDATE production_publisher_config SET enabled=0;UPDATE application_state SET paused_by_user=1 WHERE environment='production'");f.db.exec('BEGIN');assert.throws(()=>f.db.exec(readFileSync('cloud/production-publisher-rollback.sql','utf8')),/CHECK/);f.db.exec('ROLLBACK');assert.equal(f.db.prepare('SELECT count(*) n FROM production_send_permits').get().n,1);}finally{f.db.close();}
});
