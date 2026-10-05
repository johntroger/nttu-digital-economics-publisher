import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {validateSamples,SAMPLE_IDS} from '../src/domain/samples.ts';
import {FOOTER,CAPTION_SEPARATOR,composeCaption} from '../src/domain/footer.ts';
import {loadSamplePreviews} from '../scripts/sample-previews.mjs';
import {createLocalServer} from '../scripts/dev.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const input=()=>JSON.parse(read('content/samples-2026-v1.json'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

test('five real samples retain their identities and both illustration modes',()=>{
  const batch=validateSamples(input());assert.deepEqual(batch.samples.map(s=>s.id),SAMPLE_IDS);
  assert.deepEqual(new Set(batch.samples.map(s=>s.image.template)),new Set(['checklist','scene','flow']));
  assert.deepEqual(new Set(batch.samples.map(s=>s.image.mode)),new Set(['infographic','illustration']));
  for(const sample of batch.samples){
    const caption=composeCaption(sample.body);assert.equal(caption.split(FOOTER).length-1,1);assert.ok(caption.endsWith(FOOTER));
    assert.equal(caption.split(CAPTION_SEPARATOR).length-1,1);assert.ok(caption.includes(`\n\n${CAPTION_SEPARATOR}\n\n${FOOTER}`));
    assert.match(sample.body,/giả định/);assert.ok(sample.source_refs.every(r=>r.supports&&r.adaptation));
  }
});

test('invalid cohort, duration, status, duplicate identities and stale footer fail validation',()=>{
  const mutations=[b=>b.cohort=2025,b=>b.duration_years=4,b=>b.status='ready',b=>b.samples[1].id=b.samples[0].id,
    b=>b.samples[0].body+='\n'+FOOTER,b=>b.samples[0].source_refs[0].pages=[],b=>b.samples[0].image.mode='illustration',
    b=>b.samples[0].image.accent='blue',b=>b.samples[0].image.template='unknown',b=>b.samples[0].image.cards.pop()];
  for(const mutate of mutations){const batch=input();mutate(batch);assert.throws(()=>validateSamples(batch));}
});

test('artifact previews verify source/image/caption versions and remain unready',()=>{
  const previews=loadSamplePreviews();assert.equal(previews.length,5);
  for(const sample of previews){
    assert.equal(sample.ready,false);assert.equal(sample.ownerApproval,'pending');assert.equal(sample.facebookQa,'not_run');
    const image=read(`assets/samples/v1/${sample.key}.png`);assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16),1080);assert.equal(image.readUInt32BE(20),1080);assert.ok(image.length<=5242880);
    assert.equal(hash(image),sample.imageChecksum);
  }
});

test('changed metadata, image, proof, caption, source, logo, font or renderer blocks preview',()=>{
  const mutations=[['content/samples-2026-v1.json',buffer=>Buffer.from(buffer.toString().replace('Cho thấy việc bạn đã làm.','Đã sửa câu này.'))],
    ['assets/samples/v1/P02.png',()=>Buffer.from('changed image')],['assets/samples/v1/P02-360.png',()=>Buffer.from('changed proof')],
    ['content/samples/v1/P02.txt',()=>Buffer.from('changed caption')],
    ['assets/sources/career/Cam-nang-nghe-Ung-dung-AI-cho-Sinh-vien-Nganh-Kinh-te-so_NTTU.pdf',()=>Buffer.from('changed source')],
    ['assets/brand/originals/nttu.png',()=>Buffer.from('changed logo')],['assets/fonts/WorkSans-Regular.ttf',()=>Buffer.from('changed font')],
    ['scripts/render-samples.py',()=>Buffer.from('changed renderer')]];
  for(const [path,mutate] of mutations)assert.throws(()=>loadSamplePreviews(p=>p===path?mutate(read(p)):read(p)),/SAMPLE_/);
});

test('preview HTTP serves only five known images, never mutates readiness or publishes',async()=>{
  const server=createLocalServer();server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(base+'/local-api/samples');assert.equal(response.status,200);assert.equal((await response.json()).samples.length,5);
    for(const id of SAMPLE_IDS){
      const r=await fetch(`${base}/samples/${id}.png`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
      assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(read(`assets/samples/v1/${id}.png`)));
    }
    for(const path of ['/samples/P01.png','/samples/render-report.json','/assets/sources/program/BM03.pdf','/samples/P02.txt'])assert.equal((await fetch(base+path)).status,404);
    const catalog=await (await fetch(base+'/local-api/catalog')).json();assert.equal(catalog.posts.length,40);assert.equal(catalog.stock.eligible_distinct_post_count,0);assert.deepEqual(catalog.publications,[]);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
