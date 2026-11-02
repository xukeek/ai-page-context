import {
  collectRelatedComponents,
  type CreateIssueInput,
  type Issue,
  type IssueListItem,
  type IssueStatus,
  type UpdateIssueInput,
  toIssueListItem,
} from '@ai-page-context/protocol';
import { uid } from './utils';

const KEY = 'localIssues';

async function readAll(): Promise<Issue[]> {
  const data = await browser.storage.local.get(KEY);
  return (data[KEY] as Issue[] | undefined) ?? [];
}

async function writeAll(issues: Issue[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: issues });
}

/** Local fallback when MCP bridge is offline */
export async function localListIssues(status?: IssueStatus): Promise<IssueListItem[]> {
  let issues = await readAll();
  if (status) issues = issues.filter((i) => i.status === status);
  issues.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return issues.map((i) => toIssueListItem(i));
}

export async function localGetIssue(id: string): Promise<Issue | undefined> {
  return (await readAll()).find((i) => i.id === id);
}

export async function localCreateIssue(input: CreateIssueInput): Promise<Issue> {
  const now = new Date().toISOString();
  const issue: Issue = {
    id: uid(),
    status: input.status ?? 'open',
    title: input.title?.trim() || input.description.trim().slice(0, 80) || 'Untitled',
    description: input.description,
    url: input.url,
    framework: input.framework ?? 'react',
    captures: input.captures,
    relatedComponents: collectRelatedComponents(input.captures),
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  all.unshift(issue);
  await writeAll(all);
  return issue;
}

export async function localUpdateIssue(id: string, input: UpdateIssueInput): Promise<Issue | undefined> {
  const all = await readAll();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return undefined;
  const existing = all[idx]!;
  const captures = input.captures ?? existing.captures;
  const updated: Issue = {
    id: existing.id,
    framework: existing.framework,
    url: existing.url,
    createdAt: existing.createdAt,
    status: input.status ?? existing.status,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    captures,
    relatedComponents: collectRelatedComponents(captures),
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  await writeAll(all);
  return updated;
}

export async function localDeleteIssue(id: string): Promise<void> {
  await writeAll((await readAll()).filter((i) => i.id !== id));
}
