import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createLocalServer} from '../scripts/dev.mjs';

async function withServer(work){
  const server=createLocalServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await work(base);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const demo=(base,scenario)=>fetch(`${base}/local-api/demo`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Local-Demo':'1'},body:JSON.stringify({scenario})});

test('local UI serves only allowlisted assets with restrictive browser headers',()=>withServer(async base=>{
  for(const path of ['/','/ui/app.js','/ui/style.css','/brand/nttu.png','/brand/fba.png','/brand/digital-economics.jpg']){
    const r=await fetch(base+path);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>0);
    assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }
  for(const path of ['/package.json','/content/content-plan-40.json','/assets/brand/originals/nttu.png','/local-api/missing'])assert.equal((await fetch(base+path)).status,404);
  // Native HTTP preserves a custom Host header; fetch normalizes it on this runtime.
  const status=await new Promise((resolve,reject)=>{
    const req=request(base+'/',{headers:{Host:'external.invalid'}},response=>{response.resume();resolve(response.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(status,403);
}));

test('catalog shows actual draft warehouse without invented readiness or publication',()=>withServer(async base=>{
  const data=await (await fetch(base+'/local-api/catalog')).json();
  assert.equal(data.posts.length,40);assert.equal(data.stock.eligible_distinct_post_count,0);assert.equal(data.stock.coverage_days,0);
  assert.equal(data.posts.filter(p=>p.pool==='reserve').length,10);assert.equal(data.posts.filter(p=>p.audience==='student').length,28);
  assert.equal(data.settings.duration,3.5);assert.equal(data.settings.cohort,2026);assert.equal(data.settings.publishTime,'10:00');
  assert.deepEqual(data.publications,[]);assert.deepEqual(data.schedule,[]);assert.deepEqual(data.notifications,[]);
  assert.ok(data.posts.every(p=>p.reasons.length>0&&p.status==='brief'));
}));

test('each demo is fresh and isolated from the real warehouse',()=>withServer(async base=>{
  const before=await (await fetch(base+'/local-api/catalog')).json();
  for(const [scenario,requests,publications] of [['success',1,1],['reserve',4,1],['unknown',1,0],['reserve',4,1]]){
    const response=await demo(base,scenario);assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.mode,'local_fake');assert.equal(data.requests,requests);assert.equal(data.publications.length,publications);
    assert.ok(data.notifications.every(n=>n.state==='pending'));
  }
  const after=await (await fetch(base+'/local-api/catalog')).json();
  assert.ok(after.stock.checked_at>=before.stock.checked_at);
  delete before.stock.checked_at;delete after.stock.checked_at;assert.deepEqual(after,before);
}));

test('demo rejects external origins, missing opt-in, malformed and oversized input',()=>withServer(async base=>{
  const valid={Origin:base,'Content-Type':'application/json','X-Local-Demo':'1'};
  for(const headers of [{...valid,Origin:'https://external.invalid'},{...valid,'X-Local-Demo':'0'},{...valid,'Content-Type':'text/plain'}]){
    assert.equal((await fetch(base+'/local-api/demo',{method:'POST',headers,body:'{"scenario":"success"}'})).status,403);
  }
  for(const [body,status] of [['{',400],['null',422],['{"scenario":"real"}',422],['x'.repeat(5000),413]]){
    assert.equal((await fetch(base+'/local-api/demo',{method:'POST',headers:valid,body})).status,status);
  }
  assert.equal((await fetch(base+'/api/trial-publish',{method:'POST'})).status,501);
}));
