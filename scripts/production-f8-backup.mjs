// F8 read-only production backup and in-memory restore. Never deploys or sends.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {productionMigrations} from './production-management-prepare.mjs';
const account='4d46e32e5c27ff522ee857308a53e729',id='09cdecc7-36a2-4196-950e-ef68b1ecd834';
const root='tmp/step38/f8',backup=root+'/backup';
mkdirSync(backup,{recursive:true});
const token=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('Cloudflare OAuth unavailable');
async function cf(path,body){const r=await fetch('https://api.cloudflare.com/client/v4/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||j.success===false||j.errors?.length)throw Error('Cloudflare read failed: '+r.status);return j;}
const now=new Date();
const usage=await cf('graphql',{query:'query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{rowsRead rowsWritten}}}}}',variables:{account,start:now.toISOString().slice(0,10)+'T00:00:00Z',end:now.toISOString()}});
const groups=usage.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;assert(Array.isArray(groups));
const quota={capturedAt:now.toISOString(),account,rowsRead:groups.reduce((s,x)=>s+x.sum.rowsRead,0),rowsWritten:groups.reduce((s,x)=>s+x.sum.rowsWritten,0),analyticsMayLag:true};
const storage=await cf('accounts/'+account+'/r2/metrics');
writeFileSync(root+'/preflight.json',JSON.stringify({quota,r2:storage.result},null,2));
assert(quota.rowsRead<3000000&&quota.rowsWritten<50000,'Daily D1 safety threshold exceeded');
const sql="SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM cloud_library) assets,(SELECT count(*) FROM schema_migrations) migrations,(SELECT count(*) FROM production_send_permits) permits,(SELECT count(*) FROM production_publisher_jobs) jobs,(SELECT count(*) FROM production_publisher_attempts) intents,(SELECT count(*) FROM production_publisher_usage) publications,c.enabled,a.paused_by_user FROM production_publisher_config c JOIN application_state a ON a.environment='production' WHERE c.id=1";
async function snapshot(){const r=await cf('accounts/'+account+'/d1/database/'+id+'/query',{sql,params:[]});const row=r.result[0].results[0];assert.deepEqual(row,{posts:40,assets:56,migrations:14,permits:0,jobs:0,intents:0,publications:0,enabled:0,paused_by_user:1});return row;}
const before=await snapshot();
const live=await cf('accounts/'+account+'/workers/scripts/nttu-publisher-production/settings');
const deployments=await cf('accounts/'+account+'/workers/scripts/nttu-publisher-production/deployments');
// Secret values are not returned by this endpoint; retain names/types only.
const settings={...live.result,bindings:live.result.bindings.map(b=>b.type==='secret_text'?{type:b.type,name:b.name}:b)};
writeFileSync(backup+'/settings-before.json',JSON.stringify(settings,null,2));
writeFileSync(backup+'/deployments-before.json',JSON.stringify(deployments.result,null,2));
const path=backup+'/production-schema14.sql';assert(!existsSync(path),'Existing real backup must not be overwritten');
const run=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','nttu-publisher-production','--remote','--config','tmp/production-management/wrangler.json','--output',path],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'},timeout:180000});
if(run.status!==0)throw Error('Production export failed; no migration performed');
const bytes=readFileSync(path),hash=createHash('sha256').update(bytes).digest('hex');
writeFileSync(path+'.sha256',hash+'  production-schema14.sql\n');
const db=new DatabaseSync(':memory:');
let report;
try{
 db.exec(bytes.toString());
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
 assert.deepEqual({...db.prepare(sql).get()},before);
 const protectedTables=['posts','cloud_library','production_publisher_jobs','production_publisher_attempts','production_publisher_usage'];
 const fingerprint=()=>createHash('sha256').update(JSON.stringify(protectedTables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]))).digest('hex');
 const initial=fingerprint();
 const migrations=productionMigrations(id,{publisherRunner:true}).slice(14);
 for(const m of migrations){db.exec('BEGIN');try{db.exec(m.sql);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}writeFileSync(root+'/'+m.name,m.sql);}
 assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,16);assert.equal(fingerprint(),initial);
 db.exec('BEGIN');db.exec(readFileSync('cloud/production-publisher-runner-rollback.sql','utf8'));db.exec('COMMIT');
 assert.equal(db.prepare('SELECT count(*) n FROM schema_migrations').get().n,15);assert.equal(fingerprint(),initial);
 report={capturedAt:new Date().toISOString(),backupSha256:hash,bytes:bytes.length,before,integrity:'ok',foreignKeyErrors:0,migration14to16:true,rollback16to15:true,protectedDataSha256:initial,liveChanged:false};
}finally{db.close();}
await snapshot();
writeFileSync(root+'/backup-restore.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({quota,backupSha256:hash,restoreAccepted:true,liveChanged:false}));
