import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { transactionStore } from '../../scripts/transaction-store.mjs';
import { claimJob, recordIntent, beginMaintenance } from '../../src/storage/claims.ts';
import { finalizeEvidence } from '../../src/storage/evidence.ts';
const db=new DatabaseSync(workerData.path);
db.exec('PRAGMA foreign_keys=ON');
const tx=transactionStore(db), barrier=new Int32Array(workerData.barrier);
parentPort.postMessage({ ready:true });
Atomics.wait(barrier,0,0);
try {
  const action={ claim:claimJob, intent:recordIntent, maintenance:beginMaintenance,finalize:finalizeEvidence }[workerData.action];
  parentPort.postMessage({ ok:true, result:action(tx,workerData.input) });
} catch(error) { parentPort.postMessage({ ok:false, code:error.code ?? error.message }); }
finally { db.close(); }
