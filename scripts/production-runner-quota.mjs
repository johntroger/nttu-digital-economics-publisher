// Account-wide billing read. No repository filter: other CI/monitor jobs share
// the allowance. A 200 response cannot prove a zero-dollar stop-usage policy.
export const REPOSITORY='johntroger/nttu-digital-economics-publisher';
// Canonical API identifiers and legacy display labels, standard runners only.
// https://docs.github.com/en/billing/reference/product-and-sku-names
export const ACTIONS_MINUTE_WEIGHTS=Object.freeze({'Actions Linux':1,actions_linux:1,'Actions Windows':2,actions_windows:2,'Actions macOS':10,actions_macos:10});
export const isActionsProduct=product=>product==='Actions'||product==='actions';
// Observed account usage reports use "Minutes"; documentation examples use "minutes".
export const isMinutesUnit=unit=>unit==='minutes'||unit==='Minutes';
export async function githubJSON(path,token,transport=fetch){
 if(!token||!path.startsWith('/')||path.includes('://'))throw Error('GITHUB_READ_INVALID');
 const response=await transport('https://api.github.com'+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'},signal:AbortSignal.timeout(10000)});
 if(response.status!==200||response.headers.get('link'))throw Error('GITHUB_READ_UNAVAILABLE');
 const reader=response.body?.getReader();let size=0,text='';const decoder=new TextDecoder();
 if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>1048576){await reader.cancel();throw Error('GITHUB_READ_TOO_LARGE');}text+=decoder.decode(p.value,{stream:true});}
 text+=decoder.decode();try{return JSON.parse(text);}catch{throw Error('GITHUB_READ_INVALID');}
}
function policyDecision(policy,now){
 const denied=reason=>({allowed:false,reason});
 if(!Number.isFinite(new Date(now).getTime()))return denied('budget_unverified');
 if(!Number.isSafeInteger(now)||now<0||!policy||policy.account!=='johntroger'||policy.product!=='Actions'||policy.scope!=='account'||policy.budgetUSD!==0||policy.stopUsage!==true||policy.plan!=='free'||!Number.isSafeInteger(policy.verifiedAt)||policy.verifiedAt>now||!Number.isSafeInteger(policy.includedMinutes)||policy.includedMinutes<1||policy.includedMinutes>2000)return denied('budget_unverified');
 if(policy.policyVersion===2){
  const d=new Date(now),month=d.toISOString().slice(0,7),start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1);
  // Explicit owner attestation, not an API-verified budget or automatic renewal.
  // It is bound to one UTC billing month and one reviewed release.
  if(policy.verificationMode!=='owner-monthly-attestation'||policy.evidenceSource!=='authenticated-github-ui'||policy.reviewedBy!=='tranthanhtung37@gmail.com'||policy.ownerApproved!==true||policy.autoRenew!==false||policy.period!==month||policy.verifiedAt<start||policy.expiresAt!==end||now>=policy.expiresAt||! /^[a-f0-9]{40}$/.test(policy.releaseSha??''))return denied('budget_unverified');
 }else if(policy.policyVersion!==undefined&&policy.policyVersion!==1||now-policy.verifiedAt>86400000)return denied('budget_unverified');
 // Releasing the monthly reserve requires a separate, month/release-bound
 // owner approval. Legacy policies and unapproved monthly policies keep their floors.
 const release=policy.reserveRelease;
 const reserveReleased=policy.policyVersion===2&&release?.ownerApproved===true&&release.reviewedBy===policy.reviewedBy&&release.period===policy.period&&release.releaseSha===policy.releaseSha&&Number.isSafeInteger(release.approvedAt)&&release.approvedAt>=0&&release.approvedAt<=now&&new Date(release.approvedAt).toISOString().slice(0,7)===policy.period;
 if(!Number.isSafeInteger(policy.reserveMinutes)||policy.reserveMinutes<(policy.policyVersion===2?(reserveReleased?0:600):300)||!Number.isSafeInteger(policy.cycleMinutes)||policy.cycleMinutes<5||policy.cycleMinutes>10)return denied('reserve_unverified');
 return {allowed:true};
}
export function quotaDecision(usage,policy,now=Date.now()){
 const denied=reason=>({allowed:false,reason}),validation=policyDecision(policy,now);if(!validation.allowed)return validation;
 if(!usage||!Array.isArray(usage.usageItems)||usage.usageItems.length>10000)return denied('usage_unavailable');
 let used=0,actionsRows=0;const month=new Date(now).toISOString().slice(0,7);
 for(const item of usage.usageItems){
  if(!item||typeof item.product!=='string'||!item.product||typeof item.date!=='string'||!Number.isFinite(Date.parse(item.date))||!item.date.startsWith(month)||!Number.isFinite(item.quantity)||item.quantity<0)return denied('usage_unsupported_or_charged');
  if(!isActionsProduct(item.product))continue;
  const weights=ACTIONS_MINUTE_WEIGHTS;
  if(typeof item.date!=='string'||!item.date.startsWith(month)||!isMinutesUnit(item.unitType)||!Number.isFinite(item.quantity)||item.quantity<0||!Number.isFinite(item.netAmount)||item.netAmount!==0||!Object.hasOwn(weights,item.sku))return denied('usage_unsupported_or_charged');
  // Round each account usage row up; retain the larger allowance reservation.
  used+=Math.ceil(item.quantity)*weights[item.sku];
  actionsRows++;
 }
 if(actionsRows===0)return denied('usage_unavailable');
 const remaining=policy.includedMinutes-used-policy.reserveMinutes;
 return {allowed:remaining>=policy.cycleMinutes,reason:remaining>=policy.cycleMinutes?'quota_reserved':'quota_insufficient',usedMinutes:used,reservedMinutes:policy.reserveMinutes,remainingMinutes:remaining,cycleMinutes:policy.cycleMinutes};
}
export async function readRunnerQuota({token,policy,transport=fetch,now=Date.now()}){
 const validation=policyDecision(policy,now);if(!validation.allowed)return validation;
 try{
  const d=new Date(now),usage=await githubJSON('/users/johntroger/settings/billing/usage?year='+d.getUTCFullYear()+'&month='+(d.getUTCMonth()+1),token,transport);
  return quotaDecision(usage,policy,now);
 }catch{return {allowed:false,reason:'usage_unavailable'};}
}
