// Test harness only: fixtures are not the real content warehouse or real fanpages.
import {workflowFixture} from '../tests/helpers/workflow-fixture.mjs';
import {runLocalTick} from '../src/workflow/local-runner.ts';
import {FakePublisher} from '../src/workflow/fake-adapter.ts';
const scenarios=[
  {name:'one-post-per-day',results:['confirmed'],times:['2026-10-05T02:59:59Z','2026-10-05T03:00:00Z','2026-10-05T04:00:00Z']},
  {name:'three-attempts-then-reserve',results:['retryable','retryable','retryable','confirmed'],times:['2026-10-05T03:00:00Z','2026-10-05T03:05:00Z','2026-10-05T03:10:00Z']},
  {name:'unknown-does-not-repost',results:['throw','confirmed'],times:['2026-10-05T03:00:00Z','2026-10-06T03:00:00Z']},
];
const reports=[];
for(const scenario of scenarios){
  const f=workflowFixture(),publisher=new FakePublisher(scenario.results),timeline=[];
  try{
    for(const now of scenario.times){f.setNow(now);timeline.push({now,...await runLocalTick(f.tx,publisher,{page:'prod',now:f.now,id:f.id})});}
    reports.push({scenario:scenario.name,timeline,fakeRequests:publisher.requests.length,
      publications:f.db.prepare('SELECT count(*) n FROM publications').get().n,
      usedPostIds:f.db.prepare('SELECT post_id FROM production_post_usage ORDER BY post_id').all().map(r=>r.post_id),
      outbox:f.db.prepare('SELECT event_id,state FROM notification_outbox ORDER BY event_id').all().map(r=>({...r}))});
  }finally{f.db.close();}
}
console.log(JSON.stringify({mode:'local_fake',networkCalls:0,realContentUsed:false,clock:'controlled fixture clock',reports},null,2));
