import {png,pdf} from './files.mjs';
import {uploadFile,checksum} from '../../src/cloud/storage.ts';
import {cloudCatalog,cloudPost,saveCloudCaption} from '../../src/cloud/catalog.ts';
import {createCloudReview,REVIEW_KEYS} from '../../src/cloud/review.ts';
import {metaFingerprint} from '../../src/cloud/meta.ts';
import {POLICY} from '../../src/domain/policy.ts';
import {TRIAL_PAGE} from '../../src/cloud/meta-trial.ts';
const owner={email:POLICY.ownerEmail,sub:'fixture',csrf:''};
export async function seedDailyFixture(f){Object.assign(f.env,{META_APP_ID:'123456789012345',META_APP_SECRET:'s'.repeat(40),META_PAGE_ID:TRIAL_PAGE,META_PAGE_ACCESS_TOKEN:'t'.repeat(80),META_API_VERSION:'v26.0',META_CONNECTION_PURPOSE:'test',DAILY_PUBLISHING_ENABLED:'true'});
 const registry=[{id:'CAREER-01',name:'Fixture',pages:2,sha256:await checksum(pdf),authority:'document'}],ref={id:'CAREER-01',pages:[1],section:'Fixture',supports:'Căn cứ tài liệu.',adaptation:'Bài tập sinh viên.'};
 await uploadFile(f.env,owner,{kind:'document',filename:'Fixture.pdf',contentType:'application/pdf',sourceKey:'CAREER-01'},pdf);
 const image=await uploadFile(f.env,owner,{kind:'image',filename:'Fixture.png',contentType:'image/png'},png());
 const posts=(await cloudCatalog(f.env)).posts.filter(p=>p.group!=='I').slice(0,3);
 for(const [i,p] of posts.entries()){await saveCloudCaption(f.env,owner,p.id,{expectedVersion:p.versionId,requestId:crypto.randomUUID(),title:p.title,body:'Nội dung fixture '+i,sourceNote:'Đã đối chiếu.',sourceRefs:[ref]},false,undefined,registry);const v=await cloudPost(f.env,p.id);await saveCloudCaption(f.env,owner,p.id,{expectedVersion:v.versionId,requestId:crypto.randomUUID(),title:v.title,body:v.body,sourceNote:v.sourceNote},false,image.file.id,registry);const review=createCloudReview(f.env,registry),a=await review.auditPost(p.id);await review.reviewPost(p.id,owner,{requestId:crypto.randomUUID(),expectedVersion:a.versionId,expectedCheck:a.checkVersion,rubric:Object.fromEntries(REVIEW_KEYS.map(k=>[k,true]))});if(i)await f.env.DB.prepare("UPDATE posts SET pool='reserve' WHERE id=?").bind(p.id).run();}
 await f.env.DB.batch([f.env.DB.prepare("INSERT INTO page_connections VALUES('daily','staging',?,'Tập Viết')").bind(TRIAL_PAGE),f.env.DB.prepare("INSERT INTO page_publish_gates(page_connection_id) VALUES('daily')"),f.env.DB.prepare("INSERT INTO schedule_slots(id,page_connection_id,business_date,planned_post_id) VALUES('slot','daily','2026-10-07',?)").bind(posts[0].id),f.env.DB.prepare("UPDATE application_state SET paused_by_user=0 WHERE environment='staging'"),f.env.DB.prepare("UPDATE cloud_daily_config SET enabled=1,start_date='2026-10-07',page_connection_id='daily',config_hash=? WHERE id=1").bind(await metaFingerprint(f.env))]);
 return {...f,registry,posts};
}
