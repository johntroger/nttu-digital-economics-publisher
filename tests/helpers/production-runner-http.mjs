import {createServer} from 'node:http';
import {liveFixture,LIVE_TEST_TIME} from './production-live-fixture.mjs';
import {runnerAPI} from '../../src/production/runner-api.ts';
import {productionMigrations} from '../../scripts/production-management-prepare.mjs';
import {SIMULATION_META} from '../../scripts/production-actions-runner.mjs';
import {metaFingerprint} from '../../src/cloud/meta.ts';
export async function loopbackServer(handler){
 const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});const response=await handler(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
 return {origin,async close(){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
export async function runnerFixture({open=true,graphHook,apiHook,outcome='confirmed',apiHandler}={}){
 const f=await liveFixture({open}),db=f.db;for(const m of productionMigrations(f.env.PRODUCTION_DATABASE_ID,{publisherRunner:true}).slice(14))db.exec(m.sql);
 let at=LIVE_TEST_TIME,postCount=0,getCount=0,currentOutcome=outcome;
 const token='a'.repeat(64),env={...f.env,...SIMULATION_META,PRODUCTION_PUBLISHER_ENABLED:'false',PRODUCTION_RUNNER_ENABLED:'true',PRODUCTION_RUNNER_TOKEN:token,PRODUCTION_MONITOR_TOKEN:'b'.repeat(64),PRODUCTION_TRIGGER_TOKEN:'c'.repeat(64)};
 db.prepare('UPDATE production_publisher_config SET connection_hash=? WHERE id=1').run(await metaFingerprint(env));
 const graph=await loopbackServer(async request=>{
  const url=new URL(request.url);await graphHook?.(url,request,{db,env});
  if(url.pathname.endsWith('/debug_token'))return Response.json({data:{is_valid:true,type:'PAGE',app_id:env.META_APP_ID,expires_at:Math.floor(at/1000)+86400,data_access_expires_at:0,scopes:['pages_manage_posts','pages_read_engagement']}});
  if(url.pathname.endsWith('/me'))return Response.json({id:env.META_PAGE_ID,name:'Ngành Kinh tế số - NTTU'});
  if(request.method==='POST'){
   if(url.pathname!=='/v26.0/'+env.META_PAGE_ID+'/photos')return Response.json({}, {status:404});
   postCount++;const form=await request.formData();if(form.get('caption')!==f.item.caption||form.get('published')!=='true'||!(form.get('source') instanceof Blob)||!Buffer.from(await form.get('source').arrayBuffer()).equals(f.imageBytes.get('P01')))return Response.json({error:{code:100}},{status:400});
   if(currentOutcome==='throw')return new Response('lost response',{status:503});if(currentOutcome==='retryable')return Response.json({error:{code:4}},{status:429});if(currentOutcome==='policy')return Response.json({error:{code:100}},{status:400});
   return Response.json({id:'1234567890123456',post_id:f.remote});
  }
  getCount++;return Response.json({id:f.remote,message:currentOutcome==='mismatch'?'different':f.item.caption,created_time:new Date(at).toISOString()});
 });
 const api=await loopbackServer(async request=>{await apiHook?.(new URL(request.url),request,{db,env});return apiHandler?apiHandler(request):runnerAPI(request,env,()=>at);});
 const options={apiOrigin:api.origin,mockGraphOrigin:graph.origin,token,quotaAllowed:true};
 return {...f,env,options,postCount:()=>postCount,getCount:()=>getCount,setTime:n=>{at=n;},setOutcome:x=>{currentOutcome=x;},request:async(route,body={},credential=token)=>fetch(api.origin+route,{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify(body)}),async dispose(){await api.close();await graph.close();db.close();}};
}
