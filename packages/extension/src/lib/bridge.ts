import {
  bridgeBaseUrl,
  DEFAULT_BRIDGE_PORT,
  type CreateIssueInput,
  type Issue,
  type IssueListItem,
  type IssueStatus,
  type UpdateIssueInput,
} from '@ai-page-context/protocol';

const PORT_KEY = 'bridgePort';

export async function getBridgePort(): Promise<number> {
  const stored = await browser.storage.local.get(PORT_KEY);
  return typeof stored[PORT_KEY] === 'number' ? stored[PORT_KEY] : DEFAULT_BRIDGE_PORT;
}

export async function setBridgePort(port: number): Promise<void> {
  await browser.storage.local.set({ [PORT_KEY]: port });
}

async function base(): Promise<string> {
  return bridgeBaseUrl(await getBridgePort());
}

export async function checkBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${await base()}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listIssues(status?: IssueStatus): Promise<IssueListItem[]> {
  const q = status ? `?status=${status}` : '';
  const res = await fetch(`${await base()}/issues${q}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = (await res.json()) as { issues: IssueListItem[] };
  return data.issues;
}

export async function getIssue(id: string): Promise<Issue> {
  const res = await fetch(`${await base()}/issues/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  const data = (await res.json()) as { issue: Issue };
  return data.issue;
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  const res = await fetch(`${await base()}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  const data = (await res.json()) as { issue: Issue };
  return data.issue;
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
  const res = await fetch(`${await base()}/issues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`update failed: ${res.status}`);
  const data = (await res.json()) as { issue: Issue };
  return data.issue;
}

export async function deleteIssue(id: string): Promise<void> {
  const res = await fetch(`${await base()}/issues/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}
