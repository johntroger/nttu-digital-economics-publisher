import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBatch,similarityPairs} from '../scripts/batch-contract.mjs';
import {pathViolation} from '../scripts/check-repository.mjs';
const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
const batch=()=>read('content/batch-2026-v1.json');
const approval=()=>read('content/samples/step22-approval.json');
test('complete editorial warehouse has 30 independent main posts and 10 reserves, with 70/30 audience split',()=>{
 const b=validateBatch(batch(),approval());assert.equal(b.posts.length,40);
 assert.equal(b.posts.filter(p=>p.audience==='SV').length,28);
 assert.equal(b.posts.filter(p=>p.image.mode==='illustration').length,20);
 assert.equal(similarityPairs(b.posts).length,780);
 assert.equal(pathViolation('assets/batch/v1/P01.png'),true);
});
test('approved captions cannot be edited or approval transferred to an unreviewed post',()=>{
 const b=batch();b.posts.find(p=>p.id==='P02').body+=' Thêm câu mới.';
 assert.throws(()=>validateBatch(b,approval()),/APPROVAL_CHANGED/);
 const other=batch();other.posts.find(p=>p.id==='P01').editorial_status='owner_approved';
 assert.throws(()=>validateBatch(other,approval()),/APPROVAL_CHANGED/);
});
test('pack rejects duplicate caption, wrong source page, program without owner authority and reserve depending on another post',()=>{
 for(const mutate of [b=>{b.posts[2].body=b.posts[0].body;},b=>{b.posts[0].source_refs[0].pages=[999];},b=>{b.posts.find(p=>p.id==='P10').source_refs=b.posts.find(p=>p.id==='P10').source_refs.filter(r=>r.id!=='OWNER-2026');},b=>{b.posts[30].prerequisites=['P01'];}]){
  const b=batch();mutate(b);assert.throws(()=>validateBatch(b,approval()),/BATCH_/);
 }
});
test('artifact cannot start scheduling or invent pool membership or claim additional owner approvals',()=>{
 for(const mutate of [b=>{b.schedule_enabled=true;},b=>{b.posts[30].pool='main';},b=>{b.posts[31].slot=1;},b=>{b.posts[10].editorial_status='ready';}]){
  const b=batch();mutate(b);assert.throws(()=>validateBatch(b,approval()),/BATCH_/);
 }
});
