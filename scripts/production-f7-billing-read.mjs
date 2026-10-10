// Read-only account quota acceptance; no Worker/Meta/Telegram transport.
import {pathToFileURL} from 'node:url';
import {githubJSON} from './production-runner-quota.mjs';
export function summarizeBillingUsage(usage,now=Date.now()){
 const month=new Date(now).toISOString().slice(0,7),weights={'Actions Linux':1,'Actions Windows':2,'Actions macOS':10};
 if(!Array.isArray(usage?.usageItems)||usage.usageItems.length>10000)throw Error('F7_USAGE_INVALID');
 const daily={};let used=0,charged=0,rows=0;
 for(const item of usage.usageItems){
  if(typeof item?.product!=='string'||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))||!item.date.startsWith(month))throw Error('F7_USAGE_INVALID');
  if(item.product!=='Actions')continue;
  if(!Object.hasOwn(weights,item.sku)||item.unitType!=='minutes'||!Number.isFinite(item.quantity)||item.quantity<0||!Number.isFinite(item.netAmount)||item.netAmount<0)throw Error('F7_USAGE_UNSUPPORTED');
  const minutes=Math.ceil(item.quantity)*weights[item.sku],day=item.date.slice(0,10);
  used+=minutes;charged+=item.netAmount;rows++;daily[day]=(daily[day]??0)+minutes;
 }
 return {month,account:'johntroger',scope:'account',usageRows:rows,conservativeUsedMinutes:used,netAmountUSD:charged,dailyMinutes:daily,budgetVerifiedByAPI:false,activationApproved:false};
}
export async function billingRead(env,transport=fetch,now=Date.now()){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='johntroger/nttu-digital-economics-publisher'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/codex/step38-f7-closed-acceptance')throw Error('F7_BILLING_CONTEXT_INVALID');
 const date=new Date(now),result=await githubJSON('/users/johntroger/settings/billing/usage?year='+date.getUTCFullYear()+'&month='+(date.getUTCMonth()+1),env.PRODUCTION_BILLING_READ_TOKEN,transport);
 return summarizeBillingUsage(result,now);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log('F7_BILLING_RECEIPT '+JSON.stringify({capturedAt:new Date().toISOString(),...await billingRead(process.env)}));}
 catch{console.error('F7_BILLING_READ_FAILED');process.exitCode=1;}
}
