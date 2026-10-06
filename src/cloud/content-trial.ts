import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import type {SourceDefinition} from './source-registry.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';
import {createCloudReview} from './review.ts';
import {composeCaption} from '../domain/footer.ts';
import {checksum,verifiedBytes} from './storage.ts';
import {checkMeta,metaConfigured} from './meta.ts';
import {TRIAL_PAGE} from './meta-trial.ts';
import {versionGuard} from './daily.ts';
import {sendDailyMeta,verifyDailyMeta,validDailyPost} from './daily-meta.ts';
import type {DailyResult} from './daily-meta.ts';
type Row=Record<string,unknown>;
type Options={now?:number;transport?:typeof fetch;registry?:readonly SourceDefinition[]};
const rows=async(env:CloudBindings,q:string,...v:(string|number|null)[])=>(await env.DB!.prepare(q).bind(...v).all!<Row>()).results;
const get=async(env:CloudBindings)=>(await rows(env,'SELECT * FROM cloud_content_trial WHERE id=1'))[0];
function fail(code:string):never{throw new CatalogError(code,409);}
const configHash=(env:CloudBindings)=>checksum(new TextEncoder().encode(JSON.stringify([env.META_APP_ID,env.META_PAGE_ID,env.META_API_VERSION,env.META_CONNECTION_PURPOSE])));
const idle=`EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL AND blocked_reasons='[]')
 AND NOT EXISTS(SELECT 1 FROM cloud_daily_config WHERE enabled=1)
 AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE state IN ('held','publish_requested','evidence_pending','retry_wait','unknown'))
 AND NOT EXISTS(SELECT 1 FROM cloud_meta_trial WHERE state IN ('intent','unknown'))`;
