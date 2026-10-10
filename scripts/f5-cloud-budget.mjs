// Acceptance load shares the Free account with production. A fresh account
// usage receipt is required; cycle reservations persist across candidate releases.
export const F5_ACCOUNT='4d46e32e5c27ff522ee857308a53e729';
const MAX_CYCLES=50,MAX_READS=3000000,MAX_WRITES=50000;
export function assertF5Usage(receipt,now=Date.now()){
 const date=new Date(now).toISOString().slice(0,10);
 if(!receipt||receipt.accountId!==F5_ACCOUNT||receipt.source!=='cloudflare-account-usage'||receipt.utcDate!==date
  ||!Number.isSafeInteger(receipt.capturedAt)||receipt.capturedAt>now||now-receipt.capturedAt>300000
  ||!Number.isSafeInteger(receipt.rowsRead)||receipt.rowsRead<0||!Number.isSafeInteger(receipt.rowsWritten)||receipt.rowsWritten<0)throw Error('F5 fresh account usage receipt required');
 if(receipt.rowsRead>=MAX_READS||receipt.rowsWritten>=MAX_WRITES)throw Error('F5 cloud load blocked: preserve D1 quota for operations');
 return date;
}
export function reserveF5Cycles(receipt,ledger,now=Date.now()){
 const utcDate=assertF5Usage(receipt,now);
 if(ledger&&(!/^\d{4}-\d{2}-\d{2}$/.test(ledger.utcDate)||!Number.isSafeInteger(ledger.reservedCycles)||ledger.reservedCycles<0||ledger.reservedCycles>MAX_CYCLES))throw Error('F5 cycle ledger invalid');
 const used=ledger?.utcDate===utcDate?ledger.reservedCycles:0,cycles=MAX_CYCLES-used;
 if(cycles<1)throw Error('F5 daily measurement cycle budget exhausted');
 return {cycles,ledger:{utcDate,reservedCycles:used+cycles}};
}
