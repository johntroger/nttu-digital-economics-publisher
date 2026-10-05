import {openCatalog} from '../../scripts/catalog-store.mjs';
import {transactionStore} from '../../scripts/transaction-store.mjs';
import {seedReady} from './claims-fixture.mjs';
import {enableSimulation,configureSimulationSchedule} from '../../src/workflow/local-runner.ts';
export function workflowFixture({mains=2,reserves=2,configure=true,path=':memory:'}={}){
  const db=openCatalog(path),tx=transactionStore(db);
  db.exec("INSERT INTO page_connections VALUES ('prod','production','fixture:production','LOCAL SIMULATION')");
  const add=(id,pool,order,group='D')=>{
    db.prepare('INSERT INTO posts VALUES (?,\'fixture\',?,?,?,\'2026-10-04T00:00:00Z\')').run(id,id,group,pool);
    seedReady(db,{post:id,version:`${id}-v1`,asset:`image-${id}`});
    db.prepare('UPDATE content_entries SET stable_order=? WHERE post_id=?').run(order,id);
  };
  for(let i=1;i<=mains;i++)add(`p${i}`,'scheduled',i);
  for(let i=1;i<=reserves;i++)add(`r${i}`,'reserve',mains+i);
  db.exec("UPDATE application_state SET paused_by_user=0 WHERE environment='production'");
  enableSimulation(tx);if(configure)configureSimulationSchedule(tx,{page:'prod',startDate:'2026-10-05'});
  let value='2026-10-05T03:00:00Z',counter=0;
  return {db,tx,add,setNow:v=>value=v,now:()=>value,id:()=>`fixture-${++counter}`};
}
