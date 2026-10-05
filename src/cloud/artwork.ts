import type {CloudBindings} from './runtime.ts';
import type {OwnerSession} from './auth.ts';
import {readStatus} from './runtime.ts';
import {CatalogError,saveCloudCaption} from './catalog.ts';
import {checksum,uploadFile,verifiedBytes,validateFile} from './storage.ts';
import {DESIGN_REGISTRY} from './design-registry.ts';
import {SOURCE_REGISTRY} from './source-registry.ts';
type Row=Record<string,unknown>;
type Registry=typeof DESIGN_REGISTRY;
async function rows(env:CloudBindings,sql:string,...values:(string|number)[]){return (await env.DB!.prepare(sql).bind(...values).all!<Row>()).results;}
export function contrast(a:string,b:string){const light=(s:string)=>{const rgb=[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]!*.2126+rgb[1]!*.7152+rgb[2]!*.0722;};const [x,y]=[light(a),light(b)].sort((a,b)=>a-b);return (y!+.05)/(x!+.05);}
export function validateDesign(value:unknown,registry:Registry=DESIGN_REGISTRY){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CatalogError('DESIGN_INVALID');
  const d=value as Record<string,unknown>;
  const field=(key:string,max:number,required=true)=>{const v=d[key];if(typeof v!=='string'||v.length>max||(/[\x00-\x1f\x7f]/.test(v))||(required&&!v.trim()))throw new CatalogError('DESIGN_INVALID');return v.trim().normalize('NFC');};
  const layout=field('layout',30),motif=field('motif',30),headline=field('headline',160),note=field('note',120,false);
  if(!['infographic','illustration'].includes(layout)||!['network','process','portfolio'].includes(motif))throw new CatalogError('DESIGN_INVALID');
  const paper=field('paper',7),ink=field('ink',7),accent=field('accent',7);
  if(![paper,ink,accent].every(c=>/^#[a-f0-9]{6}$/i.test(c)))throw new CatalogError('DESIGN_INVALID');
  if(contrast(ink,paper)<4.5||contrast(accent,paper)<4.5)throw new CatalogError('DESIGN_CONTRAST');
  if(!Array.isArray(d.points)||d.points.length!==(layout==='infographic'?3:0)||d.points.some(p=>typeof p!=='string'||!p.trim()||p.length>120||/[\x00-\x1f\x7f]/.test(p)))throw new CatalogError('DESIGN_INVALID');
  const points=(d.points as string[]).map(p=>p.trim().normalize('NFC'));
  for(const f of registry.fonts){for(const char of [headline,note,...points].join(''))if(!char.trim()||f.ranges.some(([a,b])=>char.codePointAt(0)!>=a!&&char.codePointAt(0)!<=b!))continue;else throw new CatalogError('DESIGN_GLYPH_MISSING');}
  return {layout,motif,headline,note,points,paper:paper.toUpperCase(),ink:ink.toUpperCase(),accent:accent.toUpperCase()};
}
export async function designResources(env:CloudBindings,verify=false,registry:Registry=DESIGN_REGISTRY){
  await readStatus(env);
  const library=await rows(env,"SELECT * FROM cloud_library WHERE kind='logo' AND state='complete'");
  const logos=[];
  for(const logo of registry.logos){const row=library.find(r=>r.checksum===logo.sha256);if(verify){if(!row)throw new CatalogError('DESIGN_LOGO_MISSING',409);await verifiedBytes(env,row);}logos.push({...logo,available:Boolean(row),url:row?'/api/library/files/'+row.id:null});}
  return {renderer:'canvas-square-v1',logos,fonts:registry.fonts.map(f=>({...f,url:'/fonts/'+f.name})),layouts:['infographic','illustration']};
}
export async function saveArtwork(env:CloudBindings,owner:OwnerSession,postId:string,metadata:unknown,bytes:Uint8Array,registry:Registry=DESIGN_REGISTRY){
  await readStatus(env);
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new CatalogError('DESIGN_INVALID');
  const m=metadata as Record<string,unknown>;
  if(typeof m.expectedVersion!=='string'||m.expectedVersion.length>300||typeof m.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(m.requestId))throw new CatalogError('INVALID_SAVE_REQUEST');
  const spec=validateDesign(m.spec,registry);
  validateFile({kind:'image',filename:'Ảnh.png',contentType:'image/png'},bytes);
  const parent=(await rows(env,'SELECT v.*,e.active_version_id FROM post_versions v JOIN content_entries e ON e.post_id=v.post_id WHERE v.id=? AND v.post_id=?',m.expectedVersion,postId))[0];
  if(!parent)throw new CatalogError('VERSION_CONFLICT',409);
  if(JSON.parse(String(parent.metadata_json)).isBrief)throw new CatalogError('SAVE_CAPTION_FIRST',409);
  const replay=(await rows(env,'SELECT request_id FROM editor_requests WHERE request_id=?',m.requestId))[0];
  if(!replay&&parent.active_version_id!==m.expectedVersion)throw new CatalogError('VERSION_CONFLICT',409);
  await designResources(env,true,registry);
  const imageHash=await checksum(bytes);
  const uploaded=await uploadFile(env,owner,{kind:'image',filename:'design-'+imageHash.slice(0,16)+'.png',contentType:'image/png'},bytes);
  const design={renderer:'canvas-square-v1',spec,imageChecksum:imageHash,logos:registry.logos.map(l=>({file:l.file,sha256:l.sha256})),fonts:registry.fonts.map(f=>({name:f.name,sha256:f.sha256}))};
  const result=await saveCloudCaption(env,owner,postId,{requestId:m.requestId,expectedVersion:m.expectedVersion,title:parent.caption_title,body:parent.body,sourceNote:JSON.parse(String(parent.metadata_json)).sourceNote??''},false,String(uploaded.file.id),SOURCE_REGISTRY,design);
  return {...result,libraryId:uploaded.file.id};
}
