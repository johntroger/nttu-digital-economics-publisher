// Isolated read-only capability diagnostic. Never imports a publisher.
import {createHash} from 'node:crypto';
const base='https://api.cloudflare.com/client/v4/accounts/4d46e32e5c27ff522ee857308a53e729';
const headers={Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'};
const receipt={d1Status:null,r2Status:null,imageMatched:false,facebookPosts:0,writes:0};
try{
 const r=await fetch(base+'/d1/database/09cdecc7-36a2-4196-950e-ef68b1ecd834/query',{method:'POST',headers,body:JSON.stringify({batch:[{sql:"SELECT storage_key,size_bytes,checksum FROM cloud_library WHERE state='complete' AND checksum=?",params:['768a2322450779c9d3629213442f9ff344ee13bb30f11a6978e68c8cc0ccb251']}]}),redirect:'error',signal:AbortSignal.timeout(15000)});receipt.d1Status=r.status;
 const j=await r.json();const file=j?.result?.[0]?.results?.[0];if(r.ok&&j.success&&file){const object=await fetch(base+'/r2/buckets/nttu-publisher-production-assets/objects/'+encodeURIComponent(file.storage_key),{headers,redirect:'error',signal:AbortSignal.timeout(10000)});receipt.r2Status=object.status;if(object.ok){const bytes=Buffer.from(await object.arrayBuffer());receipt.imageMatched=bytes.length===file.size_bytes&&createHash('sha256').update(bytes).digest('hex')===file.checksum;receipt.imageBytes=bytes.length;}}
}catch{receipt.transportFailed=true;}
console.log('F13_CLOUD_READ '+JSON.stringify(receipt));
