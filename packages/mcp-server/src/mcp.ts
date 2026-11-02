import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { IssueStatus } from '@ai-page-context/protocol';
import { IssueStore, safeReadProjectFile } from './store.js';

export async function startMcpServer(store: IssueStore, cwd: string): Promise<McpServer> {
  const server = new McpServer({
    name: 'ai-page-context',
    version: '0.1.0',
  });

  server.tool(
    'list_issues',
    'List UI issues from the annotation board. Defaults to open issues.',
    {
      status: z.enum(['open', 'doing', 'done']).optional().describe('Filter by board column'),
    },
    async ({ status }) => {
      const issues = store.list(status as IssueStatus | undefined);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(issues, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'get_issue',
    'Get a full issue including annotated screenshots. Optionally limit captures.',
    {
      id: z.string(),
      includeImages: z.boolean().optional().default(true),
      captureIds: z.array(z.string()).optional(),
    },
    async ({ id, includeImages, captureIds }) => {
      const issue = store.get(id);
      if (!issue) {
        return {
          content: [{ type: 'text', text: `Issue not found: ${id}` }],
          isError: true,
        };
      }
      let captures = issue.captures;
      if (captureIds?.length) {
        const set = new Set(captureIds);
        captures = captures.filter((c) => set.has(c.id));
      }
      if (!includeImages) {
        captures = captures.map((c) => ({
          ...c,
          screenshotDataUrl: '[omitted]',
          annotatedDataUrl: '[omitted]',
        }));
      }
      const payload = { ...issue, captures };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.tool(
    'read_issue_sources',
    'Read source files related to an issue (deduped relatedComponents).',
    {
      id: z.string(),
      maxCharsPerFile: z.number().optional().default(40000),
    },
    async ({ id, maxCharsPerFile }) => {
      const issue = store.get(id);
      if (!issue) {
        return {
          content: [{ type: 'text', text: `Issue not found: ${id}` }],
          isError: true,
        };
      }
      const files: Array<{ file: string; name?: string; content: string; error?: string }> = [];
      const seen = new Set<string>();
      for (const ref of issue.relatedComponents) {
        if (!ref.file || seen.has(ref.file)) continue;
        seen.add(ref.file);
        try {
          files.push({
            file: ref.file,
            name: ref.name,
            content: safeReadProjectFile(cwd, ref.file, maxCharsPerFile),
          });
        } catch (err) {
          files.push({ file: ref.file, name: ref.name, content: '', error: String(err) });
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ issueId: id, description: issue.description, files }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'update_issue',
    'Update issue status or description. Use doing when starting a fix, done when finished.',
    {
      id: z.string(),
      status: z.enum(['open', 'doing', 'done']).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ id, status, title, description }) => {
      const issue = store.update(id, { status, title, description });
      if (!issue) {
        return {
          content: [{ type: 'text', text: `Issue not found: ${id}` }],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { id: issue.id, status: issue.status, title: issue.title, updatedAt: issue.updatedAt },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'compose_fix_prompt',
    'Compose a fix prompt from an issue description, captures metadata, and related sources.',
    {
      id: z.string(),
    },
    async ({ id }) => {
      const issue = store.get(id);
      if (!issue) {
        return {
          content: [{ type: 'text', text: `Issue not found: ${id}` }],
          isError: true,
        };
      }
      const sources: string[] = [];
      const seen = new Set<string>();
      for (const ref of issue.relatedComponents) {
        if (!ref.file || seen.has(ref.file)) continue;
        seen.add(ref.file);
        try {
          const content = safeReadProjectFile(cwd, ref.file);
          sources.push(`### ${ref.name} — ${ref.file}:${ref.line}\n\`\`\`\n${content}\n\`\`\``);
        } catch (err) {
          sources.push(`### ${ref.file}\n(error: ${String(err)})`);
        }
      }
      const captureNotes = issue.captures
        .map((c, i) => {
          const sel = c.selected ? `${c.selected.name} (${c.selected.file}:${c.selected.line})` : 'n/a';
          return `- Capture ${i + 1} [${c.captureMode}] caption=${c.caption ?? ''} component=${sel}`;
        })
        .join('\n');

      const prompt = `# UI Fix Task

## Issue
- id: ${issue.id}
- status: ${issue.status}
- url: ${issue.url}
- description: ${issue.description}

## Captures
${captureNotes}
(Annotated images are available via get_issue; use them as visual ground truth.)

## Related source
${sources.join('\n\n') || '(no component paths resolved)'}

## Instructions
Fix the UI issue described above. Prefer minimal changes. After editing, call update_issue with status "done".
`;
      return { content: [{ type: 'text', text: prompt }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
