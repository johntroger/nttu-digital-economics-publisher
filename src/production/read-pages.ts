import type {ManagementBindings} from './management.ts';
import {POLICY} from '../domain/policy.ts';
const encoder=new TextEncoder();
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
export const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
// Immutable bodies, completed bytes and review receipts are identified by immutable IDs.
// Mutable eligibility, active-version links and source/fact state are included explicitly.
export async function readSnapshot(e:ManagementBindings,now=Date.now()){
 const specs=[
 ['posts','rowid,content_key,topic_group,pool'],
 ['content_entries',"rowid,(SELECT rowid FROM post_versions WHERE id=content_entries.active_version_id),stage,stable_order"],
 ['post_versions','rowid,check_version,status,review_due_at'],
 ['sources','rowid,status,reviewed_at,review_due_at'],
 ['facts','rowid,status,review_due_at'],
 ['post_prerequisites','post_id,prerequisite_id'],
 ['assets','rowid,status'],
 ['asset_bindings',"rowid,(SELECT rowid FROM post_versions WHERE id=asset_bindings.version_id),(SELECT rowid FROM assets WHERE id=asset_bindings.asset_id),checksum,check_version"],
 ['cloud_library','rowid,state'],
 ['cloud_reviews','rowid,version_id,check_version'],
 ['application_state','environment,operation_generation,paused_by_user,maintenance_owner,blocked_reasons'],
 ] as const;
 // Source/fact revisions and complete library/asset metadata cannot be edited.
 // Ref INSERT/UPDATE/DELETE and asset edits bump post_versions.check_version.
 // Keep mutable bindings explicitly; omit duplicated immutable bytes and long ref text.
 // Referenced primary IDs cannot change under FKs, complete library/review IDs are
 // immutable. Numeric row identities avoid repeatedly copying long private IDs.
 // Rebuild/VACUUM may invalidate a cursor; it never grants permission to continue.
 const expiryTables=['post_versions','sources','facts'];
 const parts=specs.map(([table,fields])=>`(SELECT json_group_array(json(row)) FROM (SELECT json_array(${fields}${expiryTables.includes(table)?",CASE WHEN review_due_at IS NULL THEN 0 WHEN julianday(review_due_at)*86400000-210866760000000<=? THEN 1 ELSE 0 END":''}) row FROM ${table} ORDER BY ${fields}))`);
 const row=await e.DB!.prepare('SELECT json_array('+parts.join(',')+') snapshot').bind(now,now,now).first<{snapshot:string}>();
 if(!row)throw Error('READ_SNAPSHOT_UNAVAILABLE');return row.snapshot;
}
type Cursor={kind:string;owner:string;release:string;snapshot:string;offset:number;checkedAt:number;expiresAt:number;startDate?:string;manifestHash?:string;phase?:'item'|'finalize';eligibilityDeadline?:number};
async function key(e:ManagementBindings){if(!e.SESSION_SIGNING_KEY)throw Error('READ_CURSOR_UNAVAILABLE');return crypto.subtle.importKey('raw',encoder.encode(e.SESSION_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signCursor(e:ManagementBindings,c:Cursor){const body=btoa(JSON.stringify(c));return body+'.'+hex(await crypto.subtle.sign('HMAC',await key(e),encoder.encode('nttu-read-page-v1:'+body)));}
export async function readCursor(e:ManagementBindings,token:string|undefined,kind:string,now:number):Promise<Cursor|null>{
 if(token===undefined)return null;
 if(token.length>1800||! /^[A-Za-z0-9+/=]+\.[a-f0-9]{64}$/.test(token))throw Error('READ_CURSOR_INVALID');
 const [body,signature]=token.split('.'),bytes=Uint8Array.from(signature!.match(/../g)!,x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',await key(e),bytes,encoder.encode('nttu-read-page-v1:'+body)))throw Error('READ_CURSOR_INVALID');
 let c:Cursor;try{c=JSON.parse(atob(body!));}catch{throw Error('READ_CURSOR_INVALID');}
 if(c.kind!==kind||c.owner!==POLICY.ownerEmail||c.release!==e.RELEASE_SHA||!Number.isSafeInteger(c.offset)||c.offset<0||!Number.isSafeInteger(c.checkedAt)||c.checkedAt>now||c.expiresAt!==c.checkedAt+300000||now>=c.expiresAt)throw Error('READ_CURSOR_EXPIRED');
 if(c.eligibilityDeadline!==undefined&&now>=c.eligibilityDeadline)throw Error('READ_SNAPSHOT_CHANGED');return c;
}
export function initialCursor(e:ManagementBindings,kind:string,snapshot:string,now:number,startDate?:string):Cursor{return {kind,owner:POLICY.ownerEmail,release:e.RELEASE_SHA!,snapshot,offset:0,checkedAt:now,expiresAt:now+300000,...(startDate?{startDate}:{})};}
