import http from 'node:http';
import {
  DEFAULT_BRIDGE_PORT,
  type CreateIssueInput,
  type IssueStatus,
  type UpdateIssueInput,
} from '@ai-page-context/protocol';
import type { IssueStore } from './store.js';

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

export function startHttpBridge(
  store: IssueStore,
  port = DEFAULT_BRIDGE_PORT,
): http.Server {
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

    if (method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    try {
      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'GET' && url.pathname === '/issues') {
        const status = url.searchParams.get('status') as IssueStatus | null;
        sendJson(res, 200, { issues: store.list(status ?? undefined) });
        return;
      }

      const issueMatch = url.pathname.match(/^\/issues\/([^/]+)$/);
      if (issueMatch) {
        const id = decodeURIComponent(issueMatch[1]);
        if (method === 'GET') {
          const issue = store.get(id);
          if (!issue) {
            sendJson(res, 404, { error: 'not found' });
            return;
          }
          sendJson(res, 200, { issue });
          return;
        }
        if (method === 'PATCH') {
          const body = JSON.parse(await readBody(req)) as UpdateIssueInput;
          const issue = store.update(id, body);
          if (!issue) {
            sendJson(res, 404, { error: 'not found' });
            return;
          }
          sendJson(res, 200, { issue });
          return;
        }
        if (method === 'DELETE') {
          const ok = store.delete(id);
          sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'not found' });
          return;
        }
      }

      if (method === 'POST' && url.pathname === '/issues') {
        const body = JSON.parse(await readBody(req)) as CreateIssueInput;
        if (!body.description || !body.url || !body.captures?.length) {
          sendJson(res, 400, { error: 'description, url, captures required' });
          return;
        }
        const issue = store.create(body);
        sendJson(res, 201, { issue });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
  });

  server.listen(port, '127.0.0.1');
  return server;
}
