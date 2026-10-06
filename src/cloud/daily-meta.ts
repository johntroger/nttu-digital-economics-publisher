import type {CloudBindings} from './runtime.ts';
import {metaProof} from './meta.ts';
export type DailyResult={kind:'confirmed';remoteId:string;photoId:string;publishedAt:number}|{kind:'retryable'|'policy'|'global'|'unknown';remoteId?:string;photoId?:string};
export interface DailySnapshot {pageId:string;caption:string;bytes:Uint8Array;sentAt:number}
const numeric=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{4,24}$/.test(v);
export function validDailyPost(page:string,id:unknown):id is string{return typeof id==='string'&&numeric(page)&&new RegExp('^'+page+'_[1-9][0-9]{4,24}$').test(id);}
async function data(response:Response){const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>32768){await reader.cancel();throw Error('invalid response');}parts.push(p.value);}const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid response');return value as Record<string,unknown>;}
function endpoint(env:CloudBindings,id:string){if(!/^v[1-9][0-9]\.0$/.test(env.META_API_VERSION??''))throw Error('Meta version invalid');return 'https://graph.facebook.com/'+env.META_API_VERSION+'/'+id;}
export async function verifyDailyMeta(env:CloudBindings,s:Pick<DailySnapshot,'pageId'|'caption'|'sentAt'>,remoteId:string,photoId:string|undefined,transport:typeof fetch=fetch,now=Date.now()):Promise<DailyResult>{
 if(!validDailyPost(s.pageId,remoteId))return {kind:'unknown'};
 try{const url=new URL(endpoint(env,remoteId));url.searchParams.set('fields','id,message,created_time');url.searchParams.set('appsecret_proof',await metaProof(env));
 const response=await transport(url.href,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},signal:AbortSignal.timeout(10000)});
 if(response.status!==200)return {kind:'unknown',remoteId,...(photoId?{photoId}:{})};const body=await data(response),time=typeof body.created_time==='string'?Date.parse(body.created_time):NaN;
 if(body.id!==remoteId||body.message!==s.caption||!Number.isFinite(time)||time<s.sentAt-60000||time>now+60000)return {kind:'unknown',remoteId,...(photoId?{photoId}:{})};
 return {kind:'confirmed',remoteId,photoId:photoId??'',publishedAt:time};
 }catch{return {kind:'unknown',remoteId,...(photoId?{photoId}:{})};}
}
export async function sendDailyMeta(env:CloudBindings,s:DailySnapshot,transport:typeof fetch=fetch,now=Date.now()):Promise<DailyResult>{
 if(env.META_PAGE_ID!==s.pageId||!numeric(s.pageId)||env.META_CONNECTION_PURPOSE!=='test')return {kind:'global'};
 try{const form=new FormData();form.set('source',new Blob([new Uint8Array(s.bytes)],{type:'image/png'}),'daily.png');form.set('caption',s.caption);form.set('published','true');form.set('appsecret_proof',await metaProof(env));
 const response=await transport(endpoint(env,s.pageId)+'/photos',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+env.META_PAGE_ACCESS_TOKEN},body:form,signal:AbortSignal.timeout(15000)}),body=await data(response);
 if(response.status===200&&numeric(body.id)&&validDailyPost(s.pageId,body.post_id))return verifyDailyMeta(env,s,body.post_id,body.id,transport,now);
 // Retry only a structured, explicit Graph rejection; timeouts, 5xx and malformed responses are ambiguous.
 const error=body.error as Record<string,unknown>|undefined;
 if([400,401,403,429].includes(response.status)&&error&&typeof error==='object'){
  const code=Number(error.code);if([190,10,200].includes(code))return {kind:'global'};
  if([4,17,32,613].includes(code))return {kind:'retryable'};
  if(Number.isSafeInteger(code)&&code>0)return {kind:'policy'};
 }
 return {kind:'unknown',...(validDailyPost(s.pageId,body.post_id)?{remoteId:body.post_id}:{}),...(numeric(body.id)?{photoId:body.id}:{})};
 }catch{return {kind:'unknown'};}
}
