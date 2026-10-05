import { composeCaption, FOOTER } from './footer.ts';
import type { EditorialSample, SampleReference } from './samples.ts';

export type ImageSpec = EditorialSample['image'];
export interface EditorDraft { title: string; body: string; sourceNote: string; image: ImageSpec; sourceRefs?: SampleReference[] }
export class EditorError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function editorFail(code: string): never { throw new EditorError(code); }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
export function validateEditorDraft(input: unknown): EditorDraft {
  if (!record(input) || !text(input.title,200) || !text(input.body,20000) || input.body.includes(FOOTER)
    || typeof input.sourceNote !== 'string' || input.sourceNote.length > 12000 || !record(input.image)) editorFail('INVALID_EDITOR_DRAFT');
  composeCaption(input.body);
  const image = input.image;
  if (!text(image.headline,240) || image.headline.split('\n').length > 2 || !text(image.subline,180) || !text(image.takeaway,180)
    || ![image.accent,image.ink,image.paper].every(c=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c))
    || !Array.isArray(image.cards) || image.cards.some(c=>!Array.isArray(c)||c.length!==2||!c.every(v=>text(v,180)))) editorFail('INVALID_IMAGE_SPEC');
  if (image.template === 'scene') {
    if (image.mode !== 'illustration' || !['portfolio','bridge','operations'].includes(String(image.scene)) || image.cards.length !== 0) editorFail('INVALID_IMAGE_SPEC');
  } else if (!['checklist','flow'].includes(String(image.template)) || image.mode !== 'infographic' || image.scene !== null
    || image.cards.length !== (image.template==='checklist'?4:3)) editorFail('INVALID_IMAGE_SPEC');
  const refs = input.sourceRefs === undefined ? undefined : validateEditorReferences(input.sourceRefs);
  return {title:input.title.trim(),body:input.body.trim(),sourceNote:input.sourceNote.trim(),image:JSON.parse(JSON.stringify(image)) as ImageSpec,...(refs===undefined?{}:{sourceRefs:refs})};
}

export function validateEditorReferences(input: unknown): SampleReference[] {
  if (!Array.isArray(input) || input.length > 12) editorFail('INVALID_SOURCE_REFERENCES');
  const seen=new Set<string>();
  return input.map(ref=>{
    if (!record(ref) || typeof ref.id!=='string' || !/^(CAREER-(0[1-9]|10)|BM(03|11|12)|OWNER-2026)$/.test(ref.id)
      || !Array.isArray(ref.pages) || ref.pages.length>30 || ref.pages.some(p=>!Number.isSafeInteger(p)||p<1)
      || new Set(ref.pages).size!==ref.pages.length || !text(ref.section,300) || !text(ref.supports,2000) || !text(ref.adaptation,2000)) editorFail('INVALID_SOURCE_REFERENCES');
    const pages=[...ref.pages].sort((a,b)=>a-b) as number[];
    const key=JSON.stringify([ref.id,pages,ref.section.trim()]);
    if (seen.has(key)) editorFail('DUPLICATE_SOURCE_REFERENCE');seen.add(key);
    return {id:ref.id,pages,section:ref.section.trim(),supports:ref.supports.trim(),adaptation:ref.adaptation.trim()};
  });
}
