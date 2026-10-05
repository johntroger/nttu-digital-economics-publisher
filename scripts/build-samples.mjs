import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateSamples} from '../src/domain/samples.ts';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';

const digest=data=>createHash('sha256').update(data).digest('hex');
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const input=read('content/samples-2026-v1.json');
const batch=validateSamples(JSON.parse(input));
const rendered=JSON.parse(read('assets/samples/v1/render-report.json'));
const careers=JSON.parse(read('assets/sources/career/manifest.json'));
const registry=Object.fromEntries(careers.filter(s=>batch.samples.some(p=>p.source_refs.some(r=>r.id===s.id))).map(s=>[s.id,{path:s.project_path,sha256:s.sha256,pages:s.pages}]));
const program=JSON.parse(read('assets/sources/program/manifest.json'));
for(const id of ['BM03','BM11']){
  const source=program.find(s=>s.id===id);if(!source)throw new Error('PROGRAM_SOURCE_MISSING');
  registry[id]={path:source.path,sha256:source.sha256,pages:source.pages};
}
registry['OWNER-2026']={path:null,sha256:digest(JSON.stringify({cohort:2026,duration_years:3.5,confirmed:'2026-10-04'})),pages:0};
for(const source of Object.values(registry))if(source.path&&digest(read(source.path))!==source.sha256)throw new Error('SOURCE_CHANGED');
for(const sample of batch.samples)for(const ref of sample.source_refs)if(!registry[ref.id]||ref.pages.some(page=>page>registry[ref.id].pages))throw new Error('SOURCE_PAGE_OUT_OF_RANGE');
const now=new Date().toISOString();
if(Date.parse(batch.reviewed_at)>Date.parse(now))throw new Error('FUTURE_REVIEW');
mkdirSync(new URL('../content/samples/v1',import.meta.url),{recursive:true});
const entries=batch.samples.map(sample=>{
  const report=rendered.samples.find(s=>s.id===sample.id),png=read(`assets/samples/v1/${sample.id}.png`);
  if(!report||report.input_sha256!==digest(input)||report.sha256!==digest(png))throw new Error('RENDER_OUT_OF_SYNC');
  if(png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080||png.length>5242880)throw new Error('INVALID_PNG_SIZE');
  const proof=read(`assets/samples/v1/${sample.id}-360.png`);
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||proof.readUInt32BE(16)!==360||proof.readUInt32BE(20)!==360)throw new Error('INVALID_PNG');
  const caption=composeCaption(sample.body);
  writeFileSync(new URL(`../content/samples/v1/${sample.id}.txt`,import.meta.url),caption+'\n','utf8');
  return {id:sample.id,body_sha256:digest(sample.body),caption_sha256:digest(caption),image_sha256:digest(png),proof_sha256:digest(proof),
    source_refs:sample.source_refs.map(ref=>({...ref,sha256:registry[ref.id].sha256})),
    footer_version:FOOTER_VERSION,check_version:1,local_checks:'pass',owner_approval:'pending',facebook_qa:'not_run',ready:false};
});
const fontNames={title:'BricolageGrotesque-Bold.ttf',bold:'WorkSans-Bold.ttf',body:'WorkSans-Regular.ttf'};
const renderInputs={renderer_sha256:digest(read('scripts/render-samples.py')),logos:rendered.samples[0].logos,
  fonts:Object.entries(fontNames).map(([role,name])=>({name,sha256:rendered.samples[0].font_sha256[role]}))};
for(const font of renderInputs.fonts)if(digest(read('assets/fonts/'+font.name))!==font.sha256)throw new Error('FONT_CHANGED');
for(const logo of renderInputs.logos)if(digest(read('assets/brand/originals/'+logo.file))!==logo.sha256)throw new Error('LOGO_CHANGED');
writeFileSync(new URL('../content/samples-2026-v1.manifest.json',import.meta.url),JSON.stringify({version:batch.version,input_sha256:digest(input),built_at:now,renderer:rendered.renderer,renderInputs,registry,samples:entries},null,2)+'\n');
console.log(`Built ${entries.length} captions + pinned source/image/metadata manifest. Pending owner review; 0 ready.`);
