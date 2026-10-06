import {cloudFixture} from './cloud-fixture.mjs';
import {WORKFLOW_FIXTURE_SCHEMA} from '../../src/cloud/workflow-fixture-schema.ts';
import {workflowFixture} from './workflow-fixture.mjs';
import {readCatalog} from '../../src/storage/catalog.ts';
export function cloudWorkflowFixture({mains=2,reserves=2,paused=false,start='2026-10-05'}={}){
  const f=cloudFixture();f.db.exec(WORKFLOW_FIXTURE_SCHEMA);
  f.db.prepare("INSERT INTO fixture_flow_config(id,identity,target,start_date,paused) VALUES(1,'isolated-d1-fixture','fixture:page',?,?)").run(start,Number(paused));
  const local=workflowFixture({mains,reserves});
  const posts=readCatalog(local.tx);local.db.close();
  const add=p=>f.db.prepare('INSERT INTO fixture_flow_posts(id,payload) VALUES (?,?)').run(p.postId,JSON.stringify(p));
  for(const p of posts)add(p);
  if(start)for(const [i,p] of posts.filter(p=>p.pool==='scheduled').sort((a,b)=>a.order-b.order).entries()){
    const day=new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
    f.db.prepare('INSERT INTO fixture_flow_slots(day,planned) VALUES (?,?)').run(day,p.postId);
  }
  Object.assign(f.env,{APP_ENV:'test',INTEGRATION_MODE:'fake'});
  let now=Date.parse('2026-10-05T03:00:00Z');
  return {...f,posts,add,now:()=>now,setNow:n=>{now=typeof n==='string'?Date.parse(n):n;},change(id,patch){const p=JSON.parse(f.db.prepare('SELECT payload FROM fixture_flow_posts WHERE id=?').get(id).payload);Object.assign(p,patch);f.db.prepare('UPDATE fixture_flow_posts SET payload=?,revision=revision+1 WHERE id=?').run(JSON.stringify(p),id);}};
}
