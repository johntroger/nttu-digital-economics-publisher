import {mkdirSync, writeFileSync, realpathSync} from 'node:fs';
import {resolve, relative, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const STAGING_DATABASE_ID='83881fd7-88e6-4835-b616-6f4f8f2d25cd';
export const OFFICIAL_PAGE_URL='https://www.facebook.com/NganhKinhTeSoNTTU';
export function productionConfig({databaseId,releaseSha,origin}) {
  if (typeof databaseId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)
    || databaseId.toLowerCase()===STAGING_DATABASE_ID || databaseId.replaceAll('-','')==='0'.repeat(32))
    throw new Error('A separate real production D1 database ID is required');
  if (typeof releaseSha!=='string' || !/^[a-f0-9]{40}$/.test(releaseSha)) throw new Error('Full tested release SHA required');
  const url=new URL(origin);
  if (url.protocol!=='https:' || !/^nttu-publisher-production\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
    || url.pathname!=='/' || url.search || url.hash || url.username || url.password || url.port)
    throw new Error('Separate production workers.dev origin required');
  return {name:'nttu-publisher-production', compatibility_date:'2026-10-05',workers_dev:true,
    preview_urls:false, keep_vars:false,
    vars:{APP_ENV:'production',INTEGRATION_MODE:'bootstrap',DAILY_PUBLISHING_ENABLED:'false',RELEASE_SHA:releaseSha},
    triggers:{crons:[]},
    d1_databases:[{binding:'DB',database_name:'nttu-publisher-production',database_id:databaseId}],
    r2_buckets:[{binding:'MEDIA',bucket_name:'nttu-publisher-production-assets'}],
    observability:{enabled:false}};
}
export function prepareProduction(settings,{output='tmp/production-bootstrap'}={}) {
  const config=productionConfig(settings);
  // Resolve an existing parent before writing, including junction/symlink targets.
  const tmp=realpathSync(resolve('tmp')), directory=resolve(output);
  if (resolve(realpathSync(resolve(directory,'..')))!==tmp || !/^[a-zA-Z0-9_-]+$/.test(relative(tmp,directory)))
    throw new Error('Production output must be a direct directory inside tmp');
  mkdirSync(directory,{recursive:true});
  if (realpathSync(directory)!==directory) throw new Error('Redirected output directory is not allowed');
  config.main=relative(directory,resolve('src/production/bootstrap.ts')).split(sep).join('/');
  const plan={phase:'bootstrap',targetPageUrl:OFFICIAL_PAGE_URL,targetPageId:null,
    publishTime:'10:00',timeZone:'Asia/Ho_Chi_Minh',automaticPostsPerDay:1,
    connectionVerified:false,contentImported:false,productionActivationApproved:false,
    requiredBeforePublishing:['production runtime and schema','owner Google login',
      'verified official Page ID and token permissions','approved content and private assets import',
      'production Telegram, independent monitor and recovery backup','separate activation approval'],
    staging:{worker:'nttu-publisher-staging',databaseId:STAGING_DATABASE_ID,unchanged:true}};
  writeFileSync(resolve(directory,'wrangler.json'),JSON.stringify(config,null,2)+'\n');
  writeFileSync(resolve(directory,'readiness.json'),JSON.stringify(plan,null,2)+'\n');
  return {directory,config,plan};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=prepareProduction({databaseId:process.env.PRODUCTION_D1_DATABASE_ID,
    releaseSha:process.env.PRODUCTION_RELEASE_SHA,origin:process.env.PRODUCTION_WORKER_URL});
  console.log('Prepared isolated, non-publishing bootstrap: '+result.directory);
}
