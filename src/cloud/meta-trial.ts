import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';
import {composeCaption} from '../domain/footer.ts';
import {verifiedBytes,checksum} from './storage.ts';
import {checkMeta,metaStatus,metaProof} from './meta.ts';

export const TRIAL_PAGE='551227411605506';
export const TRIAL_BODY='BÀI KIỂM THỬ HỆ THỐNG ĐĂNG BÀI\n\nĐây là bài kiểm thử kỹ thuật trên fanpage Tập Viết, nhằm kiểm tra hiển thị caption, ảnh minh họa và ba logo của Trường, Khoa, Ngành.\n\nLịch đăng tự động hằng ngày hiện vẫn tạm dừng.';
type Row=Record<string,unknown>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const rows=async(env:CloudBindings,sql:string,...v:(string|number|null)[])=>(await env.DB!.prepare(sql).bind(...v).all!<Row>()).results;
function fail(code:string,status=409):never{throw new CatalogError(code,status);}
const trialConfig=(env:CloudBindings)=>checksum(new TextEncoder().encode(JSON.stringify([env.META_APP_ID,env.META_PAGE_ID,env.META_API_VERSION])));
async function gate(env:CloudBindings){const state=await readStatus(env);if(state.paused_by_user!==1)fail('TRIAL_BUSY');if(env.META_PAGE_ID!==TRIAL_PAGE||env.META_CONNECTION_PURPOSE!=='test')fail('TRIAL_PAGE_BLOCKED');if(await env.DB!.prepare("SELECT 1 FROM application_state WHERE environment='staging' AND maintenance_owner IS NOT NULL").first())fail('TRIAL_BUSY');}
function model(r:Row){return {requestId:r.request_id,state:r.state,pageId:r.page_id,caption:r.caption,imageUrl:'/api/library/files/'+r.file_id,imageChecksum:r.image_checksum,preparedAt:r.prepared_at,sentAt:r.sent_at,confirmedAt:r.confirmed_at,reason:r.reason,remoteId:r.remote_id,url:r.state==='published'?'https://www.facebook.com/'+r.remote_id:null};}
export async function trialStatus(env:CloudBindings){await readStatus(env);const r=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0];return {pageId:TRIAL_PAGE,caption:composeCaption(TRIAL_BODY),dailySchedulePaused:true,trial:r?model(r):null};}
async function image(env:CloudBindings,id:string){const r=(await rows(env,"SELECT * FROM cloud_library WHERE id=? AND kind='image' AND state='complete' AND width=1080 AND height=1080",id))[0];if(!r)fail('TRIAL_IMAGE_REQUIRED');return {row:r,bytes:await verifiedBytes(env,r)};}
export async function prepareTrial(env:CloudBindings,owner:OwnerSession,input:unknown,now=Date.now()){
 await gate(env);const p=input as Row|null;if(!p||!uuid(p.requestId)||!uuid(p.libraryId))fail('TRIAL_INPUT_INVALID',422);
 const old=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0];
 if(old){if(old.request_id!==p.requestId||old.file_id!==p.libraryId)fail('TRIAL_ALREADY_PREPARED');return model(old);}
 const file=await image(env,p.libraryId),hash=await trialConfig(env);
 await env.DB!.prepare(`INSERT INTO cloud_meta_trial(id,request_id,config_hash,page_id,caption,file_id,image_checksum,prepared_at,actor,state)
 SELECT 1,?,?,?,?,?,?,?,?,'prepared' WHERE EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)
 ON CONFLICT(id) DO NOTHING`).bind(p.requestId,hash,TRIAL_PAGE,composeCaption(TRIAL_BODY+'\n\nMã kiểm thử: '+p.requestId),p.libraryId,String(file.row.checksum),now,owner.email).run();
 const r=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0];if(!r||r.request_id!==p.requestId)fail('TRIAL_ALREADY_PREPARED');return model(r);
}
async function responseJSON(response:Response){const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
 if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>32768){await reader.cancel();throw Error('limit');}parts.push(p.value);}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const body:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error('shape');return body as Row;
}
function postId(v:unknown):v is string{return typeof v==='string'&&new RegExp('^'+TRIAL_PAGE+'_[1-9][0-9]{4,24}$').test(v);}
async function verifyRemote(env:CloudBindings,r:Row,id:string,transport:typeof fetch,now:number){
 const url=new URL('https://graph.facebook.com/'+env.META_API_VERSION+'/'+id);url.searchParams.set('fields','id,message,created_time');url.searchParams.set('appsecret_proof',await metaProof(env));
 const res=await transport(url.href,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},signal:AbortSignal.timeout(10000)});if(res.status!==200)return false;
 const body=await responseJSON(res),created=typeof body.created_time==='string'?Date.parse(body.created_time):NaN;
 if(body.id!==id||body.message!==r.caption||!Number.isFinite(created)||created<Number(r.sent_at)-60000||created>now+60000)return false;
 if(!env.DB!.batch)fail('CLOUD_DATABASE_UNAVAILABLE',503);
 await env.DB!.batch!([env.DB!.prepare("UPDATE cloud_meta_trial SET state='published',remote_id=?,confirmed_at=?,reason=NULL WHERE id=1 AND state IN ('intent','unknown')").bind(id,now),
 env.DB!.prepare("INSERT INTO notification_outbox(event_id,payload_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM cloud_meta_trial WHERE id=1 AND state='published' AND remote_id=?) ON CONFLICT(event_id) DO NOTHING").bind('meta-trial:'+r.request_id,JSON.stringify({kind:'published',environment:'staging',title:'Bài kiểm thử hệ thống đăng bài',page:'Tập Viết',url:'https://www.facebook.com/'+id,time:new Date(now).toISOString()}),id)]);
 return true;
}
export async function sendTrial(env:CloudBindings,owner:OwnerSession,input:unknown,options:{now?:number;transport?:typeof fetch}={}){
 await gate(env);const now=options.now??Date.now(),transport=options.transport??fetch,p=input as Row|null;
 if(!p||!uuid(p.requestId)||p.confirmPageId!==TRIAL_PAGE||p.approveCaption!==true||p.approveImage!==true)fail('TRIAL_APPROVAL_REQUIRED',422);
 const r=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0];if(!r||r.request_id!==p.requestId)fail('TRIAL_NOT_PREPARED');if(r.state!=='prepared')return model(r);
 if(r.config_hash!==await trialConfig(env))fail('TRIAL_CONFIG_CHANGED');
 // Revalidate credentials immediately before committing a send intent.
 const check=await checkMeta(env,owner,{requestId:crypto.randomUUID()},{now,transport});if(!check.verifiedReadOnly)fail('TRIAL_META_NOT_VERIFIED');
 if([check.expiresAt,check.dataAccessExpiresAt].some(e=>e!==null&&e-now<86400000))fail('TRIAL_TOKEN_TOO_SHORT');
 const file=await image(env,String(r.file_id));if(file.row.checksum!==r.image_checksum)fail('TRIAL_IMAGE_CHANGED');
 const claim=crypto.randomUUID();
 await env.DB!.prepare("UPDATE cloud_meta_trial SET state='intent',sent_at=?,reason=? WHERE id=1 AND state='prepared' AND EXISTS(SELECT 1 FROM application_state WHERE environment='staging' AND paused_by_user=1 AND maintenance_owner IS NULL)").bind(now,claim).run();
 const claimed=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0]!;if(claimed.reason!==claim)return model(claimed);
 // Every ambiguous result retains the durable intent and can never call POST again.
 let state='unknown',reason='TRIAL_RESULT_UNKNOWN',remote:string|null=null,photo:string|null=null;
 try{
  const form=new FormData();form.set('source',new Blob([new Uint8Array(file.bytes)],{type:'image/png'}),'trial.png');form.set('caption',String(r.caption));form.set('published','true');form.set('appsecret_proof',await metaProof(env));
  const res=await transport('https://graph.facebook.com/'+env.META_API_VERSION+'/'+TRIAL_PAGE+'/photos',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},body:form,signal:AbortSignal.timeout(15000)}),body=await responseJSON(res);
  if(res.status===200&&typeof body.id==='string'&&/^[1-9][0-9]{4,24}$/.test(body.id)&&postId(body.post_id)){remote=body.post_id;photo=body.id;}
  else if([400,401,403].includes(res.status)&&body.error&&typeof body.error==='object'){state='rejected';reason='TRIAL_META_REJECTED';}
 }catch{/* Do not persist token, request URL, provider text or network exception. */}
 await env.DB!.prepare("UPDATE cloud_meta_trial SET state=?,remote_id=?,photo_id=?,reason=? WHERE id=1 AND state='intent'").bind(state,remote,photo,reason).run();
 if(remote){try{await verifyRemote(env,claimed,remote,transport,now);}catch{/* Keep unknown, including failure saving a confirmed remote receipt. */}}
 return model((await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0]!);
}
export async function reconcileTrial(env:CloudBindings,input:unknown,options:{now?:number;transport?:typeof fetch}={}){
 await gate(env);const p=input as Row|null,r=(await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0];if(!r||!p||!uuid(p.requestId)||r.request_id!==p.requestId)fail('TRIAL_NOT_PREPARED');
 if(r.state==='published')return model(r);if(!['intent','unknown'].includes(String(r.state)))fail('TRIAL_RECONCILE_BLOCKED');
 const id=p.remoteId??r.remote_id;if(!postId(id))fail('TRIAL_REMOTE_ID_INVALID',422);
 const status=await metaStatus(env,options.now);if(!status.configured||env.META_PAGE_ID!==r.page_id)fail('TRIAL_CONFIG_CHANGED');
 try{await verifyRemote(env,r,id,options.transport??fetch,options.now??Date.now());}catch{/* Read-only reconciliation never resends. */}
 return model((await rows(env,'SELECT * FROM cloud_meta_trial WHERE id=1'))[0]!);
}
