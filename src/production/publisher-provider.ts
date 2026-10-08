import type {ManagementBindings} from './management.ts';
import {metaCredentialsPresent,metaFingerprint,metaProof,inspectMetaConnection} from '../cloud/meta.ts';
import {publicationFailure} from './publisher-outcome.ts';
export const PRODUCTION_PAGE='817593604765443';
export interface PublicationRequest {attemptId:string;pageId:string;caption:string;checksum:string;bytes:Uint8Array;sentAt:number}
export type PublicationResult={kind:'confirmed';remoteId:string;confirmedAt:number;attemptId:string;pageId:string;captionHash:string;checksum:string}|{kind:'retryable'|'policy'|'global'|'unknown';remoteId?:string};
export const publicationHash=async(value:string|Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value))),b=>b.toString(16).padStart(2,'0')).join('');
const validId=(id:unknown):id is string=>typeof id==='string'&&new RegExp('^'+PRODUCTION_PAGE+'_[1-9][0-9]{4,24}$').test(id);
async function data(response:Response){
 const reader=response.body?.getReader(),parts:Uint8Array[]=[];let size=0;
 if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>32768){await reader.cancel();throw Error('PROVIDER_RESPONSE_INVALID');}parts.push(p.value);}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 const body:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw Error('PROVIDER_RESPONSE_INVALID');return body as Record<string,unknown>;
}
// The timer bounds response-body reads too, including transports that ignore abort.
async function bounded<T>(fn:(signal:AbortSignal)=>Promise<T>,ms:number):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('PROVIDER_TIMEOUT'));},ms);})]);}
 finally{if(timer)clearTimeout(timer);controller.abort();}
}
// Caller must supply the network capability. There is no implicit global fetch.
export class ProductionMetaPublisher {
 private readonly env:ManagementBindings;
 private readonly transport:typeof fetch;
 constructor(env:ManagementBindings,transport:typeof fetch){
  if(typeof transport!=='function')throw Error('EXPLICIT_META_TRANSPORT_REQUIRED');
  this.transport=transport.bind(globalThis);
  this.env={...env};
 }
 private configured(){return this.env.APP_ENV==='production'&&this.env.META_PAGE_ID===PRODUCTION_PAGE&&this.env.META_APP_ID==='1125636386458970'&&this.env.META_CONNECTION_PURPOSE==='production_verify'&&metaCredentialsPresent(this.env);}
 async fingerprint(){return metaFingerprint(this.env);}
 async verify(now:number){
  if(!this.configured())return {verified:false,fingerprint:await this.fingerprint()};
  try{const proof=await bounded(signal=>inspectMetaConnection(this.env,{now,transport:(input,init)=>this.transport(input,{...init,signal})}),8000);return {verified:proof.state==='verified_read_only',reason:proof.reason,fingerprint:await this.fingerprint(),expiresAt:proof.expires,dataAccessExpiresAt:proof.dataExpires};}
  catch{return {verified:false,fingerprint:await this.fingerprint()};}
 }
 private endpoint(id:string){return 'https://graph.facebook.com/'+this.env.META_API_VERSION+'/'+id;}
 private async evidence(request:Omit<PublicationRequest,'bytes'>,remoteId:string,signal:AbortSignal,clock:()=>number):Promise<PublicationResult>{
  if(!validId(remoteId))return {kind:'unknown'};
  const url=new URL(this.endpoint(remoteId));url.searchParams.set('fields','id,message,created_time');url.searchParams.set('appsecret_proof',await metaProof(this.env));
  const response=await this.transport(url.href,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+this.env.META_PAGE_ACCESS_TOKEN},signal});
  if(response.status!==200)return {kind:'unknown',remoteId};
  const body=await data(response),time=typeof body.created_time==='string'?Date.parse(body.created_time):NaN;
  // Meta timestamps have second precision. Exact caption and Page are mandatory.
  if(body.id!==remoteId||body.message!==request.caption||!Number.isSafeInteger(time)||time<Math.floor(request.sentAt/1000)*1000||time>clock()+1000)return {kind:'unknown',remoteId};
  return {kind:'confirmed',remoteId,confirmedAt:time,attemptId:request.attemptId,pageId:PRODUCTION_PAGE,captionHash:await publicationHash(request.caption),checksum:request.checksum};
 }
 async send(request:PublicationRequest,clock:()=>number=Date.now):Promise<PublicationResult>{
  if(!this.configured()||request.pageId!==PRODUCTION_PAGE||!request.attemptId||!request.caption||!Number.isSafeInteger(request.sentAt)||request.bytes.length>5242880||request.bytes.length===0||await publicationHash(request.bytes)!==request.checksum)return {kind:'global'};
  try{return await bounded(async signal=>{
   const form=new FormData();form.set('source',new Blob([new Uint8Array(request.bytes)],{type:'image/png'}),'approved.png');form.set('caption',request.caption);form.set('published','true');form.set('appsecret_proof',await metaProof(this.env));
   const response=await this.transport(this.endpoint(PRODUCTION_PAGE)+'/photos',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+this.env.META_PAGE_ACCESS_TOKEN},body:form,signal}),body=await data(response);
   if(response.status===200&&validId(body.post_id)&&typeof body.id==='string'&&/^[1-9][0-9]{4,24}$/.test(body.id))return this.evidence(request,body.post_id,signal,clock);
   const error=body.error as {code?:unknown}|undefined;return {kind:publicationFailure(response.status,typeof error?.code==='number'?error.code:undefined).kind,...(validId(body.post_id)?{remoteId:body.post_id}:{})};
  },10000);}catch{return {kind:'unknown'};}
 }
 // F3: one POST only. A returned remote ID is a hint, never confirmation.
 // Correlated GET and durable finalization happen on separate invocations.
 async dispatch(request:PublicationRequest):Promise<PublicationResult>{
  if(!this.configured()||request.pageId!==PRODUCTION_PAGE||!request.attemptId||!request.caption||!Number.isSafeInteger(request.sentAt)||request.bytes.length>5242880||request.bytes.length===0||await publicationHash(request.bytes)!==request.checksum)return {kind:'global'};
  try{return await bounded(async signal=>{
   const form=new FormData();form.set('source',new Blob([new Uint8Array(request.bytes)],{type:'image/png'}),'approved.png');form.set('caption',request.caption);form.set('published','true');form.set('appsecret_proof',await metaProof(this.env));
   const response=await this.transport(this.endpoint(PRODUCTION_PAGE)+'/photos',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+this.env.META_PAGE_ACCESS_TOKEN},body:form,signal}),body=await data(response);
   if(response.status===200)return {kind:'unknown',...(validId(body.post_id)?{remoteId:body.post_id}:{})};
   const error=body.error as {code?:unknown}|undefined;return {kind:publicationFailure(response.status,typeof error?.code==='number'?error.code:undefined).kind};
  },10000);}catch{return {kind:'unknown'};}
 }
 async reconcile(request:Omit<PublicationRequest,'bytes'>,remoteId:string,clock:()=>number=Date.now):Promise<PublicationResult>{
  if(!this.configured()||request.pageId!==PRODUCTION_PAGE)return {kind:'unknown'};
  try{return await bounded(signal=>this.evidence(request,remoteId,signal,clock),8000);}catch{return {kind:'unknown',...(validId(remoteId)?{remoteId}:{})};}
 }
}


