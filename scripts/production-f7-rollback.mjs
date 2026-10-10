// Local disposable clone only. Exercise the actual rollback SQL with a completed
// journal; no credentials, cloud deployments or real provider transport.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {runSimulatedActionsRunner} from './production-actions-runner.mjs';
import {pauseProductionPublisher} from '../src/production/publisher-live.ts';
const f=await runnerFixture();
try{
 const confirmed=await runSimulatedActionsRunner(f.options);
 assert.equal(confirmed.state,'confirmed');assert.equal(f.postCount(),1);
 await pauseProductionPublisher(f.env,'tranthanhtung37@gmail.com');
 const tables=['posts','assets','sources','content_entries','post_versions','cloud_reviews','cloud_library','production_publisher_jobs','production_publisher_attempts','production_publisher_evidence','production_publisher_usage'];
 const snapshot=()=>Object.fromEntries(tables.map(table=>[table,JSON.stringify(f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())]));
 const before=snapshot();
 f.db.exec('BEGIN');try{f.db.exec(readFileSync('cloud/production-publisher-runner-rollback.sql','utf8'));f.db.exec('COMMIT');}catch(error){f.db.exec('ROLLBACK');throw error;}
 assert.deepEqual(snapshot(),before);
 assert.equal(f.db.prepare('SELECT count(*) count FROM schema_migrations').get().count,15);
 assert.equal(f.db.prepare('SELECT count(*) count FROM posts').get().count,40);
 assert.equal(f.postCount(),1);
 const result={runtime:'local SQLite clone + actual transactional rollback SQL',schemaBefore:16,schemaAfter:15,warehousePosts:40,warehouseAndJournalUnchanged:true,snapshotSHA256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),mockPosts:1,realMetaPosts:0,realTelegramMessages:0,cloudRollbackAccepted:false,rolloutApproved:false};
 mkdirSync('tmp/step38/f7',{recursive:true});writeFileSync('tmp/step38/f7/rollback-local-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await f.dispose();}
