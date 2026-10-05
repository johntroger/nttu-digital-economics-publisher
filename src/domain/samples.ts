import { composeCaption, FOOTER } from './footer.ts';

export const SAMPLE_IDS = ['P02', 'P04', 'P05', 'P06', 'P08'] as const;
export const SAMPLE_TEMPLATES = ['checklist', 'flow', 'scene'] as const;
export interface SampleReference {
  id: string; pages: number[]; section: string; supports: string; adaptation: string;
}
export interface EditorialSample {
  id: string; title: string; body: string; reader_outcome: string;
  source_refs: SampleReference[];
  image: {
    template: 'checklist' | 'flow' | 'scene'; scene: string | null;
    mode: 'infographic' | 'illustration'; headline: string; subline: string;
    accent: string; ink: string; paper: string; cards: [string, string][]; takeaway: string;
  };
}
export interface SampleBatch {
  version: 'samples-2026-v1'; cohort: 2026; duration_years: 3.5;
  status: 'awaiting_owner_review'; reviewed_at: string; review_scope: string;
  samples: EditorialSample[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function fail(): never { throw new Error('INVALID_SAMPLE_BATCH'); }

// This checks the artifact contract, never asserts source truth or grants readiness.
export function validateSamples(input: unknown): SampleBatch {
  if (!record(input) || input.version !== 'samples-2026-v1' || input.cohort !== 2026
    || input.duration_years !== 3.5 || input.status !== 'awaiting_owner_review'
    || !text(input.reviewed_at) || !Number.isFinite(Date.parse(input.reviewed_at))
    || !text(input.review_scope) || !Array.isArray(input.samples) || input.samples.length !== 5) fail();
  const ids = new Set<string>();
  const bodies = new Set<string>();
  for (const sample of input.samples) {
    if (!record(sample) || !text(sample.id) || !(SAMPLE_IDS as readonly string[]).includes(sample.id)
      || ids.has(sample.id) || !text(sample.title) || !text(sample.body) || sample.body.includes(FOOTER)
      || !text(sample.reader_outcome) || !Array.isArray(sample.source_refs) || !sample.source_refs.length
      || !record(sample.image)) fail();
    ids.add(sample.id);
    const normalized = sample.body.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
    if (bodies.has(normalized)) fail();
    bodies.add(normalized);
    composeCaption(sample.body);
    for (const ref of sample.source_refs) {
      if (!record(ref) || !text(ref.id) || !['CAREER-06','CAREER-07','CAREER-08','CAREER-09','BM03','BM11','OWNER-2026'].includes(ref.id)
        || !Array.isArray(ref.pages) || ref.pages.some(p => !Number.isInteger(p) || p < 1)
        || (ref.id !== 'OWNER-2026' && ref.pages.length === 0)
        || !text(ref.section) || !text(ref.supports) || !text(ref.adaptation)) fail();
    }
    const image = sample.image;
    if (!text(image.template) || !(SAMPLE_TEMPLATES as readonly string[]).includes(image.template)
      || ![image.headline,image.subline,image.takeaway].every(text)
      || ![image.accent,image.ink,image.paper].every(color => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color))
      || !Array.isArray(image.cards) || image.cards.some(card => !Array.isArray(card) || card.length !== 2 || !card.every(text))) fail();
    if (image.template === 'scene') {
      if (image.mode !== 'illustration' || !['portfolio','bridge','operations'].includes(String(image.scene)) || image.cards.length !== 0) fail();
    } else if (image.mode !== 'infographic' || image.scene !== null
      || image.cards.length !== (image.template === 'checklist' ? 4 : 3)) fail();
  }
  return input as unknown as SampleBatch;
}
