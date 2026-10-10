// Node provider verification between two fresh status reads. Call with a
// monitor-only client: no heartbeat, stock, grant or publish operation here.
export async function monitorRunner(client,{expectedRelease,now=Date.now()}={}){
 const before=await client.call('/runner/status'),proof=await client.provider.verify(before.serverNow),after=await client.call('/runner/status');
 const codes=[];
 if(before.release!==expectedRelease||after.release!==expectedRelease)codes.push('release');
 if(after.generation!==before.generation||after.revision!==before.revision)codes.push('state_changed');
 if(!proof.verified)codes.push('meta');
 const expiries=[proof.expiresAt,proof.dataAccessExpiresAt].filter(x=>x!=null);
 if(expiries.some(x=>!Number.isSafeInteger(x)||x<=now))codes.push('meta_expired');
 else if(expiries.some(x=>x<=now+3*86400000))codes.push('meta_expiring');
 if(['requested','unknown'].includes(after.state)||after.counts?.unknown>0)codes.push('unknown');
 return {state:after.state,paused:after.paused,enabled:after.enabled,revision:after.revision,generation:after.generation,counts:after.counts,connectionVerified:proof.verified,codes};
}
