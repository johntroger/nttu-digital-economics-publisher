import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareProduction,STAGING_DATABASE_ID} from './production-prepare.mjs';
export function productionMigrations(databaseId) {
  if(typeof databaseId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)
    || databaseId.toLowerCase()===STAGING_DATABASE_ID || databaseId.replaceAll('-','')==='0'.repeat(32))throw Error('Invalid production database ID');
  // Validate the same resource boundary as the deployment configuration.
  const names=readdirSync('migrations').filter(x=>/^\d+.*\.sql$/.test(x)).sort();
  if(names.length!==6)throw Error('Review production base schema before adding migrations');
  const files=names.map(name=>({name,sql:readFileSync(resolve('migrations',name),'utf8')}));
  files.push({name:'0007_production_management.sql',sql:readFileSync('cloud/production-management.sql','utf8')+`\nINSERT INTO production_identity VALUES(1,'production','${databaseId}',1);\n`},
    {name:'0008_owner_management.sql',sql:readFileSync('cloud/owner-management.sql','utf8')},
    {name:'0009_private_storage.sql',sql:readFileSync('cloud/private-storage.sql','utf8')},
    {name:'0010_source_review.sql',sql:readFileSync('cloud/source-review.sql','utf8')},
    {name:'0011_production_meta.sql',sql:readFileSync('cloud/meta.sql','utf8')},
    {name:'0012_production_operations.sql',sql:readFileSync('cloud/telegram.sql','utf8')+readFileSync('cloud/production-operations.sql','utf8')},
    {name:'0013_production_http_trigger.sql',sql:readFileSync('cloud/production-http-trigger.sql','utf8')});
  return files.map((file,i)=>{const checksum=createHash('sha256').update(file.sql).digest('hex');return {...file,checksum,
    sql:(i===0?'CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL);\n':'')+file.sql+`\nINSERT INTO schema_migrations VALUES('${file.name}','${checksum}');\n`};});
}
export function prepareProductionManagement(settings,{output='tmp/production-management',clientId}={}) {
  if(typeof clientId!=='string'||! /^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Google Client ID required');
  const result=prepareProduction(settings,{output});const {directory,config}=result;
  config.main=relative(directory,resolve('src/production/worker.ts')).split(sep).join('/');
  config.vars={...config.vars,INTEGRATION_MODE:'management',AUTH_ORIGIN:new URL(settings.origin).origin,
    PRODUCTION_DATABASE_ID:settings.databaseId,GOOGLE_CLIENT_ID:clientId,
    META_APP_ID:'1125636386458970',META_PAGE_ID:'817593604765443',META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'production_verify',
    TELEGRAM_CHAT_ID:'1548618770',TELEGRAM_ENABLED:'true'};
  config.triggers={crons:['*/5 * * * *']};
  mkdirSync(resolve(directory,'migrations'),{recursive:true});
  for(const file of productionMigrations(settings.databaseId))writeFileSync(resolve(directory,'migrations',file.name),file.sql);
  config.d1_databases[0].migrations_dir='./migrations';
  mkdirSync(resolve(directory,'assets/fonts'),{recursive:true});
  for(const [from,to] of [['ui/production/manager.html','assets/manager.html'],['ui/production/management.js','assets/management.js'],['ui/production/management.css','assets/management.css'],
    ['assets/fonts/WorkSans-Regular.ttf','assets/fonts/WorkSans-Regular.ttf'],['assets/fonts/WorkSans-Bold.ttf','assets/fonts/WorkSans-Bold.ttf'],['assets/fonts/WorkSans-OFL.txt','assets/fonts/WorkSans-OFL.txt']])
    writeFileSync(resolve(directory,to),readFileSync(from));
  config.assets={directory:'./assets',binding:'ASSETS',run_worker_first:true};
  writeFileSync(resolve(directory,'wrangler.json'),JSON.stringify(config,null,2)+'\n');
  result.plan.phase='management';writeFileSync(resolve(directory,'readiness.json'),JSON.stringify(result.plan,null,2)+'\n');
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=prepareProductionManagement({databaseId:process.env.PRODUCTION_D1_DATABASE_ID,releaseSha:process.env.PRODUCTION_RELEASE_SHA,origin:process.env.PRODUCTION_WORKER_URL},{clientId:process.env.PRODUCTION_GOOGLE_CLIENT_ID});console.log('Prepared production management: '+r.directory);}
