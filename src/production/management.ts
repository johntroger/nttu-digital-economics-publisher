import type {CloudBindings} from '../cloud/runtime.ts';
import {authConfigured} from '../cloud/auth.ts';
import {composeCaption,FOOTER,CAPTION_SEPARATOR} from '../domain/footer.ts';
import {verifiedBytes} from '../cloud/storage.ts';
import {productionMetaStatus} from './meta.ts';
import {operationsStatus} from './operations.ts';
export interface ManagementBindings extends CloudBindings { PRODUCTION_DATABASE_ID?:string; PRODUCTION_ASSET_BUCKET?:string; PRODUCTION_MONITOR_TOKEN?:string; PRODUCTION_TRIGGER_TOKEN?:string }
type Row=Record<string,unknown>;
export async function productionState(env:ManagementBindings) {
  if(env.APP_ENV!=='production'||env.INTEGRATION_MODE!=='management'||env.DAILY_PUBLISHING_ENABLED!=='false'
    ||!env.DB||!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA??'')
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.PRODUCTION_DATABASE_ID??'')
    || env.PRODUCTION_DATABASE_ID==='83881fd7-88e6-4835-b616-6f4f8f2d25cd') throw Error('PRODUCTION_NOT_CONFIGURED');
  const row=await env.DB.prepare(`SELECT i.environment,i.database_id,i.schema_version,a.paused_by_user,
    c.enabled,c.publish_time,c.timezone,c.target_page_url,c.page_id,c.connection_verified,
    (SELECT count(*) FROM schema_migrations) migration_count,
    (SELECT count(*) FROM schema_migrations WHERE name NOT IN ('0011_production_meta.sql','0012_production_operations.sql','0013_production_http_trigger.sql')) base_migration_count
    FROM production_identity i JOIN application_state a ON a.environment=i.environment
    JOIN production_control c ON c.id=i.id WHERE i.id=1`).first<Row>();
  if(!row||row.environment!=='production'||row.database_id!==env.PRODUCTION_DATABASE_ID||row.schema_version!==1
    ||![10,11,12,13].includes(Number(row.migration_count))||row.base_migration_count!==10||row.paused_by_user!==1||row.enabled!==0||row.connection_verified!==0
    ||row.page_id!==null||row.publish_time!=='10:00'||row.timezone!=='Asia/Ho_Chi_Minh'
    ||row.target_page_url!=='https://www.facebook.com/NganhKinhTeSoNTTU') throw Error('PRODUCTION_IDENTITY_INVALID');
  return row;
}
async function rows(env:ManagementBindings,sql:string) {
  const statement=env.DB!.prepare(sql);
  if(!statement.all) throw Error('PRODUCTION_DATABASE_UNAVAILABLE');
  return (await statement.all<Row>()).results;
}
export async function managementData(env:ManagementBindings) {
  const state=await productionState(env);
  const posts=await rows(env,`SELECT p.id,p.content_key,p.topic_group,p.pool,v.version,v.caption_title,
    v.body,v.status,e.stage,v.metadata_json,l.id image_id,r.id review_id FROM posts p JOIN content_entries e ON e.post_id=p.id
    JOIN post_versions v ON v.id=e.active_version_id LEFT JOIN cloud_library l ON v.asset_id='library-'||l.id AND l.state='complete'
    LEFT JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version ORDER BY p.content_key`);
  const history=await rows(env,`SELECT pub.remote_id,pub.confirmed_at,pub.caption_snapshot
    FROM publications pub JOIN publish_jobs j ON j.id=pub.job_id
    JOIN page_connections c ON c.id=j.page_connection_id WHERE c.environment='production'
    ORDER BY pub.confirmed_at DESC LIMIT 100`);
  const notifications=await rows(env,'SELECT event_id,state FROM notification_outbox ORDER BY event_id LIMIT 100');
  const schedule=await rows(env,`SELECT s.business_date,s.status FROM schedule_slots s
    JOIN page_connections c ON c.id=s.page_connection_id WHERE c.environment='production'
    ORDER BY s.business_date LIMIT 100`);
  const library=await rows(env,'SELECT kind,count(*) count FROM cloud_library WHERE state=\'complete\' GROUP BY kind');
  const libraryFiles=await rows(env,"SELECT id,kind,filename,source_key,checksum,size_bytes FROM cloud_library WHERE state='complete' ORDER BY kind,filename");
  const meta=await productionMetaStatus(env);
  const operations=await operationsStatus(env);
  return {environment:'production',readOnly:true,publishingEnabled:false,schedulerImplemented:false,
    ownerLoginConfigured:authConfigured(env),targetPageUrl:state.target_page_url,pageId:meta.pageId,connectionVerified:meta.lastCheck?.verifiedReadOnly??false,meta,operations,
    publishTime:state.publish_time,timeZone:state.timezone,paused:true,
    posts:posts.map(p=>{const meta=JSON.parse(String(p.metadata_json));return {...p,metadata_json:undefined,
      sourceRefs:meta.sourceRefs??[],contentDesignApproved:Boolean(p.review_id),imageUrl:p.image_id?'/api/library/files/'+p.image_id:null,caption:composeCaption(String(p.body))};}),history,notifications,schedule,library,libraryFiles,
    footer:FOOTER,separator:CAPTION_SEPARATOR};
}
export async function productionFile(env:ManagementBindings,id:string) {
  const row=await env.DB!.prepare("SELECT * FROM cloud_library WHERE id=? AND state='complete'").bind(id).first<Row>();
  if(!row)return new Response('File unavailable',{status:404,headers:{'Cache-Control':'no-store'}});
  const bytes=await verifiedBytes(env,row);
  return new Response(bytes,{headers:{'Content-Type':String(row.content_type),'Content-Length':String(bytes.length),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
    'Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(String(row.filename))}});
}
