import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT} from 'jose';
import {liveFixture,LIVE_TEST_TIME as now} from './helpers/production-live-fixture.mjs';
import {productionSendPreflight,readOnlyMetaProvider,issueSingleTestPermit,activateSingleTestPermit} from '../src/production/send-preflight.ts';
import {approvedProductionItems} from '../src/production/preview.ts';
import {runProductionPublisher,pauseProductionPublisher,reconcileProductionPublisher} from '../src/production/publisher-live.ts';
import worker from '../src/production/worker.ts';
const owner='tranthanhtung37@gmail.com';
const transport=f=>async(input,init)=>{
 assert.equal(init.method,'GET');const url=new URL(String(input));f.calls.push({method:init.method,path:url.pathname});
 return url.pathname.endsWith('debug_token')?Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,expires_at:Math.floor(f.now()/1000)+86400,data_access_expires_at:0,scopes:['pages_manage_posts','pages_read_engagement']}}):Response.json({id:f.env.META_PAGE_ID,name:'Ngành Kinh tế số - NTTU'});
};
const review=f=>productionSendPreflight(f.env,{versionId:f.item.versionId},transport(f),f.now);
const noWrites=f=>{for(const t of ['production_send_permits','production_publisher_jobs','production_publisher_attempts','production_publisher_evidence','production_publisher_usage','publish_jobs','publications','schedule_slots'])assert.equal(f.db.prepare('SELECT count(*) n FROM '+t).get().n,0,t);};
test('selected source/fact projection preserves every approved item and receipt digest across all 40 posts',async()=>{
 const f=await liveFixture();try{const all=await approvedProductionItems(f.env,now);assert.equal(all.length,40);for(const p of all)assert.deepEqual((await approvedProductionItems(f.env,now,p.versionId))[0],p);}finally{f.db.close();}
});
test('send dry-run uses selected approved bytes, server Vietnam time, GET-only connection and zero database writes',async()=>{
 const f=await liveFixture();try{const before=f.db.prepare('SELECT total_changes() n').get().n,r=await review(f);assert.equal(r.preparationVerified,true);assert.equal(r.sendReady,false);assert.equal(r.realPublication,'NOT_RUN');assert.ok(r.queries<=24);assert.equal(r.dossier.pageId,'817593604765443');assert.ok(r.dossier.caption.includes('============'));assert.equal(r.dossier.imageChecksum,f.item.imageChecksum);assert.equal(r.dossier.dueAt,now+120000);assert.equal(r.dossier.businessDate,'2026-10-08');assert.equal(f.calls.length,2);noWrites(f);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);const selected=(await approvedProductionItems(f.env,now,f.item.versionId))[0];assert.deepEqual(selected,f.item);}finally{f.db.close();}
});
test('read-only transport rejects POST even when send is called on the provider',async()=>{
 const f=await liveFixture();try{const p=readOnlyMetaProvider(f.env,transport(f)),r=await p.send({attemptId:'test-only',pageId:f.env.META_PAGE_ID,caption:f.item.caption,checksum:f.item.imageChecksum,bytes:f.imageBytes.get('P01'),sentAt:now},f.now);assert.equal(r.kind,'unknown');assert.equal(f.calls.length,0);noWrites(f);}finally{f.db.close();}
});
test('caller cannot select time, page, token, URL or a nonactive version; closed deployment gates are required',async()=>{
 const f=await liveFixture();try{for(const key of ['now','pageId','token','url','dueAt'])await assert.rejects(productionSendPreflight(f.env,{versionId:f.item.versionId,[key]:'x'},transport(f),f.now),/SEND_REVIEW_INVALID/);await assert.rejects(productionSendPreflight(f.env,{versionId:'missing'},transport(f),f.now),/SEND_REVIEW_REQUIRED/);f.env.PRODUCTION_PUBLISHER_ENABLED='true';await assert.rejects(review(f),/CLOSED_GATES/);assert.equal(f.calls.length,0);noWrites(f);}finally{f.db.close();}
});
test('changed image or source and unmet prerequisites stop before Meta GET',async()=>{
 for(const kind of ['bytes','source','prerequisite']){const f=await liveFixture();try{if(kind==='bytes')f.env.MEDIA.get=async()=>({size:20,arrayBuffer:async()=>new Uint8Array(20).buffer});if(kind==='source')f.db.exec("UPDATE sources SET status='blocked'");if(kind==='prerequisite')f.db.prepare('INSERT INTO post_prerequisites VALUES(?,?)').run(f.item.postId,f.item.postId.replace('P01','P02'));await assert.rejects(review(f));assert.equal(f.calls.length,0);noWrites(f);}finally{f.db.close();}}
});
test('unverified connection, source edit during Meta GET and crossing Vietnam midnight stop with zero writes',async()=>{
 for(const kind of ['connection','source','midnight']){const f=await liveFixture();try{const get=transport(f);await assert.rejects(productionSendPreflight(f.env,{versionId:f.item.versionId},async(i,n)=>{const r=await get(i,n);if(String(i).includes('/me')){if(kind==='connection')return Response.json({id:'551227411605506'});if(kind==='source')f.db.exec("UPDATE sources SET status='blocked'");if(kind==='midnight')f.setTime(now+86400000);}return r;},f.now),/SEND_CONNECTION_UNVERIFIED|SEND_REVIEW_CHANGED/);noWrites(f);}finally{f.db.close();}}
});
test('HTTP review requires owner session, CSRF, same origin, strict method/body and exposes no issuance route',async()=>{
 const f=await liveFixture();try{f.env.AUTH_ORIGIN='https://nttu-publisher-production.example.workers.dev';f.env.GOOGLE_CLIENT_ID='fixture.apps.googleusercontent.com';f.env.GOOGLE_CLIENT_SECRET='fixture-secret-only';f.env.SESSION_SIGNING_KEY='e'.repeat(64);const token=await new SignJWT({email:owner,csrf:'c'.repeat(64)}).setProtectedHeader({alg:'HS256',typ:'nttu-session+jwt'}).setSubject('owner').setIssuer(f.env.AUTH_ORIGIN).setAudience('nttu-manager').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(f.env.SESSION_SIGNING_KEY));
 const req=(path,headers={},method='POST',body='{}')=>new Request(f.env.AUTH_ORIGIN+path,{method,headers:{Cookie:'__Host-nttu_session='+token,...headers},...(method==='POST'?{body}:{})});
 assert.equal((await worker.fetch(new Request(f.env.AUTH_ORIGIN+'/api/production/send-preflight',{method:'POST'}),f.env)).status,401);
 assert.equal((await worker.fetch(req('/api/production/send-preflight'),f.env)).status,403);
 assert.equal((await worker.fetch(req('/api/production/send-preflight',{},'GET'),f.env)).status,405);
 const h={Origin:f.env.AUTH_ORIGIN,'Content-Type':'application/json','X-CSRF-Token':'c'.repeat(64)};
 assert.equal((await worker.fetch(req('/api/production/send-preflight',{...h,Origin:'https://other.invalid'}),f.env)).status,403);
 assert.equal((await worker.fetch(req('/api/production/send-preflight?now=1',h),f.env)).status,422);
 assert.equal((await worker.fetch(req('/api/production/send-preflight',h,'POST','{'),f.env)).status,422);
 for(const path of ['/api/production/permit','/api/production/activate','/api/production/reconcile'])assert.equal((await worker.fetch(req(path,h),f.env)).status,404);noWrites(f);
 }finally{f.db.close();}
});
test('one-time issuance requires exact owner approval, fresh immutable review and separate deployment gate',async()=>{
 const f=await liveFixture();try{const r=await review(f),a={actor:owner,dossierHash:r.dossierHash};await assert.rejects(issueSingleTestPermit(f.env,r,a,f.now),/PUBLICATION_APPROVAL_REQUIRED/);f.env.PRODUCTION_PUBLISHER_ENABLED='true';await assert.rejects(issueSingleTestPermit(f.env,r,{...a,dossierHash:'wrong'},f.now));await assert.rejects(issueSingleTestPermit(f.env,{...r,dossier:{...r.dossier,caption:'edited'}},a,f.now));const p=await issueSingleTestPermit(f.env,r,a,f.now);assert.equal(f.db.prepare('SELECT enabled FROM production_publisher_config').get().enabled,0);await assert.rejects(issueSingleTestPermit(f.env,r,a,f.now),/CONFLICT/);await activateSingleTestPermit(f.env,p.permitId,owner,f.now);f.setTime(r.dossier.dueAt);const result=await runProductionPublisher(f.env,f.provider,f.now);assert.equal(result.state,'confirmed');assert.equal(f.calls.filter(x=>x.method==='POST').length,1);assert.equal(f.db.prepare('SELECT enabled FROM production_publisher_config').get().enabled,0);assert.equal(f.db.prepare('SELECT paused_by_user FROM application_state').get().paused_by_user,1);}finally{f.db.close();}
});
test('expired review and updated content revoke eligibility before issuing a permit',async()=>{
 for(const kind of ['expiry','source']){const f=await liveFixture();try{const r=await review(f);f.env.PRODUCTION_PUBLISHER_ENABLED='true';if(kind==='expiry')f.setTime(r.dossier.dueAt);else f.db.exec("UPDATE sources SET status='blocked'");await assert.rejects(issueSingleTestPermit(f.env,r,{actor:owner,dossierHash:r.dossierHash},f.now));noWrites(f);}finally{f.db.close();}}
});
test('one-time test unknown remains locked after pause until correlated GET reconciliation; never resends',async()=>{
 const f=await liveFixture({outcome:'throw'});try{const r=await review(f);f.env.PRODUCTION_PUBLISHER_ENABLED='true';const p=await issueSingleTestPermit(f.env,r,{actor:owner,dossierHash:r.dossierHash},f.now);await activateSingleTestPermit(f.env,p.permitId,owner,f.now);f.setTime(r.dossier.dueAt);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'unknown');await pauseProductionPublisher(f.env,owner,f.now());f.setTime(r.dossier.dueAt+86400000);assert.equal((await runProductionPublisher(f.env,f.provider,f.now)).state,'unknown');const t=f.db.prepare('SELECT id FROM production_publisher_attempts').get().id;assert.equal((await reconcileProductionPublisher(f.env,f.provider,t,f.remote,f.now)).state,'confirmed');assert.equal(f.calls.filter(x=>x.method==='POST').length,1);}finally{f.db.close();}
});
