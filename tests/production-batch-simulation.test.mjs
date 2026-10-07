import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {productionWarehouseFixture} from './helpers/production-warehouse-fixture.mjs';
import {productionPublisherFixture} from './helpers/production-publisher-fixture.mjs';
import {productionPreview} from '../src/production/preview.ts';
import {readCatalog} from '../src/storage/catalog.ts';
import {FakeProductionPublisher,runProductionSimulation} from '../src/production/publisher-simulation.ts';
import {FOOTER_VERSION} from '../src/domain/footer.ts';
test('Thirty server-date ticks of the actual approved batch consume thirty isolated mains and preserve ten reserves',async()=>{
 const warehouse=productionWarehouseFixture(),f=productionPublisherFixture({mains:0,reserves:0,start:'2026-10-08'});
 try{
  const preview=await productionPreview(warehouse.env,'2026-10-08',Date.parse('2026-10-07T10:00:00Z'));assert.equal(preview.valid,40);
  const catalog=readCatalog({all:(sql,...args)=>warehouse.db.prepare(sql).all(...args)});
  for(const p of catalog){const receipt=[...preview.calendar,...preview.reserves].find(r=>r.postId===p.postId);assert.ok(receipt.approvalValid);
   p.status='ready';p.check={checkVersion:p.checkVersion,checksum:p.asset.checksum,footerVersion:FOOTER_VERSION,checkedAt:'2026-10-07T03:00:00Z',passed:true};
   // Explicit projection of approved bytes into isolated fixtures; never updates production readiness.
   f.add(p);
  }
  let queries=0;const raw=f.env.DB.prepare;f.env.DB.prepare=sql=>{queries++;return raw(sql);};
  const publisher=new FakeProductionPublisher(async r=>({kind:'confirmed',remoteId:'fixture:'+r.attemptId,confirmedAt:f.now()})),counts=[];
  for(const day of preview.calendar){f.setNow(day.publishAt);queries=0;const result=await runProductionSimulation(f.env,{publisher,now:f.now});assert.equal(result.status,'confirmed',day.key);counts.push(queries);assert.ok(queries<=40,'query budget: '+queries);assert.equal((await runProductionSimulation(f.env,{publisher,now:f.now})).status,'day_complete');}
  assert.equal(publisher.calls.length,30);assert.equal(f.db.prepare('SELECT count(*) n FROM production_fixture_usage').get().n,30);
  assert.equal(f.db.prepare("SELECT count(*) n FROM production_fixture_usage u JOIN production_fixture_posts p ON p.id=u.post WHERE json_extract(p.payload,'$.pool')='reserve'").get().n,0);
  for(const t of ['publications','schedule_slots','publish_jobs'])assert.equal(warehouse.db.prepare('SELECT count(*) n FROM '+t).get().n,0);
  mkdirSync('tmp/step36',{recursive:true});writeFileSync('tmp/step36/batch-simulation.json',JSON.stringify({mode:'isolated SQLite/D1 adapter',actualApprovedBatch:true,realMetaOutbound:0,fakeRequests:publisher.calls.length,confirmed:30,reservesConsumed:0,maxQueriesPerTick:Math.max(...counts),queryCounts:counts,productionPublications:0,realPublication:'NOT_RUN'},null,2));
 }finally{warehouse.db.close();f.db.close();}
});
