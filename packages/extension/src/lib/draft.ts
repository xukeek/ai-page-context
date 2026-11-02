import type { IssueCapture } from '@ai-page-context/protocol';
import { MAX_CAPTURES_PER_ISSUE } from '@ai-page-context/protocol';
import { uid } from './utils';

const DRAFT_KEY = 'annotateDraft';

export type AnnotateDraft = {
  id: string;
  description: string;
  captures: IssueCapture[];
  url?: string;
  updatedAt: string;
};

export async function getDraft(): Promise<AnnotateDraft | null> {
  const data = await browser.storage.local.get(DRAFT_KEY);
  return (data[DRAFT_KEY] as AnnotateDraft | undefined) ?? null;
}

export async function ensureDraft(): Promise<AnnotateDraft> {
  const existing = await getDraft();
  if (existing) return existing;
  const draft: AnnotateDraft = {
    id: uid(),
    description: '',
    captures: [],
    updatedAt: new Date().toISOString(),
  };
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
  return draft;
}

export async function appendCapture(capture: IssueCapture, url?: string): Promise<AnnotateDraft> {
  const draft = await ensureDraft();
  if (draft.captures.length >= MAX_CAPTURES_PER_ISSUE) {
    throw new Error(`最多 ${MAX_CAPTURES_PER_ISSUE} 张截图`);
  }
  draft.captures.push(capture);
  if (url) draft.url = url;
  draft.updatedAt = new Date().toISOString();
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
  return draft;
}

export async function updateDraftDescription(description: string): Promise<AnnotateDraft> {
  const draft = await ensureDraft();
  draft.description = description;
  draft.updatedAt = new Date().toISOString();
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
  return draft;
}

export async function removeDraftCapture(captureId: string): Promise<AnnotateDraft> {
  const draft = await ensureDraft();
  draft.captures = draft.captures.filter((c) => c.id !== captureId);
  draft.updatedAt = new Date().toISOString();
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
  return draft;
}

export async function clearDraft(): Promise<void> {
  await browser.storage.local.remove(DRAFT_KEY);
}
