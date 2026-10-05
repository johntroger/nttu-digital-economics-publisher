import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {openCatalog,importBriefs,reader} from './catalog-store.mjs';
import {readCatalog} from '../src/storage/catalog.ts';
import {eligibility,stock} from '../src/domain/content.ts';
import {FOOTER,FOOTER_VERSION,CAPTION_SEPARATOR} from '../src/domain/footer.ts';
import {POLICY} from '../src/domain/policy.ts';
import {workflowFixture} from '../tests/helpers/workflow-fixture.mjs';
import {FakePublisher} from '../src/workflow/fake-adapter.ts';
import {runLocalTick} from '../src/workflow/local-runner.ts';

export const DEMOS=Object.freeze({
  success:{label:'Một bài trong ngày',results:['confirmed'],times:['2026-10-05T02:59:59Z','2026-10-05T03:00:00Z','2026-10-05T04:00:00Z']},
  reserve:{label:'Thử lại rồi lấy dự phòng',results:['retryable','retryable','retryable','confirmed'],times:['2026-10-05T03:00:00Z','2026-10-05T03:05:00Z','2026-10-05T03:10:00Z']},
  unknown:{label:'Chờ xác minh khi timeout',results:['throw','confirmed'],times:['2026-10-05T03:00:00Z','2026-10-06T03:00:00Z']},
});
export function catalogModel(editor=null){
  const db=editor?.db??openCatalog();
  try{
    const input=JSON.parse(readFileSync(editor?join(editor.backupContext.resourceDirectory,'content/content-plan-40.json'):new URL('../content/content-plan-40.json',import.meta.url),'utf8'));
    importBriefs(db,input);
    const catalog=readCatalog(reader(db)),now=new Date().toISOString();
    const context={now,footerVersion:FOOTER_VERSION,cohort:2026,usedPostIds:new Set(),heldPostIds:new Set(),publishedPostIds:new Set(),recentAngles:new Set(),publishedBodies:new Set()};
    return {mode:'local',connected:false,stock:stock(catalog,context),footer:FOOTER,separator:CAPTION_SEPARATOR,editing:Boolean(editor),
      editorial:{captions:catalog.filter(p=>p.stage==='caption').length,images:catalog.filter(p=>p.asset).length,reviewed:editor?db.prepare('SELECT COUNT(*) n FROM editor_reviews r JOIN content_entries e ON e.active_version_id=r.version_id').get().n:0},
      settings:{publishTime:POLICY.publishTime,timeZone:POLICY.timeZone,cohort:2026,duration:3.5,googleConnected:false},
      posts:catalog.map(post=>{
        const brief=input.posts.find(p=>post.postId.endsWith(`:${p.id}`));
        const version=db.prepare('SELECT caption_title,version FROM post_versions WHERE id=?').get(post.versionId);
        return {id:post.postId,key:brief.id,title:version.caption_title,group:post.group,audience:post.audience,pool:post.pool,
          brief:brief.brief,imageBrief:brief.image_brief,level:brief.level,sourceHint:brief.source_start,reasons:eligibility(post,context),status:post.stage==='brief'?'brief':'caption',version:version.version,editable:Boolean(editor)};
      }),schedule:[],publications:[],notifications:[],
      demos:Object.entries(DEMOS).map(([id,d])=>({id,label:d.label})),
    };
  }finally{if(!editor)db.close();}
}
export async function demoModel(name){
  if(!Object.hasOwn(DEMOS,name))throw new Error('INVALID_DEMO');
  const scenario=DEMOS[name],f=workflowFixture(),publisher=new FakePublisher(scenario.results),timeline=[];
  try{
    for(const now of scenario.times){f.setNow(now);timeline.push({now,...await runLocalTick(f.tx,publisher,{page:'prod',now:f.now,id:f.id})});}
    const rows=sql=>f.db.prepare(sql).all().map(r=>({...r}));
    return {mode:'local_fake',scenario:name,label:scenario.label,requests:publisher.requests.length,timeline,
      schedule:rows(`SELECT s.business_date date,s.status,p.content_key postKey FROM schedule_slots s LEFT JOIN posts p ON p.id=s.planned_post_id ORDER BY s.business_date`),
      publications:rows(`SELECT p.id,v.post_id postKey,p.caption_snapshot caption,p.confirmed_at confirmedAt,p.remote_business_date date,p.remote_id remoteId FROM publications p JOIN publish_jobs j ON j.id=p.job_id JOIN post_versions v ON v.id=j.post_version_id ORDER BY p.confirmed_at`),
      notifications:rows('SELECT event_id id,state,payload_json payload FROM notification_outbox ORDER BY event_id').map(n=>({...n,payload:JSON.parse(n.payload)})),
    };
  }finally{f.db.close();}
}