async function gate(env:CloudBindings){const state=await readStatus(env);if(state.paused_by_user!==1||env.META_PAGE_ID!==TRIAL_PAGE||!metaConfigured(env))fail('CONTENT_TRIAL_PAGE_OR_PAUSE');}
function model(r:Row){return{requestId:r.request_id,versionId:r.version_id,checkVersion:r.check_version,title:r.title,caption:r.caption,imageUrl:'/api/library/files/'+r.file_id,imageChecksum:r.checksum,state:r.state,remoteId:r.remote_id,photoId:r.photo_id,url:r.state==='published'?'https://www.facebook.com/'+r.remote_id:null,confirmedAt:r.confirmed_at};}
export async function contentTrialStatus(env:CloudBindings){await readStatus(env);const r=await get(env);return{pageId:TRIAL_PAGE,postKey:'P01',dailySchedulePaused:(await readStatus(env)).paused_by_user===1,trial:r?model(r):null};}
export async function prepareContentTrial(env:CloudBindings,owner:OwnerSession,input:unknown,options:Options={}){
 await gate(env);const p=input as Row|null,now=options.now??Date.now();
 if(!p||typeof p.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(p.requestId)||typeof p.expectedVersion!=='string')fail('CONTENT_TRIAL_INPUT_INVALID');
 const old=await get(env);if(old){if(old.request_id!==p.requestId||old.version_id!==p.expectedVersion)fail('CONTENT_TRIAL_ALREADY_PREPARED');return model(old);}
 const v=(await rows(env,"SELECT v.*,p.id post_id FROM posts p JOIN content_entries e ON e.post_id=p.id JOIN post_versions v ON v.id=e.active_version_id WHERE p.content_key='P01' AND v.id=?",p.expectedVersion))[0];if(!v)fail('CONTENT_TRIAL_P01_VERSION_REQUIRED');
 const audit=await createCloudReview(env,options.registry).auditPost(String(v.post_id));if(!audit.reviewed||audit.issues.length||audit.versionId!==v.id)fail('CONTENT_TRIAL_REVIEW_REQUIRED');
 const file=(await rows(env,"SELECT l.* FROM cloud_library l JOIN assets a ON a.id='library-'||l.id WHERE a.id=? AND l.state='complete' AND a.status='complete'",String(v.asset_id)))[0];if(!file)fail('CONTENT_TRIAL_IMAGE_REQUIRED');await verifiedBytes(env,file);
 await env.DB!.prepare(`INSERT INTO cloud_content_trial(id,request_id,version_id,check_version,config_hash,caption,title,file_id,checksum,prepared_at,actor,state)
 SELECT 1,?,?,?,?,?,?,?,?,?,?,'prepared' WHERE ${idle} AND ${versionGuard('?',now)} ON CONFLICT(id) DO NOTHING`).bind(p.requestId,String(v.id),Number(v.check_version),await configHash(env),composeCaption(String(v.body)),String(v.caption_title),String(file.id),String(file.checksum),now,owner.email,String(v.id)).run();
 const r=await get(env);if(!r||r.request_id!==p.requestId)fail('CONTENT_TRIAL_BUSY');return model(r);
}
async function confirm(env:CloudBindings,r:Row,result:Extract<DailyResult,{kind:'confirmed'}>,now:number){
 if(!env.DB?.batch)fail('CLOUD_DATABASE_UNAVAILABLE');
 await env.DB.batch([
  env.DB.prepare("UPDATE cloud_content_trial SET state='published',remote_id=?,photo_id=?,confirmed_at=?,result_json=? WHERE id=1 AND state IN ('intent','unknown')").bind(result.remoteId,result.photoId,now,JSON.stringify(result)),
  env.DB.prepare("INSERT INTO notification_outbox(event_id,payload_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM cloud_content_trial WHERE id=1 AND state='published' AND remote_id=?) ON CONFLICT(event_id) DO NOTHING").bind('content-trial:'+r.request_id,JSON.stringify({kind:'published',environment:'staging',title:r.title,page:'Tập Viết',url:'https://www.facebook.com/'+result.remoteId,time:new Date(result.publishedAt).toISOString()}),result.remoteId),
 ]);
}
export async function sendContentTrial(env:CloudBindings,owner:OwnerSession,input:unknown,options:Options={}){
 await gate(env);const p=input as Row|null,now=options.now??Date.now(),transport=options.transport??fetch;
 if(!p||p.confirmPageId!==TRIAL_PAGE||p.approveCaption!==true||p.approveImage!==true||typeof p.requestId!=='string')fail('CONTENT_TRIAL_APPROVAL_REQUIRED');
 const r=await get(env);if(!r||r.request_id!==p.requestId)fail('CONTENT_TRIAL_NOT_PREPARED');if(r.state!=='prepared')return model(r);
 if(r.config_hash!==await configHash(env))fail('CONTENT_TRIAL_CONFIG_CHANGED');
 const v=(await rows(env,'SELECT post_id FROM post_versions WHERE id=?',String(r.version_id)))[0]!;
 const audit=await createCloudReview(env,options.registry).auditPost(String(v.post_id));if(!audit.reviewed||audit.versionId!==r.version_id||audit.checkVersion!==r.check_version||audit.assetChecksum!==r.checksum)fail('CONTENT_TRIAL_REVIEW_REQUIRED');
 const proof=await checkMeta(env,owner,{requestId:crypto.randomUUID()},{now,transport});if(!proof.verifiedReadOnly||[proof.expiresAt,proof.dataAccessExpiresAt].some(t=>t!==null&&t-now<86400000))fail('CONTENT_TRIAL_META_NOT_VERIFIED');
 const file=(await rows(env,'SELECT * FROM cloud_library WHERE id=? AND state=\'complete\'',String(r.file_id)))[0];if(!file||file.checksum!==r.checksum)fail('CONTENT_TRIAL_IMAGE_REQUIRED');const bytes=await verifiedBytes(env,file);
 const claim=crypto.randomUUID();await env.DB!.prepare(`UPDATE cloud_content_trial SET state='intent',sent_at=?,result_json=? WHERE id=1 AND state='prepared' AND ${idle} AND ${versionGuard('cloud_content_trial.version_id',now)} AND EXISTS(SELECT 1 FROM post_versions v WHERE v.id=cloud_content_trial.version_id AND v.check_version=cloud_content_trial.check_version)`).bind(now,JSON.stringify({claim})).run();
 const claimed=await get(env);if(!claimed||claimed.state!=='intent'||JSON.parse(String(claimed.result_json)).claim!==claim)return model(claimed??r);
 if(!(await rows(env,`SELECT 1 allowed WHERE ${idle}`)).length)return model(claimed);
 const result=await sendDailyMeta(env,{pageId:TRIAL_PAGE,caption:String(r.caption),bytes,sentAt:now},transport,now);
 // Save the remote hint before finalization; replay after a lost response never POSTs.
 await env.DB!.prepare("UPDATE cloud_content_trial SET state=?,remote_id=?,photo_id=?,result_json=? WHERE id=1 AND state='intent'").bind(['policy','global','retryable'].includes(result.kind)?'rejected':'unknown',result.remoteId??null,result.photoId??null,JSON.stringify(result)).run();
 if(result.kind==='confirmed')await confirm(env,r,result,now);
 return model((await get(env))!);
}
export async function reconcileContentTrial(env:CloudBindings,input:unknown,options:Options={}){
 await gate(env);const p=input as Row|null,r=await get(env),now=options.now??Date.now();
 if(!r||!p||r.request_id!==p.requestId)fail('CONTENT_TRIAL_NOT_PREPARED');if(r.state==='published')return model(r);
 if(!['intent','unknown'].includes(String(r.state)))fail('CONTENT_TRIAL_RECONCILE_BLOCKED');
 const id=p.remoteId??r.remote_id;if(!validDailyPost(TRIAL_PAGE,id))fail('CONTENT_TRIAL_REMOTE_ID_INVALID');
 const receipt=r.result_json?JSON.parse(String(r.result_json)) as Row:{};
 if(receipt.kind==='confirmed'&&receipt.remoteId===id){await confirm(env,r,receipt as Extract<DailyResult,{kind:'confirmed'}>,now);}
 else{const result=await verifyDailyMeta(env,{pageId:TRIAL_PAGE,caption:String(r.caption),sentAt:Number(r.sent_at)},id,typeof r.photo_id==='string'?r.photo_id:undefined,options.transport??fetch,now);if(result.kind==='confirmed')await confirm(env,r,result,now);}
 return model((await get(env))!);
}
export async function monitorContentTrial(env:CloudBindings){const r=await get(env);if(r&&['intent','unknown'].includes(String(r.state))&&validDailyPost(TRIAL_PAGE,r.remote_id))await reconcileContentTrial(env,{requestId:r.request_id,remoteId:r.remote_id});}
