// Explicit acceptance of the owned private F5 clone; Meta remains loopback-only.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runnerFixture} from '../tests/helpers/production-runner-http.mjs';
import {runSimulatedActionsRunner,runSimulatedRunnerMonitor} from './production-actions-runner.mjs';
const root='tmp/step38/f5',l=JSON.parse(readFileSync(root+'/resources.json'));
if(l.deleted||!l.seeded||!/^nttu-f5-cpu-[a-f0-9]{10}$/.test(l.worker??'')||l.origin!=='https://'+l.worker+'.nttu-kts-johntroger.workers.dev'||! /^[a-f0-9]{64}$/.test(l.token??''))throw Error('Owned isolated F5 clone required');
const events=[],requests=[],label='mock-'+Date.now(),save=()=>{writeFileSync(root+'/'+label+'-tail.json',JSON.stringify(events,null,2));writeFileSync(root+'/'+label+'-requests.json',JSON.stringify(requests,null,2));};
async function cf(p,method='GET',body){const conf=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=conf.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('Cloudflare login unavailable');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/4d46e32e5c27ff522ee857308a53e729'+p,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||!j.success)throw Error('F5 tail HTTP '+r.status);return j.result;}
let tail,socket,pending='',fixture;
function parse(){const start=pending.indexOf('{');if(start<0){pending=pending.slice(-1000);return;}pending=pending.slice(start);let depth=0,quoted=false,escaped=false;for(let i=0;i<pending.length;i++){const c=pending[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{const e=JSON.parse(pending.slice(0,i+1));let mark;for(const log of e.logs??[])if(log.message?.[0]==='F5_OBSERVATION')try{mark=JSON.parse(log.message[1]);}catch{}events.push({version:e.scriptVersion?.id??null,path:e.event?.request?.url?new URL(e.event.request.url).pathname:null,at:e.eventTimestamp??null,outcome:e.outcome??null,cpuTime:e.cpuTime??e.metrics?.cpuTime??null,wallTime:e.wallTime??e.metrics?.wallTime??null,cold:mark?.cold??null,deployment:mark?.deployment??null,group:mark?.group??null});save();}catch{}pending=pending.slice(i+1);return parse();}}}
const tailPath='/workers/scripts/'+l.worker+'/tails';
async function closeTail(){socket?.close();if(tail){await cf(tailPath+'/'+tail.id,'DELETE');tail=undefined;}}
async function openTail(){tail=await cf(tailPath,'POST',{});socket=new WebSocket(tail.url,'trace-v1');socket.binaryType='arraybuffer';pending='';const current=socket;current.addEventListener('message',e=>{if(current!==socket)return;pending+=typeof e.data==='string'?e.data:Buffer.from(e.data).toString();parse();});await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(Error('F5 tail timeout')),20000);current.addEventListener('open',()=>{clearTimeout(timer);current.send(JSON.stringify({debug:false}));done();},{once:true});current.addEventListener('error',()=>{clearTimeout(timer);reject(Error('F5 tail failed'));},{once:true});});}
const phases=['claim',...Array.from({length:5},(_,g)=>'data:'+g),'image','proof','intent','authorize','evidence','finalize','status'];
const key=e=>e.path==='/runner/data'?'data:'+e.group:e.path?.replace('/runner/','');
const relevant=()=>events.filter(e=>e.path?.startsWith('/runner/')&&e.version===l.cpuVersion&&String(e.deployment)===String(l.deployment));
function summary(){return Object.fromEntries(phases.map(k=>{const values=relevant().filter(e=>key(e)===k&&e.cold===false&&e.outcome==='ok'&&typeof e.cpuTime==='number').map(e=>e.cpuTime).sort((a,b)=>a-b);return [k,{warm:values.length,max:values.at(-1)??null,p95:values.length?values[Math.ceil(values.length*.95)-1]:null}];}));}
function budget(){const bad=relevant().filter(e=>e.outcome!=='ok'||typeof e.cpuTime==='number'&&e.cpuTime>10);if(bad.length)throw Error('F5 CPU budget failed: '+JSON.stringify(bad.map(e=>({phase:key(e),cpu:e.cpuTime,outcome:e.outcome,cold:e.cold}))));}
async function remote(path,body,group){const start=Date.now(),response=await fetch(l.origin+path,{method:'POST',headers:{Authorization:'Bearer '+l.token,'Content-Type':'application/json',...(group!==undefined?{'X-F5-Group':String(group)}:{})},body,redirect:'error',signal:AbortSignal.timeout(30000)});requests.push({path,status:response.status,wallMs:Date.now()-start});save();
 // Node fetch has already decompressed remote bytes. Never forward compression
 // or encoded Content-Length headers through the loopback HTTP relay.
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');headers.delete('transfer-encoding');return new Response(response.body,{status:response.status,headers});}
let failure;
try{
 const deployed=await cf('/workers/scripts/'+l.worker+'/deployments');if(deployed.deployments?.[0]?.versions?.[0]?.version_id!==l.cpuVersion)throw Error('F5 version changed');
 await openTail();await new Promise(r=>setTimeout(r,5000));
 fixture=await runnerFixture({apiHandler:async request=>{const path=new URL(request.url).pathname,body=await request.text(),data=JSON.parse(body);return remote(path,body,path==='/runner/data'?data.group:undefined);}});
 for(let cycle=0;cycle<150;cycle++){
  if(cycle&&cycle%10===0){await closeTail();await openTail();}
  const reset=await remote('/reset','{}');if(!reset.ok)throw Error('F5 reset failed');
  const result=await runSimulatedActionsRunner(fixture.options);requests.push({cycle:cycle+1,...result});save();if(result.state!=='confirmed'||result.mockPosts!==1)throw Error('F5 mock pipeline failed: '+JSON.stringify(result));
  const monitor=await runSimulatedRunnerMonitor(fixture.options);if(monitor.enabled||!monitor.connectionVerified)throw Error('F5 fresh monitor mismatch');
  await new Promise(r=>setTimeout(r,1000));budget();
  if(cycle%5===0)console.log(JSON.stringify({cycle:cycle+1,stats:summary()}));
  if(Object.values(summary()).every(s=>s.warm>=30))break;
 }
 await new Promise(r=>setTimeout(r,4000));budget();if(!Object.values(summary()).every(s=>s.warm>=30))throw Error('F5 warm sampling incomplete');
}catch(error){failure=error instanceof Error?error.message:'F5 measurement failed';}
finally{await fixture?.dispose();await new Promise(r=>setTimeout(r,4000));await closeTail();save();writeFileSync(root+'/'+label+'-summary.json',JSON.stringify({release:l.release,version:l.cpuVersion,stats:summary(),failure:failure??null,mockPosts:fixture?.postCount()??0,realMetaPosts:0,realTelegramMessages:0},null,2));console.log(JSON.stringify({evidence:root+'/'+label,failure:failure??null}));}
// Node WebSocket connection pool otherwise keeps this one-off tool alive.
process.exit(failure?1:0);
