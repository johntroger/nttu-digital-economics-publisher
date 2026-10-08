import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture} from './helpers/production-live-fixture.mjs';
import {productionPreparation} from '../src/production/preparation.ts';
import {productionSendPreflight} from '../src/production/send-preflight.ts';
import {signCursor,initialCursor} from '../src/production/read-pages.ts';
const transport=f=>async(input,init)=>{assert.equal(init.method,'GET');const url=new URL(String(input));f.calls.push(url.pathname);return url.pathname.endsWith('/debug_token')?Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,expires_at:Math.floor(f.now()/1000)+86400,data_access_expires_at:0,scopes:['pages_manage_posts','pages_read_engagement']}}):Response.json({id:f.env.META_PAGE_ID,name:'Ngành Kinh tế số - NTTU'});};
const prepare=(f,input,get=transport(f))=>productionPreparation(f.env,input,get,f.now);
async function advance(f,to){let r=await prepare(f,{versionId:f.item.versionId});while(r.phase!==to)r=await prepare(f,{receipt:r.nextReceipt});return r;}
test('F2 four SELECT-only phases preserve the legacy dossier bytes and never grant a publication',async()=>{
 const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const before=f.db.prepare('SELECT total_changes() n').get().n,original=f.env.DB.prepare;f.env.DB.prepare=q=>{assert.match(q,/^SELECT\b/i);return original(q);};
 let result=await prepare(f,{versionId:f.item.versionId}),phases=[];
 while(true){phases.push(result.phase);assert.equal(result.sendReady,false);assert.equal(result.realPublication,'NOT_RUN');if(result.complete)break;assert.equal(result.preparationVerified,false);assert.equal(result.dossier,undefined);assert.ok(result.nextReceipt.length<4096);result=await prepare(f,{receipt:result.nextReceipt});}
 assert.deepEqual(phases,['content','image','connection','finalize']);assert.equal(result.preparationVerified,true);assert.equal(f.calls.length,2);
 const legacy=await productionSendPreflight(f.env,{versionId:f.item.versionId},transport(f),f.now);
 assert.deepEqual(result.dossier,legacy.dossier);assert.equal(result.dossierHash,legacy.dossierHash);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
 assert.equal((await prepare(f,{receipt:(await advance(f,'connection')).nextReceipt})).complete,true);
 }finally{f.db.close();}
});
test('F2 rejects altered, wrong-scope, rotated-key, changed-release and expired receipts before external reads',async()=>{
 const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const first=await prepare(f,{versionId:f.item.versionId}),token=first.nextReceipt;
 for(const input of [{receipt:token.slice(0,-1)+'x'},{receipt:token,versionId:f.item.versionId},{receipt:token,now:f.now()},{pageId:'x'},{receipt:12}])await assert.rejects(prepare(f,input));
 await assert.rejects(productionPreparation(f.env,{receipt:token},transport(f),f.now,'finalize'),/PHASE_INVALID/);
 await assert.rejects(productionPreparation(f.env,{versionId:f.item.versionId},transport(f),f.now,'connection'),/PHASE_INVALID/);
 await assert.rejects(prepare(f,{receipt:await signCursor(f.env,initialCursor(f.env,'preview','fixture',f.now()))}),/INVALID/);
 f.env.RELEASE_SHA='b'.repeat(40);await assert.rejects(prepare(f,{receipt:token}),/EXPIRED/);f.env.RELEASE_SHA=JSON.parse(atob(token.split('.')[0])).release;
 f.env.SESSION_SIGNING_KEY='f'.repeat(64);await assert.rejects(prepare(f,{receipt:token}),/INVALID/);f.env.SESSION_SIGNING_KEY='e'.repeat(64);
 f.setTime(f.now()+300000);await assert.rejects(prepare(f,{receipt:token}),/EXPIRED/);assert.equal(f.calls.length,0);
 }finally{f.db.close();}
});
test('F2 source, reference, operation-generation, config, asset and token changes invalidate pending preparation',async()=>{
 for(const kind of ['source','reference','generation','config','binding','token']){const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const first=await prepare(f,{versionId:f.item.versionId});
 if(kind==='source')f.db.exec("UPDATE sources SET status='blocked'");
 if(kind==='reference')f.db.exec("UPDATE version_sources SET location=location||' '");
 if(kind==='generation')f.db.exec("UPDATE application_state SET operation_generation=operation_generation+1 WHERE environment='production'");
 if(kind==='config')f.db.exec('UPDATE production_publisher_config SET revision=revision+1');
 if(kind==='binding')f.db.exec('UPDATE asset_bindings SET check_version=check_version+1');
 if(kind==='token')f.env.META_PAGE_ACCESS_TOKEN+='changed';
 await assert.rejects(prepare(f,{receipt:first.nextReceipt}),/CHANGED/);assert.equal(f.calls.length,0);
 }finally{f.db.close();}}
});
test('F2 corrupt R2 bytes and wrong Meta Page stop the chain without producing a dossier',async()=>{
 for(const kind of ['bytes','page']){const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const first=await prepare(f,{versionId:f.item.versionId});if(kind==='bytes'){f.env.MEDIA.get=async()=>({size:1,arrayBuffer:async()=>new Uint8Array(1).buffer});await assert.rejects(prepare(f,{receipt:first.nextReceipt}),/FILE_INTEGRITY/);}else{const image=await prepare(f,{receipt:first.nextReceipt});await assert.rejects(prepare(f,{receipt:image.nextReceipt},async()=>Response.json({id:'551227411605506'})),/CONNECTION_UNVERIFIED/);}assert.equal(f.db.prepare('SELECT count(*) n FROM production_send_permits').get().n,0);
 }finally{f.db.close();}}
});
test('F2 async source changes, source deadline, paused gates and Vietnam midnight invalidate finalization',async()=>{
 for(const kind of ['source','deadline','gate','midnight']){const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);if(kind==='deadline')f.db.exec("UPDATE sources SET review_due_at='2026-10-08T03:00:01Z'");const image=await advance(f,'image'),get=transport(f);
 const connection=await prepare(f,{receipt:image.nextReceipt},async(i,n)=>{const r=await get(i,n);if(String(i).includes('/me')&&kind==='source')f.db.exec("UPDATE sources SET status='blocked'");return r;});
 if(kind==='deadline')f.setTime(f.now()+1000);if(kind==='gate')f.env.PRODUCTION_PUBLISHER_ENABLED='true';if(kind==='midnight')f.setTime(Date.parse('2026-10-08T17:00:00Z'));
 await assert.rejects(prepare(f,{receipt:connection.nextReceipt}));assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_jobs').get().n,0);
 }finally{f.db.close();}}
});

