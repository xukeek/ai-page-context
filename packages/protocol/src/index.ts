export type IssueStatus = 'open' | 'doing' | 'done';

export type ComponentRef = {
  name: string;
  file: string;
  line: number;
  column: number;
};

export type AnnotationStroke =
  | { type: 'pen'; points: number[][]; color: string; width: number }
  | { type: 'arrow'; from: [number, number]; to: [number, number]; color: string }
  | { type: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { type: 'text'; x: number; y: number; text: string; color: string };

export type CaptureMode = 'element' | 'region' | 'visible';

export type DomInfo = {
  tag: string;
  id?: string;
  className?: string;
  outerHTMLSnippet: string;
};

/** One Issue can attach multiple screenshots */
export type IssueCapture = {
  id: string;
  captureMode: CaptureMode;
  screenshotDataUrl: string;
  annotatedDataUrl: string;
  annotations: AnnotationStroke[];
  caption?: string;
  selected?: ComponentRef;
  ancestors?: ComponentRef[];
  children?: ComponentRef[];
  deps?: ComponentRef[];
  dom?: DomInfo;
};

export type Issue = {
  id: string;
  status: IssueStatus;
  title: string;
  description: string;
  url: string;
  framework: 'react';
  captures: IssueCapture[];
  relatedComponents: ComponentRef[];
  createdAt: string;
  updatedAt: string;
};

export const MAX_CAPTURES_PER_ISSUE = 8;
export const DEFAULT_BRIDGE_PORT = 17321;
export const DEFAULT_BRIDGE_HOST = '127.0.0.1';

export function bridgeBaseUrl(port = DEFAULT_BRIDGE_PORT): string {
  return `http://${DEFAULT_BRIDGE_HOST}:${port}`;
}

export function componentKey(ref: ComponentRef): string {
  return `${ref.file}:${ref.line}:${ref.column}:${ref.name}`;
}

export function collectRelatedComponents(captures: IssueCapture[]): ComponentRef[] {
  const map = new Map<string, ComponentRef>();
  for (const capture of captures) {
    const refs = [
      capture.selected,
      ...(capture.ancestors ?? []),
      ...(capture.children ?? []),
      ...(capture.deps ?? []),
    ].filter(Boolean) as ComponentRef[];
    for (const ref of refs) {
      map.set(componentKey(ref), ref);
    }
  }
  return [...map.values()];
}

export type IssueListItem = {
  id: string;
  status: IssueStatus;
  title: string;
  description: string;
  url: string;
  captureCount: number;
  coverThumbnail?: string;
  primaryComponent?: ComponentRef;
  createdAt: string;
  updatedAt: string;
};

export type CreateIssueInput = {
  title?: string;
  description: string;
  url: string;
  framework?: 'react';
  captures: IssueCapture[];
  status?: IssueStatus;
};

export type UpdateIssueInput = {
  status?: IssueStatus;
  title?: string;
  description?: string;
  captures?: IssueCapture[];
};

export function toIssueListItem(issue: Issue, thumbnailMaxChars = 80_000): IssueListItem {
  const cover = issue.captures[0];
  let coverThumbnail: string | undefined =
    cover?.annotatedDataUrl ?? cover?.screenshotDataUrl;
  if (coverThumbnail && coverThumbnail.length > thumbnailMaxChars) {
    coverThumbnail = undefined;
  }
  return {
    id: issue.id,
    status: issue.status,
    title: issue.title,
    description: issue.description,
    url: issue.url,
    captureCount: issue.captures.length,
    coverThumbnail,
    primaryComponent: cover?.selected ?? issue.relatedComponents[0],
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}
