import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeF5Telemetry} from '../scripts/f5-telemetry.mjs';
const base={worker:'nttu-f5-cpu-1234567890',version:'fixture-version',deployment:1,release:'fixture-release',tail:[]};
function pair(id,phase='claim',group=null,cpu=3,cold=false,at=10000){
 const path='/runner/'+phase,common={scriptName:base.worker,scriptVersion:{id:base.version}};
 return [{timestamp:new Date(at).toISOString(),$metadata:{id:id+'-marker',requestId:id},$workers:common,source:{message:'F5_OBSERVATION '+JSON.stringify({path,group,deployment:'1',cold})}},
 {timestamp:new Date(at+10).toISOString(),$metadata:{id:id+'-inv',requestId:id},$workers:{...common,cpuTimeMs:cpu,wallTimeMs:10,outcome:'ok',event:{request:{url:'https://fixture.invalid'+path,headers:{Authorization:'never-retain'}}}}}];
}
test('F5 persisted log pairs preserve CPU groups, strip headers and never replace cold with warm',()=>{
 const rows=['claim',...Array(5).fill('data'),'image','proof','intent','authorize','evidence','finalize','status'].flatMap((p,i)=>Array.from({length:30},(_,n)=>pair(i+'-'+n,p,p==='data'?String(i-1):null,3,false,10000+i*10000+n*100)).flat());
 const result=analyzeF5Telemetry({...base,rows});assert.equal(result.warmComplete,true);assert.equal(result.coldApiSamples,0);assert.equal(result.stats['data:4'].warm,30);assert.equal(JSON.stringify(result).includes('never-retain'),false);
});
test('F5 telemetry rejects stale versions, duplicate receipts and mismatched request markers',()=>{
 const rows=pair('a');assert.throws(()=>analyzeF5Telemetry({...base,version:'other',rows}),/version mismatch/);
 assert.throws(()=>analyzeF5Telemetry({...base,rows:[...rows,rows[0]]}),/Duplicate export/);
 const changed=structuredClone(rows);changed[1].$workers.event.request.url='https://fixture.invalid/runner/image';assert.throws(()=>analyzeF5Telemetry({...base,rows:changed}),/correlation mismatch/);
});
test('F5 telemetry excludes overlap, deduplicates old tail and refuses CPU exceedance or missing proof',()=>{
 const rows=pair('a'),tail={version:base.version,path:'/runner/claim',at:1000,cold:false,deployment:1,cpuTime:4,outcome:'ok',group:null};
 const r=analyzeF5Telemetry({...base,rows,tail:[tail,tail,{...tail,at:10000}]});assert.equal(r.stats.claim.warm,2);
 assert.equal(analyzeF5Telemetry({...base,rows:pair('b','claim',null,11,true)}).bad.length,1);
 assert.equal(analyzeF5Telemetry({...base,rows:[pair('c','claim',null,11)[1]]}).bad.length,1);
 assert.equal(analyzeF5Telemetry({...base,rows:[rows[0]]}).ignoredUnpaired,1);
});
