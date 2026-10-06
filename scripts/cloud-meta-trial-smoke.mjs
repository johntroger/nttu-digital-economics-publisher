// Native workerd binary upload/readback. All Graph responses are fixture-local.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {SignJWT} from 'jose';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {POLICY} from '../src/domain/policy.ts';
import {png} from '../tests/helpers/files.mjs';

export async function runNativeTrial(scriptPath){
 const origin='https://nttu-publisher-staging.example.workers.dev',page='551227411605506',app='1125636386458970',signing='d'.repeat(64),token='fixture_token_'+'t'.repeat(80),secret='fixture_secret_'+'s'.repeat(32),bytes=png(),fileId=crypto.randomUUID();let posts=0,caption;
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'meta-trial-fixture',modules:true,scriptPath,compatibilityDate:'2026-10-05',d1Databases:['DB'],r2Buckets:['MEDIA'],bindings:{APP_ENV:'staging',INTEGRATION_MODE:'unconfigured',AUTH_ORIGIN:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-only-secret',SESSION_SIGNING_KEY:signing,META_APP_ID:app,META_APP_SECRET:secret,META_PAGE_ID:page,META_PAGE_ACCESS_TOKEN:token,META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'test'},outboundService:async request=>{
  const u=new URL(request.url);assert.equal(u.origin,'https://graph.facebook.com');
  if(u.pathname.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:app,scopes:['pages_read_engagement','pages_manage_posts'],expires_at:0,data_access_expires_at:0}});
  assert.equal(request.headers.get('Authorization'),'Bearer '+token);
  if(u.pathname.endsWith('/me'))return Response.json({id:page,name:'Native trial fixture'});
  if(request.method==='POST'){assert.equal(u.pathname,'/v26.0/'+page+'/photos');posts++;const form=await request.formData();assert.equal(form.get('published'),'true');assert.match(form.get('appsecret_proof'),/^[a-f0-9]{64}$/);assert.deepEqual(new Uint8Array(await form.get('source').arrayBuffer()),bytes);caption=form.get('caption');return Response.json({id:'1234567890',post_id:page+'_1234567890'});}
  assert.equal(request.method,'GET');return Response.json({id:page+'_1234567890',message:caption,created_time:new Date().toISOString()});
 }}]}));
 try{
  console.log('Native trial fixture: starting D1/R2.');const db=await mf.getD1Database('DB');
  for(const sql of ["CREATE TABLE cloud_runtime(id INTEGER,environment TEXT,last_scheduled_at INTEGER,heartbeat_count INTEGER)","INSERT INTO cloud_runtime VALUES(1,'staging',NULL,0)","CREATE TABLE application_state(environment TEXT,paused_by_user INTEGER,maintenance_owner TEXT)","INSERT INTO application_state VALUES('staging',1,NULL)","CREATE TABLE schema_migrations(name TEXT)","INSERT INTO schema_migrations VALUES('1'),('2'),('3'),('4'),('5'),('6')","CREATE TABLE cloud_meta_checks(id TEXT,request_id TEXT UNIQUE,config_hash TEXT,actor TEXT,checked_at INTEGER,state TEXT,reason TEXT,page_id TEXT,page_name TEXT,scopes_json TEXT,expires_at INTEGER,data_access_expires_at INTEGER)","CREATE TABLE cloud_library(id TEXT,kind TEXT,state TEXT,width INTEGER,height INTEGER,storage_key TEXT,size_bytes INTEGER,checksum TEXT)","CREATE TABLE cloud_meta_trial(id INTEGER PRIMARY KEY,request_id TEXT,config_hash TEXT,page_id TEXT,caption TEXT,file_id TEXT,image_checksum TEXT,prepared_at INTEGER,actor TEXT,state TEXT,sent_at INTEGER,remote_id TEXT,photo_id TEXT,confirmed_at INTEGER,reason TEXT)","CREATE TABLE notification_outbox(event_id TEXT UNIQUE,payload_json TEXT)"])await db.prepare(sql).run();
  await db.prepare("INSERT INTO cloud_library VALUES(?,'image','complete',1080,1080,'fixture-image',?,?)").bind(fileId,bytes.length,createHash('sha256').update(bytes).digest('hex')).run();await(await mf.getR2Bucket('MEDIA')).put('fixture-image',bytes);
  const jwt=await new SignJWT({email:POLICY.ownerEmail,csrf:'c'.repeat(64)}).setSubject('fixture').setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setIssuer(origin).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signing));
  const headers={Cookie:'__Host-nttu_session='+jwt,Origin:origin,'X-CSRF-Token':'c'.repeat(64),'Content-Type':'application/json'},requestId=crypto.randomUUID();
  console.log('Native trial fixture: checking preparation.');const prepare=await mf.dispatchFetch(origin+'/api/meta/trial/prepare',{method:'POST',headers,body:JSON.stringify({requestId,libraryId:fileId})});assert.equal(prepare.status,200);assert.equal(posts,0);
  const send=()=>mf.dispatchFetch(origin+'/api/meta/trial/send',{method:'POST',headers,body:JSON.stringify({requestId,confirmPageId:page,approveCaption:true,approveImage:true})});
  console.log('Native trial fixture: checking send.');const response=await send(),result=await response.json();assert.equal(response.status,200);assert.equal(result.state,'published');assert.equal(posts,1);await send();assert.equal(posts,1);
  assert.equal((await db.prepare('SELECT count(*) n FROM notification_outbox').first()).n,1);
  console.log('Meta native trial passed: workerd multipart binary POST, HMAC, readback and receipt replay; no external Facebook request.');
 }catch(error){console.error('Native trial fixture failed: '+error.message);throw error;}finally{await mf.dispose();}
}
