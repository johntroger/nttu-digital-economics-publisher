import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {productionMigrations} from '../../scripts/production-management-prepare.mjs';
import {approvedPack} from '../../scripts/cloud-batch-import.mjs';
import {PRODUCTION_DB,productionWarehouseSQL} from '../../scripts/production-warehouse-import.mjs';
import {SOURCE_REGISTRY} from '../../src/cloud/source-registry.ts';
const json=p=>JSON.parse(readFileSync(p));
const pack=()=>approvedPack(json('content/batch-2026-v1.json'),json('content/batch-2026-v1.manifest.json'),json('content/samples/step22-approval.json'),json('content/batch/step23-approval.json'));
export function productionWarehouseFixture({realImages=false,testImageBytes}={}){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const m of productionMigrations(PRODUCTION_DB))db.exec(m.sql);
 const approved=pack();if(testImageBytes)for(const p of approved){const checksum=createHash('sha256').update(testImageBytes.get(p.id)).digest('hex');p.entry.image_sha256=checksum;p.approval.image_sha256=checksum;}
 const library=approved.map(p=>({id:p.id,kind:'image',state:'complete',checksum:p.entry.image_sha256,width:1080,height:1080}));
 library.push(...SOURCE_REGISTRY.filter(s=>s.authority==='document').map(s=>({id:s.id,kind:'document',state:'complete',source_key:s.id,checksum:s.sha256})));
 for(const f of library){const size=f.kind==='image'?(testImageBytes?testImageBytes.get(f.id).length:realImages?readFileSync(approved.find(p=>p.id===f.id).entry.image_path).length:5000):5000;db.prepare('INSERT INTO cloud_library VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(f.id,f.kind,f.id,f.source_key??null,f.checksum,'private/'+f.id,f.kind==='image'?'image/png':'application/pdf',size,f.width??null,f.height??null,'complete','owner','2026-10-07');if(f.kind==='image')db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run('library-'+f.id,'private/'+f.id,f.checksum,'image/png',1080,1080,size,'complete');}
 const env={META_PAGE_ID:'817593604765443',PRODUCTION_ASSET_BUCKET:'nttu-publisher-production-assets',APP_ENV:'production',INTEGRATION_MODE:'management',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:'a'.repeat(40),PRODUCTION_DATABASE_ID:PRODUCTION_DB,AUTH_ORIGIN:'https://nttu-publisher-production.example.workers.dev',SESSION_SIGNING_KEY:'b'.repeat(64),DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return{results:db.prepare(sql).all(...args)};}};}}};
 const sql=()=>productionWarehouseSQL(approved,library,'f'.repeat(64),'2026-10-07T03:00:00Z');
 const apply=()=>{db.exec('BEGIN');try{db.exec(sql());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 apply();return {db,approved,library,env,sql,apply};
}
