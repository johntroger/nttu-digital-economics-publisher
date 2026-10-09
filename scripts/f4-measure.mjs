// Explicit private cloud acceptance against the owned F4 clone only.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root='tmp/step38/f4',ledger=JSON.parse(readFileSync(root+'/resources.json'));
if(ledger.deleted||!ledger.created||!ledger.seeded||!/^nttu-f4-cpu-[a-f0-9]+$/.test(ledger.worker??'')||ledger.origin!=='https://'+ledger.worker+'.nttu-kts-johntroger.workers.dev'||!ledger.token)throw Error('Owned active isolated F4 Worker required');
const mode=process.argv[2]??'probe',events=[],requests=[],label=mode+'-'+Date.now();
const save=()=>{writeFileSync(root+'/'+label+'-tail.json',JSON.stringify(events,null,2));writeFileSync(root+'/'+label+'-requests.json',JSON.stringify(requests,null,2));};
async function cf(path,method='GET',body){const conf=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=conf.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('Cloudflare login unavailable');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/4d46e32e5c27ff522ee857308a53e729'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||!j.success)throw Error('Cloudflare tail operation HTTP '+r.status);return j.result;}
const tailPath='/workers/scripts/'+ledger.worker+'/tails',tail=await cf(tailPath,'POST',{});
const socket=new WebSocket(tail.url,'trace-v1');socket.binaryType='arraybuffer';
let pending='';
function parse(){const start=pending.indexOf('{');if(start<0){pending=pending.slice(-1000);return;}pending=pending.slice(start);let depth=0,quoted=false,escaped=false;for(let i=0;i<pending.length;i++){const c=pending[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{const e=JSON.parse(pending.slice(0,i+1)),url=e.event?.request?.url;let mark;for(const log of e.logs??[]){const parts=log.message??[];if(parts[0]==='F4_OBSERVATION')try{mark=JSON.parse(parts[1]);}catch{}}
 events.push({version:e.scriptVersion?.id??null,path:typeof url==='string'?new URL(url).pathname:null,at:e.eventTimestamp??null,outcome:e.outcome??null,cpuTime:e.cpuTime??e.metrics?.cpuTime??null,wallTime:e.wallTime??e.metrics?.wallTime??null,cold:mark?.cold??null,deployment:mark?.deployment??null});save();}catch{}pending=pending.slice(i+1);return parse();}}}

socket.addEventListener('message',event=>{pending+=typeof event.data==='string'?event.data:Buffer.from(event.data).toString();parse();});
let connected=false,exited=false;socket.addEventListener('close',()=>{exited=true;});
try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('F4 CPU tail open timeout')),20000);socket.addEventListener('open',()=>{clearTimeout(timer);connected=true;socket.send(JSON.stringify({debug:false}));resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('F4 CPU tail connection failed'));},{once:true});});}
catch(error){socket.close();await cf(tailPath+'/'+tail.id,'DELETE');throw error;}
const base=Date.parse('2026-10-08T02:00:00Z');
async function call(path,body={}){const start=Date.now();let response,j;try{response=await fetch(ledger.origin+path,{method:'POST',headers:{Authorization:'Bearer '+ledger.token,'Content-Type':'application/json'},body:JSON.stringify({at:base,...body}),signal:AbortSignal.timeout(30000)});const text=await response.text();try{j=JSON.parse(text);}catch{j={error:'NON_JSON_RESPONSE'};}requests.push({path,status:response.status,state:j.state??null,phase:j.phase??null,error:j.error??null,cold:j.cold??null,wallMs:Date.now()-start});save();if(!response.ok)throw Error(path+' HTTP '+response.status+' '+(j.error??''));return j;}catch(error){save();throw error;}}
function warm(path){return events.filter(e=>e.path===path&&e.cold===false&&typeof e.cpuTime==='number'&&e.outcome==='ok').length;}
async function publishing(){await call('/reset');for(const [i,[p,state]] of [['content','content_prepared'],['image','image_prepared'],['connection','connection_prepared'],['send','evidence_recorded'],['evidence-get','evidence_verified'],['finalize','confirmed']].entries()){const at=base+i*60000,r=await call('/tick/'+p,{at});if(r.state!==state)throw Error(p+' returned '+r.state);const summary=await call('/summary',{at}),monitor=await call('/monitor',{at});if(summary.publishingEnabled!==(state!=='confirmed')||monitor.publishingEnabled!==summary.publishingEnabled||monitor.paused!==summary.paused)throw Error('Manager/monitor state mismatch during '+p);}}
async function reads(){const r=await call('/reset',{scenario:'closed'});for(const p of ['/summary','/posts','/library','/detail'])await call(p,{key:r.postId});let receipt;for(const p of ['content','image','connection','finalize']){const j=await call('/preparation/'+p,{key:r.versionId,receipt});receipt=j.nextReceipt;}
 let cursor,offset=0;do{const phase=cursor?JSON.parse(Buffer.from(cursor.split('.')[0],'base64url').toString()).phase:'initialize';const j=await call('/preview/'+phase,{cursor});cursor=j.nextCursor;offset++;if(offset>43)throw Error('Preview did not finish');}while(cursor);}
async function stock(){await call('/reset',{scenario:'stock'});let offset=0,state;do{const p=offset===0?'stock-init':offset<=40?'stock-item':'stock-finalize';const j=await call('/tick/'+p,{at:base+offset*60000});state=j.state;offset++;if(offset>43)throw Error('Stock did not finish');}while(state!=='day_complete');}
try{
 for(let i=0;i<60&&!connected&&!exited;i++)await new Promise(r=>setTimeout(r,1000));
 if(!connected||exited)throw Error('Cloud CPU tail not connected; no measurements started');
 if(mode==='diagnostic'){for(let i=0;i<20;i++){try{await publishing();}catch{} }}
 else if(mode==='probe')await publishing();
 else if(mode==='publish'){
  const paths=['content','image','connection','send','evidence-get','finalize'].map(p=>'/tick/'+p);
  for(let i=0;i<150;i++){await publishing();if(i%5===0)console.log(JSON.stringify({cycle:i+1,samples:Object.fromEntries(paths.map(p=>[p,warm(p)]))}));if(paths.every(p=>warm(p)>=30))break;}
 }else if(mode==='reads'){for(let i=0;i<50;i++){await reads();if(i%5===0)console.log(JSON.stringify({readCycle:i+1}));}}
 else if(mode==='stock'){for(let i=0;i<60;i++){await stock();console.log(JSON.stringify({stockCycle:i+1,finalize:warm('/tick/stock-finalize')}));if(warm('/tick/stock-init')>=30&&warm('/tick/stock-finalize')>=30)break;}}
 else throw Error('Unknown F4 measurement mode');
 await new Promise(r=>setTimeout(r,4000));
}finally{socket.close();await cf(tailPath+'/'+tail.id,'DELETE');save();console.log(JSON.stringify({evidence:root+'/'+label,requests:requests.length,events:events.length,maxCpu:Math.max(0,...events.map(e=>e.cpuTime??0))}));}

process.exit(0);
