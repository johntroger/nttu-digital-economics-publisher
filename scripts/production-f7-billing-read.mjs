// Read-only account quota acceptance; no Worker/Meta/Telegram transport.
import {pathToFileURL} from 'node:url';
import {githubJSON,ACTIONS_MINUTE_WEIGHTS,isActionsProduct,isMinutesUnit} from './production-runner-quota.mjs';
export function summarizeBillingUsage(usage,now=Date.now()){
 const month=new Date(now).toISOString().slice(0,7),weights=ACTIONS_MINUTE_WEIGHTS;
 if(!Array.isArray(usage?.usageItems)||usage.usageItems.length>10000)throw Error('F7_USAGE_INVALID');
 const daily={};let used=0,charged=0,rows=0;const products=new Set();
 for(const item of usage.usageItems){
  if(typeof item?.product!=='string'||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))||!item.date.startsWith(month))throw Error('F7_USAGE_INVALID');
  if(!/^[a-zA-Z0-9 _-]{1,64}$/.test(item.product))throw Error('F7_USAGE_INVALID');
  products.add(item.product);
  if(!isActionsProduct(item.product))continue;
  if(!Object.hasOwn(weights,item.sku)||!isMinutesUnit(item.unitType)||!Number.isFinite(item.quantity)||item.quantity<0||!Number.isFinite(item.netAmount)||item.netAmount<0)throw Error('F7_USAGE_UNSUPPORTED');
  const minutes=Math.ceil(item.quantity)*weights[item.sku],day=item.date.slice(0,10);
  used+=minutes;charged+=item.netAmount;rows++;daily[day]=(daily[day]??0)+minutes;
 }
 // Empty or unsupported product-only reports must not become a zero-usage allowance.
 return {month,account:'johntroger',scope:'account',totalUsageItems:usage.usageItems.length,products:[...products].sort(),usageRows:rows,quotaUsable:rows>0,conservativeUsedMinutes:rows>0?used:null,netAmountUSD:charged,dailyMinutes:daily,budgetVerifiedByAPI:false,activationApproved:false};
}
export function billingSchema(usage){
 const rows=Array.isArray(usage?.usageItems)?usage.usageItems:[],clean=x=>typeof x==='string'&&/^[a-zA-Z0-9 _-]{1,64}$/.test(x)&&!x.startsWith('github_pat_')?x:'unsupported';
 return {rowCount:rows.length,keys:[...new Set(rows.slice(0,100).flatMap(r=>Object.keys(r??{})))].map(clean).sort(),products:[...new Set(rows.map(r=>clean(r?.product)))].slice(0,20),skus:[...new Set(rows.map(r=>clean(r?.sku)))].slice(0,20),units:[...new Set(rows.map(r=>clean(r?.unitType)))].slice(0,20),quantityTypes:[...new Set(rows.map(r=>typeof r?.quantity))]};
}
export async function billingRead(env,transport=fetch,now=Date.now(),diagnostics=()=>{}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='johntroger/nttu-digital-economics-publisher'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/codex/step38-f7-closed-acceptance')throw Error('F7_BILLING_CONTEXT_INVALID');
 const date=new Date(now),result=await githubJSON('/users/johntroger/settings/billing/usage?year='+date.getUTCFullYear()+'&month='+(date.getUTCMonth()+1),env.PRODUCTION_BILLING_READ_TOKEN,transport);
 diagnostics(billingSchema(result));
 return summarizeBillingUsage(result,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const receipt=await billingRead(process.env,fetch,Date.now(),schema=>console.log('F7_BILLING_SCHEMA '+JSON.stringify(schema)));console.log('F7_BILLING_RECEIPT '+JSON.stringify({capturedAt:new Date().toISOString(),...receipt}));if(!receipt.quotaUsable)process.exitCode=1;}
 catch{console.error('F7_BILLING_READ_FAILED');process.exitCode=1;}
}
