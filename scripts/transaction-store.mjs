// Local SQLite adapter only. D1 transaction implementation must be separately verified.
export function transactionStore(db) {
  db.exec('PRAGMA busy_timeout=5000');
  return {
    all: (sql,...parameters) => db.prepare(sql).all(...parameters),
    run: (sql,...parameters) => Number(db.prepare(sql).run(...parameters).changes),
    immediate: work => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result=work();
        if (result && typeof result.then === 'function') throw new Error('No asynchronous/network work inside transaction');
        db.exec('COMMIT'); return result;
      } catch(error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
