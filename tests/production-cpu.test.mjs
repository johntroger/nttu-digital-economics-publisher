import test from 'node:test';
import assert from 'node:assert/strict';
import {liveFixture,LIVE_TEST_TIME as at} from './helpers/production-live-fixture.mjs';
import {productionMigrations} from '../scripts/production-management-prepare.mjs';
import {cpuFetch} from './helpers/production-cpu-worker.ts';
import {mockFetch} from './helpers/production-cpu-mock.ts';
async function fixture(){const f=await liveFixture();f.db.exec(productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherStages:true}).at(-1).sql);f.db.exec('DROP TRIGGER production_usage_no_delete');return {...f,env:{...f.env,CPU_TEST_MODE:'isolated-f4',CPU_TEST_DATABASE_ID:'11111111-2222-3333-4444-555555555555',CPU_TEST_TOKEN:'c'.repeat(64),CPU_MOCK_ORIGIN:'https://nttu-f4-mock-123abc.nttu-kts-johntroger.workers.dev'}};}
const request=(path,body={},token='c'.repeat(64))=>new Request('https://isolated.invalid'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({at,...body})});
test('F4 harness requires isolation and a private capability, denying real database identities',async()=>{
 const f=await fixture();try{assert.equal((await cpuFetch(request('/reset',{},'d'.repeat(64)),f.env)).status,401);
  for(const id of ['09cdecc7-36a2-4196-950e-ef68b1ecd834','83881fd7-88e6-4835-b616-6f4f8f2d25cd'])assert.equal((await cpuFetch(request('/reset'),{...f.env,CPU_TEST_DATABASE_ID:id})).status,500);
  assert.equal((await cpuFetch(request('/reset'),{...f.env,CPU_MOCK_ORIGIN:'https://graph.facebook.com'})).status,500);assert.equal(f.calls.length,0);
 }finally{f.db.close();}
});
test('F4 harness preserves real publisher phases but routes every Graph call to the isolated mock',async()=>{
 const f=await fixture();let posts=0;try{
  f.db.exec("INSERT INTO notification_outbox(event_id,payload_json) VALUES('copied-history','{}'); CREATE TABLE f4_history(id TEXT PRIMARY KEY,event_id TEXT REFERENCES notification_outbox(event_id)); INSERT INTO f4_history VALUES('keep','copied-history')");
  const wire=async(url,init)=>{assert.equal(new URL(url).origin,f.env.CPU_MOCK_ORIGIN);if(init.method==='POST')posts++;return mockFetch(new Request(url,init),f.env);};
  const reset=await cpuFetch(request('/reset'),f.env,wire);assert.equal(reset.status,200,await reset.text());
  for(const [i,state] of ['content_prepared','image_prepared','connection_prepared','evidence_recorded','evidence_verified','confirmed'].entries()){
   const r=await cpuFetch(request('/tick/'+i,{at:at+i*60000}),f.env,wire),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.state,state);
  }assert.equal(posts,1);assert.equal(f.db.prepare('SELECT count(*) n FROM production_publisher_usage').get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM notification_outbox WHERE event_id='copied-history'").get().n,1);
  assert.equal((await cpuFetch(request('/reset'),f.env,wire)).status,200);
 }finally{f.db.close();}
});
test('F4 mock has no anonymous or real-Graph forwarding path',async()=>{
 const f=await fixture();try{assert.equal((await mockFetch(new Request('https://isolated.invalid/v26.0/me'),f.env)).status,401);assert.equal((await mockFetch(new Request('https://isolated.invalid/unrecognized',{headers:{Authorization:'Bearer '+f.env.CPU_TEST_TOKEN}}),f.env)).status,404);}finally{f.db.close();}
});

test('F4 closed harness exercises signed management pages and read-only preparation without production secrets',async()=>{
 const f=await fixture();try{
  const env={...f.env,SESSION_SIGNING_KEY:undefined},wire=async(url,init)=>mockFetch(new Request(url,init),env);
  const reset=await (await cpuFetch(request('/reset',{scenario:'closed'}),env,wire)).json();
  for(const path of ['/summary','/posts','/library','/detail']){
   const r=await cpuFetch(request(path,{key:reset.postId}),env,wire);assert.equal(r.status,200,await r.text());
  }
  const preview=await cpuFetch(request('/preview'),env,wire);assert.equal(preview.status,200,await preview.text());
  let receipt;for(const phase of ['content','image','connection','finalize']){
   const r=await cpuFetch(request('/preparation/'+phase,{key:reset.versionId,receipt}),env,wire),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.phase,phase);receipt=body.nextReceipt;
  }
 }finally{f.db.close();}
});
