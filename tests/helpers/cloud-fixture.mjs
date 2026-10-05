import { readFileSync,readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { prepareCloud } from '../../scripts/cloud-prepare.mjs';
export function cloudFixture() {
  const {directory}=prepareCloud({output:'tmp/tests/storage-'+crypto.randomUUID()});
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(directory+'/migrations').sort())db.exec(readFileSync(directory+'/migrations/'+file,'utf8'));
  const objects=new Map(),controls={failPut:false,failRead:false,corrupt:false};
  const env={APP_ENV:'staging',INTEGRATION_MODE:'unconfigured',DB:{
    prepare(sql){let values=[];return{bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)??null;},async all(){return{results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);},execute(){const stmt=db.prepare(sql);return stmt.columns().length?{results:stmt.all(...values)}:stmt.run(...values);}};},
    async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},
  },MEDIA:{
    async put(key,bytes){if(controls.failPut)throw Error('fixture put failure');if(objects.has(key))return null;objects.set(key,new Uint8Array(bytes));return{};},
    async get(key){if(controls.failRead)throw Error('fixture read failure');const bytes=objects.get(key);if(!bytes)return null;const value=controls.corrupt?new Uint8Array(bytes).fill(0):bytes;return{size:value.length,async arrayBuffer(){return new Uint8Array(value).buffer;}};},
  }};
  return{db,env,objects,controls};
}
