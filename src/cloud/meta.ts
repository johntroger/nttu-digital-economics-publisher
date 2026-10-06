import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {readStatus} from './runtime.ts';
import {CatalogError} from './catalog.ts';

const REQUIRED=['pages_read_engagement','pages_manage_posts'];
const MAX_AGE=600000;
interface Check {id:string;request_id:string;config_hash:string;checked_at:number;state:string;reason:string;page_id:string|null;page_name:string|null;scopes_json:string;expires_at:number|null;data_access_expires_at:number|null}
type ObjectValue=Record<string,unknown>;
function object(value:unknown):value is ObjectValue{return !!value&&typeof value==='object'&&!Array.isArray(value);}
const id=(value:unknown):value is string=>typeof value==='string'&&/^[1-9][0-9]{4,24}$/.test(value);
const secret=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9_-]{20,4096}$/.test(value);
export function metaConfigured(env:CloudBindings){return id(env.META_APP_ID)&&id(env.META_PAGE_ID)&&secret(env.META_APP_SECRET)&&secret(env.META_PAGE_ACCESS_TOKEN)&&/^v[1-9][0-9]\.0$/.test(env.META_API_VERSION??'')&&env.META_CONNECTION_PURPOSE==='test';}
async function fingerprint(env:CloudBindings){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([env.META_APP_ID,env.META_APP_SECRET,env.META_PAGE_ID,env.META_PAGE_ACCESS_TOKEN,env.META_API_VERSION,env.META_CONNECTION_PURPOSE])));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
async function appProof(env:CloudBindings){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.META_APP_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(env.META_PAGE_ACCESS_TOKEN!));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
async function checks(env:CloudBindings,sql:string,...values:(string|number|null)[]){if(!env.DB!.prepare(sql).all)throw new CatalogError('CLOUD_DATABASE_UNAVAILABLE',503);return(await env.DB!.prepare(sql).bind(...values).all!<Check>()).results;}
function view(row:Check,current:boolean,now:number){const fresh=row.checked_at<=now&&now-row.checked_at<MAX_AGE;
  return {id:row.id,checkedAt:row.checked_at,state:row.state,reason:row.reason,current,fresh,
    pageId:row.page_id,pageName:row.page_name,scopes:JSON.parse(row.scopes_json) as string[],expiresAt:row.expires_at,dataAccessExpiresAt:row.data_access_expires_at,
    verifiedReadOnly:row.state==='verified_read_only'&&current&&fresh&&[row.expires_at,row.data_access_expires_at].every(n=>n===null||n>now),publishingEnabled:false};
}
export async function metaStatus(env:CloudBindings,now=Date.now()){
  await readStatus(env);const configured=metaConfigured(env),hash=await fingerprint(env);
  const row=(await checks(env,'SELECT * FROM cloud_meta_checks ORDER BY checked_at DESC,rowid DESC LIMIT 1'))[0];
  return {configured,purpose:'test',pageId:id(env.META_PAGE_ID)?env.META_PAGE_ID:null,appId:id(env.META_APP_ID)?env.META_APP_ID:null,apiVersion:/^v[1-9][0-9]\.0$/.test(env.META_API_VERSION??'')?env.META_API_VERSION:null,
    requiredScopes:REQUIRED,publishingEnabled:false,lastCheck:row?view(row,configured&&row.config_hash===hash,now):null};
}
export const metaProof=(env:CloudBindings)=>appProof(env);
export const metaFingerprint=(env:CloudBindings)=>fingerprint(env);
export async function monitorMetaExpiry(env:CloudBindings,now=Date.now()){
  if(!metaConfigured(env))return;
  const status=await metaStatus(env,now),check=status.lastCheck;
  if(!check?.current||check.state!=='verified_read_only')return;
  const expiry=[check.expiresAt,check.dataAccessExpiresAt].filter((n):n is number=>n!==null).sort((a,b)=>a-b)[0];
  if(expiry===undefined||expiry-now>3*86400000)return;
  const eventId='meta-expiry:'+env.META_PAGE_ID+':'+expiry;
  await env.DB!.prepare('INSERT INTO notification_outbox(event_id,payload_json) VALUES(?,?) ON CONFLICT(event_id) DO NOTHING')
    .bind(eventId,JSON.stringify({kind:'connection_error',environment:'staging',page:check.pageName??'Fanpage thử',title:'Token hoặc quyền dữ liệu cần cấp lại trước '+new Date(expiry).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})})).run();
}
class MetaFailure extends Error {readonly code:string;constructor(code:string){super(code);this.code=code;}}
async function graph(url:URL,bearer:string,transport:typeof fetch):Promise<ObjectValue>{
  // Every request is GET to a server-built, versioned Graph endpoint. No paging/redirect follow.
  if(url.origin!=='https://graph.facebook.com'||!/^\/v\d{2}\.0\/(debug_token|me)$/.test(url.pathname))throw new MetaFailure('META_ENDPOINT_INVALID');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await transport(url.href,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+bearer,Accept:'application/json'},signal:controller.signal});
    if(response.status>=300&&response.status<400)throw new MetaFailure('META_REDIRECT_BLOCKED');
    if(response.status===429)throw new MetaFailure('META_RATE_LIMIT');
    if(response.status>=500)throw new MetaFailure('META_PROVIDER_UNAVAILABLE');
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768){await reader.cancel();throw new MetaFailure('META_RESPONSE_INVALID');}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new MetaFailure('META_RESPONSE_INVALID');}
    if(!object(body))throw new MetaFailure('META_RESPONSE_INVALID');
    if(object(body.error)){
      const code=body.error.code;
      throw new MetaFailure(code===190?'META_TOKEN_INVALID':[10,200].includes(Number(code))?'META_PERMISSION_DENIED':[4,17,32,613].includes(Number(code))?'META_RATE_LIMIT':'META_API_REJECTED');
    }
    if(response.status!==200)throw new MetaFailure('META_API_REJECTED');return body;
  }catch(error){if(error instanceof MetaFailure)throw error;throw new MetaFailure('META_CONNECTION_FAILED');}finally{clearTimeout(timer);}
}
function expiry(value:unknown,now:number){if(!Number.isSafeInteger(value)||Number(value)<0)throw new MetaFailure('META_RESPONSE_INVALID');if(value===0)return null;const ms=Number(value)*1000;if(!Number.isSafeInteger(ms)||ms>8640000000000000)throw new MetaFailure('META_RESPONSE_INVALID');if(ms<=now)throw new MetaFailure('META_TOKEN_EXPIRED');return ms;}
export async function checkMeta(env:CloudBindings,owner:OwnerSession,input:unknown,options:{now?:number;transport?:typeof fetch}={}){
  await readStatus(env);if(!metaConfigured(env))throw new CatalogError('META_NOT_CONFIGURED',422);
  const request=(input as {requestId?:unknown}|null)?.requestId;if(typeof request!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request))throw new CatalogError('META_REQUEST_INVALID',422);
  const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)throw new CatalogError('META_REQUEST_INVALID',422);
  const hash=await fingerprint(env),prior=(await checks(env,'SELECT * FROM cloud_meta_checks WHERE request_id=?',request))[0];
  if(prior){if(prior.config_hash!==hash)throw new CatalogError('REQUEST_REUSED',409);return {...view(prior,true,now),replayed:true};}
  const busy=await env.DB!.prepare("SELECT 1 FROM application_state WHERE environment='staging' AND maintenance_owner IS NOT NULL").first();if(busy)throw new CatalogError('META_BUSY',409);
  let state='verified_read_only',reason='META_READ_ONLY_VERIFIED',pageId:string|null=null,pageName:string|null=null,scopes:string[]=[],expires:number|null=null,dataExpires:number|null=null;
  try{
    const root='https://graph.facebook.com/'+env.META_API_VERSION+'/',debug=new URL(root+'debug_token');debug.searchParams.set('input_token',env.META_PAGE_ACCESS_TOKEN!);
    const tokenInfo=await graph(debug,env.META_APP_ID+'|'+env.META_APP_SECRET,options.transport??fetch),data=tokenInfo.data;
    if(!object(data)||data.is_valid!==true)throw new MetaFailure('META_TOKEN_INVALID');
    if(data.app_id!==env.META_APP_ID)throw new MetaFailure('META_APP_MISMATCH');
    if(data.type!=='PAGE')throw new MetaFailure('META_PAGE_TOKEN_REQUIRED');
    expires=expiry(data.expires_at,now);dataExpires=expiry(data.data_access_expires_at,now);
    if(!Array.isArray(data.scopes)||data.scopes.some(s=>typeof s!=='string'))throw new MetaFailure('META_RESPONSE_INVALID');
    const available=data.scopes as string[];scopes=REQUIRED.filter(s=>available.includes(s));if(scopes.length!==REQUIRED.length)throw new MetaFailure('META_SCOPES_MISSING');
    if(data.granular_scopes!==undefined){
      if(!Array.isArray(data.granular_scopes))throw new MetaFailure('META_RESPONSE_INVALID');
      for(const scope of data.granular_scopes){if(!object(scope))throw new MetaFailure('META_RESPONSE_INVALID');if(REQUIRED.includes(String(scope.scope))&&scope.target_ids!==undefined&&(!Array.isArray(scope.target_ids)||!scope.target_ids.includes(env.META_PAGE_ID)))throw new MetaFailure('META_PAGE_SCOPE_MISMATCH');}
    }
    const identity=new URL(root+'me');identity.searchParams.set('fields','id,name');identity.searchParams.set('appsecret_proof',await appProof(env));
    const page=await graph(identity,env.META_PAGE_ACCESS_TOKEN!,options.transport??fetch);
    if(page.id!==env.META_PAGE_ID)throw new MetaFailure('META_PAGE_MISMATCH');
    if(typeof page.name!=='string'||!page.name.trim()||page.name.length>200||/[\x00-\x1f]/.test(page.name)||page.name.includes(env.META_PAGE_ACCESS_TOKEN!)||page.name.includes(env.META_APP_SECRET!))throw new MetaFailure('META_RESPONSE_INVALID');
    pageId=env.META_PAGE_ID!;pageName=page.name;
  }catch(error){reason=error instanceof MetaFailure?error.code:'META_CONNECTION_FAILED';state=['META_CONNECTION_FAILED','META_RATE_LIMIT','META_PROVIDER_UNAVAILABLE','META_RESPONSE_INVALID','META_REDIRECT_BLOCKED'].includes(reason)?'unavailable':'needs_action';}
  // Only safe categories and permitted metadata are persisted; never provider errors or URLs.
  const checkId=crypto.randomUUID();await env.DB!.prepare(`INSERT INTO cloud_meta_checks VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING`).bind(checkId,request,hash,owner.email,now,state,reason,pageId,pageName,JSON.stringify(scopes),expires,dataExpires).run();
  const row=(await checks(env,'SELECT * FROM cloud_meta_checks WHERE request_id=?',request))[0];if(!row||row.config_hash!==hash)throw new CatalogError('REQUEST_REUSED',409);return {...view(row,true,now),replayed:false};
}