test('F2 carries Meta expiry into the signed final receipt and review lifetime',async()=>{
 const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const image=await advance(f,'image'),deadline=f.now()+1000,get=transport(f);
 const connection=await prepare(f,{receipt:image.nextReceipt},async(i,n)=>String(i).includes('debug_token')?Response.json({data:{is_valid:true,type:'PAGE',app_id:f.env.META_APP_ID,expires_at:deadline/1000,data_access_expires_at:0,scopes:['pages_manage_posts','pages_read_engagement']}}):get(i,n));
 const final=await prepare(f,{receipt:connection.nextReceipt});assert.equal(final.dossier.reviewExpiresAt,deadline);f.setTime(deadline);await assert.rejects(prepare(f,{receipt:connection.nextReceipt}),/EXPIRED/);
 }finally{f.db.close();}
});

test('F2 content phases validate all 40 original approvals without accepting caller time, target or URLs',async()=>{
 const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);
 for(const key of ['now','pageId','token','url','phase','dueAt'])await assert.rejects(prepare(f,{versionId:f.item.versionId,[key]:'x'}),/INVALID/);
 const rows=f.db.prepare('SELECT active_version_id FROM content_entries ORDER BY stable_order').all();
 for(const row of rows){const r=await prepare(f,{versionId:row.active_version_id});assert.equal(r.phase,'content');assert.equal(r.complete,false);}
 assert.equal(f.calls.length,0);
 }finally{f.db.close();}
});

test('F2 selected snapshot keeps an unrelated version change separate but rejects a change to the selected approval',async()=>{
 const f=await liveFixture();try{f.env.SESSION_SIGNING_KEY='e'.repeat(64);const initial=await prepare(f,{versionId:f.item.versionId});
 f.db.prepare("UPDATE post_versions SET status='quarantined' WHERE id=(SELECT active_version_id FROM content_entries WHERE active_version_id<>? LIMIT 1)").run(f.item.versionId);
 const image=await prepare(f,{receipt:initial.nextReceipt});assert.equal(image.phase,'image');
 f.db.prepare('UPDATE post_versions SET check_version=check_version+1 WHERE id=?').run(f.item.versionId);
 await assert.rejects(prepare(f,{receipt:image.nextReceipt}),/CHANGED/);assert.equal(f.calls.length,0);
 }finally{f.db.close();}
});
