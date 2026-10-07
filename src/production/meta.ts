import type {ManagementBindings} from './management.ts';
import type {OwnerSession} from '../cloud/auth.ts';
import {metaCredentialsPresent,metaFingerprint,metaCheckView,inspectMetaConnection} from '../cloud/meta.ts';
type Check=Parameters<typeof metaCheckView>[0];
export function productionMetaConfigured(env:ManagementBindings){
 return env.APP_ENV==='production'&&env.INTEGRATION_MODE==='management'&&env.DAILY_PUBLISHING_ENABLED==='false'
  &&env.META_CONNECTION_PURPOSE==='production_verify'&&metaCredentialsPresent(env)
  &&env.META_PAGE_ID==='817593604765443'&&env.META_APP_ID==='1125636386458970';
}
async function schemaReady(env:ManagementBindings){return Boolean(await env.DB!.prepare("SELECT 1 FROM schema_migrations WHERE name='0011_production_meta.sql'").first());}
export async function productionMetaStatus(env:ManagementBindings,now=Date.now()){
 const configured=productionMetaConfigured(env),schema=await schemaReady(env);
 const row=schema?await env.DB!.prepare('SELECT * FROM cloud_meta_checks ORDER BY checked_at DESC,rowid DESC LIMIT 1').first<Check>():null;
 return {configured,schemaReady:schema,purpose:'production_verify',pageId:/^[1-9][0-9]{4,24}$/.test(env.META_PAGE_ID??'')?env.META_PAGE_ID:null,
  appId:/^[1-9][0-9]{4,24}$/.test(env.META_APP_ID??'')?env.META_APP_ID:null,apiVersion:/^v[1-9][0-9]\.0$/.test(env.META_API_VERSION??'')?env.META_API_VERSION:null,
  publishingEnabled:false,lastCheck:row?metaCheckView(row,configured&&row.config_hash===await metaFingerprint(env),now):null};
}
export async function verifyProductionMeta(env:ManagementBindings,owner:OwnerSession,input:unknown,options:{now?:number;transport?:typeof fetch}={}){
 if(!productionMetaConfigured(env)||!await schemaReady(env))throw Error('META_NOT_CONFIGURED');
 const request=(input as {requestId?:unknown}|null)?.requestId;
 if(typeof request!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request))throw Error('META_REQUEST_INVALID');
 const now=options.now??Date.now();if(!Number.isSafeInteger(now)||now<0)throw Error('META_REQUEST_INVALID');
 const hash=await metaFingerprint(env),prior=await env.DB!.prepare('SELECT * FROM cloud_meta_checks WHERE request_id=?').bind(request).first<Check>();
 if(prior){if(prior.config_hash!==hash)throw Error('REQUEST_REUSED');return {...metaCheckView(prior,true,now),replayed:true};}
 const state=await env.DB!.prepare("SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL").first();if(!state)throw Error('META_BUSY');
 const result=await inspectMetaConnection(env,options);
 await env.DB!.prepare(`INSERT INTO cloud_meta_checks SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM application_state WHERE environment='production' AND paused_by_user=1 AND maintenance_owner IS NULL) AND EXISTS(SELECT 1 FROM production_control WHERE enabled=0 AND page_id IS NULL AND connection_verified=0) ON CONFLICT(request_id) DO NOTHING`)
  .bind(crypto.randomUUID(),request,hash,owner.email,now,result.state,result.reason,result.pageId,result.pageName,JSON.stringify(result.scopes),result.expires,result.dataExpires).run();
 const row=await env.DB!.prepare('SELECT * FROM cloud_meta_checks WHERE request_id=?').bind(request).first<Check>();
 if(!row||row.config_hash!==hash)throw Error('REQUEST_REUSED');return {...metaCheckView(row,true,now),replayed:false};
}
