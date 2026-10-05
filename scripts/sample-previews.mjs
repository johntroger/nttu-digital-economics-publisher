import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateSamples} from '../src/domain/samples.ts';
import {composeCaption,FOOTER_VERSION} from '../src/domain/footer.ts';

const digest=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
export function loadSamplePreviews(readAsset=read){
  const input=readAsset('content/samples-2026-v1.json'),batch=validateSamples(JSON.parse(input));
  const manifest=JSON.parse(readAsset('content/samples-2026-v1.manifest.json'));
  if(manifest.version!==batch.version||manifest.input_sha256!==digest(input))throw new Error('SAMPLE_METADATA_CHANGED');
  for(const source of Object.values(manifest.registry)){
    // Registry is build output, and paths are restricted even before reading.
    if(source.path&&(!/^assets\/sources\/(career|program)\/[^/\\]+\.pdf$/.test(source.path)||digest(readAsset(source.path))!==source.sha256))throw new Error('SAMPLE_SOURCE_CHANGED');
  }
  for(const logo of manifest.renderInputs.logos)if(!['nttu.png','fba.png','digital-economics.jpg'].includes(logo.file)||digest(readAsset('assets/brand/originals/'+logo.file))!==logo.sha256)throw new Error('SAMPLE_LOGO_CHANGED');
  for(const font of manifest.renderInputs.fonts)if(!['BricolageGrotesque-Bold.ttf','WorkSans-Bold.ttf','WorkSans-Regular.ttf'].includes(font.name)||digest(readAsset('assets/fonts/'+font.name))!==font.sha256)throw new Error('SAMPLE_FONT_CHANGED');
  if(digest(readAsset('scripts/render-samples.py'))!==manifest.renderInputs.renderer_sha256)throw new Error('SAMPLE_RENDERER_CHANGED');
  return batch.samples.map(sample=>{
    const entry=manifest.samples.find(p=>p.id===sample.id),imagePath=`assets/samples/v1/${sample.id}.png`,image=readAsset(imagePath),caption=composeCaption(sample.body);
    if(!entry||entry.footer_version!==FOOTER_VERSION||entry.body_sha256!==digest(sample.body)
      || entry.caption_sha256!==digest(caption)||entry.image_sha256!==digest(image)||entry.ready!==false
      || entry.proof_sha256!==digest(readAsset(`assets/samples/v1/${sample.id}-360.png`))
      || readAsset(`content/samples/v1/${sample.id}.txt`).toString('utf8').trimEnd()!==caption
      || entry.local_checks!=='pass'||entry.owner_approval!=='pending'||entry.facebook_qa!=='not_run'
      || sample.source_refs.some((ref,index)=>!manifest.registry[ref.id]||entry.source_refs[index]?.sha256!==manifest.registry[ref.id].sha256)
      )throw new Error('SAMPLE_VERSION_CHANGED');
    return {key:sample.id,title:sample.title,caption,body:sample.body,imageUrl:`/samples/${sample.id}.png`,proofUrl:`/samples/${sample.id}-360.png`,
      template:sample.image.template,imageMode:sample.image.mode,readerOutcome:sample.reader_outcome,
      sources:sample.source_refs,localChecks:entry.local_checks,ownerApproval:entry.owner_approval,facebookQa:entry.facebook_qa,ready:false,
      imageChecksum:entry.image_sha256};
  });
}
