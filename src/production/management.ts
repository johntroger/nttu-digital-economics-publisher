import type {CloudBindings} from '../cloud/runtime.ts';
import {authConfigured} from '../cloud/auth.ts';
import {composeCaption,FOOTER,CAPTION_SEPARATOR} from '../domain/footer.ts';
import {verifiedBytes} from '../cloud/storage.ts';
import {productionMetaStatus} from './meta.ts';
import {operationsStatus} from './operations.ts';
import {digest,readSnapshot,readCursor,initialCursor,signCursor} from './read-pages.ts';
export interface ManagementBindings extends CloudBindings { PRODUCTION_DATABASE_ID?:string; PRODUCTION_ASSET_BUCKET?:string; PRODUCTION_MONITOR_TOKEN?:string; PRODUCTION_TRIGGER_TOKEN?:string; PRODUCTION_PUBLISHER_ENABLED?:string; PRODUCTION_PUBLISHER_TOKEN?:string }
type Row=Record<string,unknown>;
export function assertProductionEnvironment(env:ManagementBindings) {
  if(env.APP_ENV!=='production'||env.INTEGRATION_MODE!=='management'||env.DAILY_PUBLISHING_ENABLED!=='false'
    ||!env.DB||!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA??'')
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.PRODUCTION_DATABASE_ID??'')
    || env.PRODUCTION_DATABASE_ID==='83881fd7-88e6-4835-b616-6f4f8f2d25cd') throw Error('PRODUCTION_NOT_CONFIGURED');
}
export const PRODUCTION_STATE_SQL=`SELECT i.environment,i.database_id,i.schema_version,a.paused_by_user,a.maintenance_owner,a.blocked_reasons,a.operation_generation,
    c.enabled,c.publish_time,c.timezone,c.target_page_url,c.page_id,c.connection_verified,
    (SELECT count(*) FROM schema_migrations) migration_count,
    (SELECT count(*) FROM schema_migrations WHERE name NOT IN ('0011_production_meta.sql','0012_production_operations.sql','0013_production_http_trigger.sql','0014_production_publisher.sql','0015_production_publisher_stages.sql')) base_migration_count
    FROM production_identity i JOIN application_state a ON a.environment=i.environment
    JOIN production_control c ON c.id=i.id WHERE i.id=1`;
