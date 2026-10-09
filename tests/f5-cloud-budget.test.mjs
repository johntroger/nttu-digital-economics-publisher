import test from 'node:test';
import assert from 'node:assert/strict';
import {F5_ACCOUNT,assertF5Usage,reserveF5Cycles} from '../scripts/f5-cloud-budget.mjs';
const now=Date.parse('2026-10-09T14:00:00Z');
const receipt={accountId:F5_ACCOUNT,source:'cloudflare-account-usage',utcDate:'2026-10-09',capturedAt:now,rowsRead:100000,rowsWritten:1000};
test('F5 cloud load stops at the account reserve threshold, including the 86 percent warning',()=>{
 for(const rowsRead of [3000000,4300000,5000000])assert.throws(()=>assertF5Usage({...receipt,rowsRead},now),/preserve D1 quota/);
 assert.throws(()=>assertF5Usage({...receipt,rowsWritten:50000},now),/preserve D1 quota/);
});
test('F5 a different release or another run cannot reset the daily test cycle allowance',()=>{
 const first=reserveF5Cycles(receipt,undefined,now);assert.equal(first.cycles,50);
 assert.throws(()=>reserveF5Cycles(receipt,first.ledger,now),/exhausted/);
 assert.equal(reserveF5Cycles(receipt,{utcDate:'2026-10-09',reservedCycles:42},now).cycles,8);
});
test('F5 midnight UTC needs a new verified usage receipt before another measurement',()=>{
 const tomorrow=Date.parse('2026-10-10T00:00:00Z');assert.throws(()=>reserveF5Cycles(receipt,{utcDate:'2026-10-09',reservedCycles:50},tomorrow),/fresh account usage/);
 const next={...receipt,utcDate:'2026-10-10',capturedAt:tomorrow};assert.equal(reserveF5Cycles(next,{utcDate:'2026-10-09',reservedCycles:50},tomorrow).cycles,50);
});
test('F5 missing, stale, future, malformed or other-account usage fails closed',()=>{
 for(const candidate of [null,{...receipt,capturedAt:now-300001},{...receipt,capturedAt:now+1},{...receipt,accountId:'another-account'},{...receipt,rowsRead:-1},{...receipt,rowsWritten:NaN}])assert.throws(()=>assertF5Usage(candidate,now),/fresh account usage/);
 assert.throws(()=>reserveF5Cycles(receipt,{utcDate:'2026-10-09',reservedCycles:-1},now),/ledger invalid/);
});
