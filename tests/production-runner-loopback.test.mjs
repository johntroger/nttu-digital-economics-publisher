import test from 'node:test';
import assert from 'node:assert/strict';
import {loopbackServer} from './helpers/production-runner-http.mjs';
test('Runner loopback survives a failed response stream and serves the next request',async()=>{
 let calls=0;
 const server=await loopbackServer(async()=>++calls===1?new Response(new ReadableStream({start(controller){controller.error(Error('upstream body interrupted'));}})):Response.json({ready:true}));
 try{
  const failed=await fetch(server.origin);assert.equal(failed.status,500);assert.equal(await failed.text(),'{}');
  const next=await fetch(server.origin);assert.equal(next.status,200);assert.deepEqual(await next.json(),{ready:true});
 }finally{await server.close();}
});
