// Correlate downloaded Cloudflare logs without running more acceptance traffic.
// Only narrow evidence is returned; request headers and bodies are never retained.
export function analyzeF5Telemetry({rows,tail,worker,version,deployment,release}){
 if(!Array.isArray(rows)||!rows.length||!Array.isArray(tail)||!/^nttu-f5-cpu-[a-f0-9]{10}$/.test(worker)||!version||!release)throw Error('F5 telemetry input required');
 const pairs=new Map(),events=[],ids=new Set(),unpairedBad=[];let ignoredUnpaired=0;
 for(const row of rows){
  if(row.$workers?.scriptName!==worker||row.$workers?.scriptVersion?.id!==version)throw Error('Export version mismatch');
  const id=row.$metadata?.requestId,time=Date.parse(row.timestamp);
  if(!id||!row.$metadata.id||!Number.isSafeInteger(time))throw Error('Missing requestId or timestamp');
  if(ids.has(row.$metadata.id))throw Error('Duplicate export event');ids.add(row.$metadata.id);
  let pair=pairs.get(id);if(!pair)pairs.set(id,pair={});
  if(typeof row.$workers.cpuTimeMs==='number'){
   if(pair.invocation)throw Error('Duplicate invocation');pair.invocation=row;
  }else if(row.source?.message?.startsWith('F5_OBSERVATION ')){
   if(pair.marker)throw Error('Duplicate marker');pair.marker=row;
  }
 }
 for(const [id,pair] of pairs){
  if(!pair.invocation||!pair.marker){
   ignoredUnpaired++;
   if(pair.invocation){const i=pair.invocation,path=new URL(i.$workers.event.request.url).pathname;if(path.startsWith('/runner/')&&(i.$workers.outcome!=='ok'||!Number.isFinite(i.$workers.cpuTimeMs)||i.$workers.cpuTimeMs<0||i.$workers.cpuTimeMs>10))unpairedBad.push({requestId:id,path,cpuTime:i.$workers.cpuTimeMs,outcome:i.$workers.outcome,source:'unpaired-invocation'});}
   continue;
  }
  const i=pair.invocation,m=JSON.parse(pair.marker.source.message.slice('F5_OBSERVATION '.length)),path=new URL(i.$workers.event.request.url).pathname,at=Date.parse(pair.marker.timestamp);
  if(path!==m.path||String(m.deployment)!==String(deployment)||typeof m.cold!=='boolean'||at>Date.parse(i.timestamp))throw Error('Marker correlation mismatch');
  events.push({requestId:id,version,path,at,outcome:i.$workers.outcome,cpuTime:i.$workers.cpuTimeMs,wallTime:i.$workers.wallTimeMs,cold:m.cold,deployment:m.deployment,group:m.group,source:'persisted-log-pair'});
 }
 // Do not merge overlapping time ranges. A one-second exclusion also removes
 // requests straddling the first exported invocation/marker pair.
 const boundary=Math.min(...rows.map(r=>Date.parse(r.timestamp)))-1000,seenTail=new Set();
 for(const e of tail){
  if(e.version!==version||String(e.deployment)!==String(deployment)||e.at>=boundary)continue;
  if(!Number.isSafeInteger(e.at)||typeof e.cold!=='boolean')throw Error('Invalid tail event');
  const id=JSON.stringify([e.version,e.path,e.at,e.group]);if(seenTail.has(id))continue;seenTail.add(id);
  events.push({version:e.version,path:e.path,at:e.at,outcome:e.outcome,cpuTime:e.cpuTime,wallTime:e.wallTime,cold:e.cold,deployment:e.deployment,group:e.group,source:'earlier-tail'});
 }
 const phases=['claim',...Array.from({length:5},(_,i)=>'data:'+i),'image','proof','intent','authorize','evidence','finalize','status'];
 const relevant=events.filter(e=>e.path.startsWith('/runner/')),key=e=>e.path==='/runner/data'?'data:'+e.group:e.path.replace('/runner/','');
 const stats=Object.fromEntries(phases.map(k=>{
  const v=relevant.filter(e=>key(e)===k&&e.cold===false&&e.outcome==='ok'&&Number.isFinite(e.cpuTime)&&e.cpuTime>=0).map(e=>e.cpuTime).sort((a,b)=>a-b);
  return [k,{warm:v.length,p95:v[Math.ceil(v.length*.95)-1]??null,max:v.at(-1)??null,cold:relevant.filter(e=>key(e)===k&&e.cold===true).map(e=>e.cpuTime)}];
 }));
 const bad=[...unpairedBad,...relevant.filter(e=>!phases.includes(key(e))||e.outcome!=='ok'||!Number.isFinite(e.cpuTime)||e.cpuTime<0||e.cpuTime>10)];
 return {release,version,rawExportRows:rows.length,ignoredUnpaired,boundary,events,stats,bad,warmComplete:bad.length===0&&Object.values(stats).every(s=>s.warm>=30),coldApiSamples:relevant.filter(e=>e.cold===true).length};
}
