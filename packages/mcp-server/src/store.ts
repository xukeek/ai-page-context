import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  collectRelatedComponents,
  toIssueListItem,
  type CreateIssueInput,
  type Issue,
  type IssueListItem,
  type IssueStatus,
  type UpdateIssueInput,
} from '@ai-page-context/protocol';

export class IssueStore {
  private issues = new Map<string, Issue>();
  private readonly persistPath: string;

  constructor(cwd: string) {
    this.persistPath = path.join(cwd, '.ai-page-context', 'issues.json');
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.persistPath)) return;
      const raw = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8')) as Issue[];
      for (const issue of raw) {
        this.issues.set(issue.id, issue);
      }
    } catch {
      // ignore corrupt store
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.persistPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        this.persistPath,
        JSON.stringify([...this.issues.values()], null, 2),
        'utf-8',
      );
    } catch {
      // ignore disk errors in MVP
    }
  }

  list(status?: IssueStatus): IssueListItem[] {
    let items = [...this.issues.values()];
    if (status) items = items.filter((i) => i.status === status);
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return items.map((i) => toIssueListItem(i));
  }

  get(id: string): Issue | undefined {
    return this.issues.get(id);
  }

  create(input: CreateIssueInput): Issue {
    const now = new Date().toISOString();
    const title =
      input.title?.trim() ||
      input.description.trim().slice(0, 80) ||
      'Untitled issue';
    const issue: Issue = {
      id: randomUUID(),
      status: input.status ?? 'open',
      title,
      description: input.description,
      url: input.url,
      framework: input.framework ?? 'react',
      captures: input.captures,
      relatedComponents: collectRelatedComponents(input.captures),
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    this.save();
    return issue;
  }

  update(id: string, input: UpdateIssueInput): Issue | undefined {
    const existing = this.issues.get(id);
    if (!existing) return undefined;
    const captures = input.captures ?? existing.captures;
    const updated: Issue = {
      ...existing,
      status: input.status ?? existing.status,
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      captures,
      relatedComponents: collectRelatedComponents(captures),
      updatedAt: new Date().toISOString(),
    };
    this.issues.set(id, updated);
    this.save();
    return updated;
  }

  delete(id: string): boolean {
    const ok = this.issues.delete(id);
    if (ok) this.save();
    return ok;
  }
}

export function safeReadProjectFile(cwd: string, filePath: string, maxChars = 40_000): string {
  const resolved = path.resolve(cwd, filePath);
  const root = path.resolve(cwd);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes project root: ${filePath}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + `\n\n/* truncated at ${maxChars} chars */\n`;
}
