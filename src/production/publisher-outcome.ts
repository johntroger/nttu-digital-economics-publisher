// A rejected request is retryable only when the provider explicitly reports it.
// Ambiguous failures never authorize another POST. This module has no transport.
export function publicationFailure(status:number,code?:number):{kind:'retryable'|'policy'|'global'|'unknown'}{
 if(!Number.isInteger(status)||![400,401,403,429].includes(status)||!Number.isInteger(code)||!code||code<1)return {kind:'unknown'};
 if([190,10,200].includes(code))return {kind:'global'};
 if(status===429||[4,17,32,613].includes(code))return {kind:'retryable'};
 return {kind:'policy'};
}
