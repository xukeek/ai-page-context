import type { ComponentRef, DomInfo, Issue, IssueCapture } from '@ai-page-context/protocol';

export type ResolvePayload = {
  selected?: ComponentRef;
  ancestors: ComponentRef[];
  children: ComponentRef[];
  deps: ComponentRef[];
  dom?: DomInfo;
};

export type ExtMessage =
  | { type: 'START_ANNOTATE'; draftId?: string }
  | { type: 'STOP_ANNOTATE' }
  | { type: 'CAPTURE_VISIBLE' }
  | { type: 'CAPTURE_VISIBLE_RESULT'; dataUrl?: string; error?: string }
  | { type: 'CAPTURE_READY'; capture: IssueCapture }
  | { type: 'ISSUES_CHANGED' }
  | { type: 'PING_CONTENT' }
  | { type: 'CONTENT_READY' };

export type DraftState = {
  draftId: string;
  description: string;
  captures: IssueCapture[];
  editingCaptureId?: string;
};
