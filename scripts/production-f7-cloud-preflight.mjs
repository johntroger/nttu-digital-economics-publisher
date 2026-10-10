// Read-only preflight for an owned F7 Worker/D1/R2 clone. Never deploys or sends.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const account='4d46e32e5c27ff522ee857308a53e729',at=new Date();
const conf=readFileSync(resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml'),'utf8');
const token=conf.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('F7_CF_AUTH_UNAVAILABLE');
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const r2=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/r2/buckets',{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(20000)});
const buckets=await r2.json();
const result={capturedAt:at.toISOString(),r2:{status:r2.status,available:r2.ok&&buckets.success===true,bucketCount:r2.ok?buckets.result?.buckets?.length:null},cloudflare:{},creationAllowed:false};
const query='query($account:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_lt:$end}){sum{rowsRead rowsWritten}}}}}';
const response=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',redirect:'error',headers,body:JSON.stringify({query,variables:{account,start:at.toISOString().slice(0,10)+'T00:00:00Z',end:at.toISOString()}}),signal:AbortSignal.timeout(20000)});
const data=await response.json(),groups=data.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
if(response.ok&&!data.errors?.length&&Array.isArray(groups)){
 const receipt={accountId:account,source:'cloudflare-account-usage',utcDate:at.toISOString().slice(0,10),capturedAt:Date.now(),rowsRead:groups.reduce((s,g)=>s+g.sum.rowsRead,0),rowsWritten:groups.reduce((s,g)=>s+g.sum.rowsWritten,0),analyticsMayLag:true};
 result.cloudflare=receipt;
 result.creationAllowed=result.r2.available&&Number.isSafeInteger(receipt.rowsRead)&&Number.isSafeInteger(receipt.rowsWritten)&&receipt.rowsRead<3000000&&receipt.rowsWritten<50000;
 mkdirSync('tmp/step38/f7',{recursive:true});writeFileSync('tmp/step38/f7/account-usage.json',JSON.stringify(receipt,null,2));
}else result.cloudflare={status:response.status,available:false};
mkdirSync('tmp/step38/f7',{recursive:true});writeFileSync('tmp/step38/f7/cloud-preflight.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
if(!result.creationAllowed)process.exitCode=1;