export function assertProductionState(env:ManagementBindings,row:Row|null|undefined) {
  assertProductionEnvironment(env);
  if(!row||row.environment!=='production'||row.database_id!==env.PRODUCTION_DATABASE_ID||row.schema_version!==1
    ||![10,11,12,13,14,15].includes(Number(row.migration_count))||row.base_migration_count!==10||!(row.paused_by_user===1||row.paused_by_user===0&&Number(row.migration_count)===15&&env.PRODUCTION_PUBLISHER_ENABLED==='true')||row.enabled!==0||row.connection_verified!==0
    ||row.page_id!==null||row.publish_time!=='10:00'||row.timezone!=='Asia/Ho_Chi_Minh'
    ||row.target_page_url!=='https://www.facebook.com/NganhKinhTeSoNTTU') throw Error('PRODUCTION_IDENTITY_INVALID');
  return row;
}
export async function productionState(env:ManagementBindings) {
  assertProductionEnvironment(env);
  return assertProductionState(env,await env.DB!.prepare(PRODUCTION_STATE_SQL).first<Row>());
}
export function productionPublishingEnabled(env:ManagementBindings,state:Row,enabled:unknown,blocked:unknown){
 return env.PRODUCTION_PUBLISHER_ENABLED==='true'&&/^[a-f0-9]{64}$/.test(env.PRODUCTION_PUBLISHER_TOKEN??'')&&env.PRODUCTION_PUBLISHER_TOKEN!==env.PRODUCTION_MONITOR_TOKEN&&env.PRODUCTION_PUBLISHER_TOKEN!==env.PRODUCTION_TRIGGER_TOKEN
  &&Number(state.migration_count)===15&&enabled===1&&blocked===null&&state.paused_by_user===0&&state.maintenance_owner===null&&state.blocked_reasons==='[]';
}
export async function productionRuntimeState(env:ManagementBindings,state:Row){
 const c=env.PRODUCTION_PUBLISHER_ENABLED==='true'&&Number(state.migration_count)===15?await env.DB!.prepare('SELECT enabled,blocked FROM production_publisher_config WHERE id=1').first<Row>():null;
 return {paused:state.paused_by_user===1,publishingEnabled:productionPublishingEnabled(env,state,c?.enabled,c?.blocked)};
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

export async function managementSummary(env:ManagementBindings){
 const state=await productionState(env);
 const result=await env.DB!.prepare(`SELECT (SELECT count(*) FROM posts) posts,(SELECT count(*) FROM posts WHERE pool='scheduled') main,(SELECT count(*) FROM posts WHERE pool='reserve') reserve,(SELECT count(*) FROM cloud_library WHERE state='complete') files,(SELECT count(*) FROM ${Number(state.migration_count)>=14?'production_publisher_usage':'publications'}) publications,${Number(state.migration_count)>=14?'(SELECT enabled FROM production_publisher_config WHERE id=1) publisher_enabled,(SELECT blocked FROM production_publisher_config WHERE id=1) publisher_blocked':'0 publisher_enabled,NULL publisher_blocked'}`).first<Row>();
 if(!result)throw Error('PRODUCTION_DATABASE_UNAVAILABLE');const {publisher_enabled,publisher_blocked,...counts}=result;
 return {environment:'production',readOnly:true,publishingEnabled:productionPublishingEnabled(env,state,publisher_enabled,publisher_blocked),paused:state.paused_by_user===1,targetPageUrl:state.target_page_url,publishTime:state.publish_time,timeZone:state.timezone,counts};
}
export async function managementPostPage(env:ManagementBindings,token?:string,now=Date.now()){
 await productionState(env);const c0=await readCursor(env,token,'post-list',now),before=await readSnapshot(env,now),snapshot=await digest(before);
 if(c0&&c0.snapshot!==snapshot)throw Error('READ_SNAPSHOT_CHANGED');const c=c0??initialCursor(env,'post-list',snapshot,now);
 const items=(await env.DB!.prepare(`SELECT p.id,p.content_key,p.pool,v.id version_id,v.version,v.caption_title,r.id review_id FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id LEFT JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version ORDER BY p.content_key,p.id LIMIT 5 OFFSET ?`).bind(c.offset).all!<Row>()).results;
 const total=Number((await env.DB!.prepare('SELECT count(*) n FROM posts').first<{n:number}>())!.n);
 if(await readSnapshot(env,now)!==before)throw Error('READ_SNAPSHOT_CHANGED');const next=c.offset+items.length;
 return {items,total,checkedThrough:next,snapshot,nextCursor:next<total?await signCursor(env,{...c,offset:next}):null};
}
export async function managementPostDetail(env:ManagementBindings,id:string){
 await productionState(env);
 const p=await env.DB!.prepare(`SELECT p.id,p.content_key,p.pool,v.id version_id,v.version,v.caption_title,v.body,v.metadata_json,l.id image_id,r.id review_id FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id LEFT JOIN cloud_library l ON v.asset_id='library-'||l.id AND l.state='complete' LEFT JOIN cloud_reviews r ON r.version_id=v.id AND r.check_version=v.check_version WHERE p.id=?`).bind(id).first<Row>();
 if(!p)throw Error('READ_POST_NOT_FOUND');const meta=JSON.parse(String(p.metadata_json));
 const documents=await rows(env,"SELECT id,source_key FROM cloud_library WHERE kind='document' AND state='complete'");
 return {...p,metadata_json:undefined,sourceRefs:meta.sourceRefs??[],sourceFiles:documents,contentDesignApproved:Boolean(p.review_id),imageUrl:p.image_id?'/api/library/files/'+p.image_id:null,caption:composeCaption(String(p.body))};
}
export async function managementSection(env:ManagementBindings,section:string){
 await productionState(env);
 if(section==='library')return {items:await rows(env,"SELECT id,kind,filename,source_key,checksum,size_bytes FROM cloud_library WHERE state='complete' ORDER BY kind,filename")};
 if(section==='history')return {items:await rows(env,'SELECT remote_id,confirmed_at,caption caption_snapshot FROM production_publisher_usage ORDER BY confirmed_at DESC LIMIT 100')};
 if(section==='schedule')return {items:await rows(env,'SELECT business_date,due_at,mode,revoked FROM production_send_permits ORDER BY due_at DESC LIMIT 100')};
 throw Error('READ_SECTION_INVALID');
}
