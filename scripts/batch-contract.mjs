import {createHash} from 'node:crypto';
import {composeCaption} from '../src/domain/footer.ts';
import {normalizedBody} from '../src/domain/content.ts';
import {SOURCE_REGISTRY} from '../src/cloud/source-registry.ts';
export const batchHash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw new Error('BATCH_'+code);};
export function validateBatch(batch,approval) {
 if(batch?.version!=='batch-2026-v1'||batch.cohort!==2026||batch.duration_years!==3.5||batch.status!=='awaiting_owner_batch_review'
   ||batch.schedule_enabled!==false||batch.start_date!==null||batch.publish_time!=='10:00'||batch.timezone!=='Asia/Ho_Chi_Minh'
   ||!Array.isArray(batch.posts)||batch.posts.length!==40)fail('CONTRACT');
 const seen=new Set(),bodies=new Set(),titles=new Set();
 for(const p of batch.posts){
  if(!p||typeof p.id!=='string'||!/^P(?:0[1-9]|[12][0-9]|30)$|^R(?:0[1-9]|10)$/.test(p.id)||seen.has(p.id))fail('IDENTITY');seen.add(p.id);
  if(!['D','A','B','S','R','I'].includes(p.group)||!['SV','HS'].includes(p.audience)||!Array.isArray(p.prerequisites)||p.prerequisites.length)fail('METADATA');
  if(p.pool!==(p.id.startsWith('P')?'main':'reserve')||p.slot!==(p.pool==='main'?Number(p.id.slice(1)):null))fail('POOL');
  if(!['body','title','reader_outcome'].every(k=>typeof p[k]==='string'&&p[k].trim())||p.body.length<500||p.body.length>4500)fail('CONTENT');
  composeCaption(p.body);
  if(bodies.has(normalizedBody(p.body))||titles.has(p.title.normalize('NFKC').toLowerCase()))fail('DUPLICATE');
  bodies.add(normalizedBody(p.body));titles.add(p.title.normalize('NFKC').toLowerCase());
  if(!Array.isArray(p.source_refs)||!p.source_refs.length)fail('SOURCE');
  for(const ref of p.source_refs){
   const source=SOURCE_REGISTRY.find(s=>s.id===ref.id);
   if(!source||!Array.isArray(ref.pages)||new Set(ref.pages).size!==ref.pages.length||ref.pages.some(n=>!Number.isInteger(n)||n<1||n>source.pages)
    ||(source.authority==='document'?!ref.pages.length:ref.pages.length!==0)||!['section','supports','adaptation'].every(k=>typeof ref[k]==='string'&&ref[k].trim()))fail('SOURCE');
  }
  if(!p.source_refs.some(r=>r.id!=='OWNER-2026'))fail('SOURCE');
  if(p.group==='I'&&(!p.source_refs.some(r=>r.id.startsWith('BM'))||!p.source_refs.some(r=>r.id==='OWNER-2026')))fail('PROGRAM_AUTHORITY');
  const im=p.image;
  if(!im||!['headline','subline','takeaway'].every(k=>typeof im[k]==='string'&&im[k].trim())||!['accent','paper','ink'].every(k=>/^#[0-9a-f]{6}$/i.test(im[k]))||!Array.isArray(im.cards))fail('IMAGE');
  if(im.template==='scene'){
   if(im.mode!=='illustration'||im.cards.length||!['portfolio','bridge','operations'].includes(im.scene))fail('IMAGE');
  }else if(!['flow','checklist'].includes(im.template)||im.mode!=='infographic'||im.scene!==null||im.cards.length!==(im.template==='flow'?3:4)||im.cards.some(c=>!Array.isArray(c)||c.length!==2||c.some(t=>typeof t!=='string'||!t.trim())))fail('IMAGE');
  const record=approval?.samples?.find(s=>s.id===p.id);
  if(p.editorial_status==='owner_approved'){
   if(!record||approval.scope!=='content_and_design_only'||record.content_approved!==true||record.design_approved!==true
     ||record.body_sha256!==batchHash(p.body)||record.caption_sha256!==batchHash(composeCaption(p.body)))fail('APPROVAL_CHANGED');
  }else if(p.editorial_status!=='awaiting_owner_review'||record)fail('APPROVAL_CHANGED');
 }
 const main=batch.posts.filter(p=>p.pool==='main'),reserve=batch.posts.filter(p=>p.pool==='reserve');
 if(main.length!==30||reserve.length!==10||main.filter(p=>p.audience==='SV').length!==21||reserve.filter(p=>p.audience==='SV').length!==7)fail('BALANCE');
 if(batch.posts.filter(p=>p.image.mode==='infographic').length!==20)fail('BALANCE');
 if(new Set(main.map(p=>p.group)).size!==6||new Set(reserve.map(p=>p.group)).size!==6)fail('RESERVE_COVERAGE');
 if(batch.posts.filter(p=>p.editorial_status==='owner_approved').length!==3)fail('APPROVAL_CHANGED');
 return batch;
}
export function similarityPairs(posts){
 // Word bigrams in the body, excluding branding and the headline. A review aid, not semantic proof.
 const grams=posts.map(p=>{const words=normalizedBody(p.body.split('\n\n').slice(1).join('\n\n')).replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/u).filter(Boolean);return new Set(words.slice(1).map((w,i)=>words[i]+' '+w));});
 const pairs=[];
 for(let i=0;i<posts.length;i++)for(let j=i+1;j<posts.length;j++){
  const overlap=[...grams[i]].filter(g=>grams[j].has(g)).length;
  pairs.push({ids:[posts[i].id,posts[j].id],score:overlap/(grams[i].size+grams[j].size-overlap)});
 }
 return pairs.sort((a,b)=>b.score-a.score);
}
