#!/usr/bin/env node
import { DEFAULT_BRIDGE_PORT } from '@ai-page-context/protocol';
import { IssueStore } from './store.js';
import { startHttpBridge } from './http.js';
import { startMcpServer } from './mcp.js';

async function main(): Promise<void> {
  const cwd = process.env.AI_PAGE_CONTEXT_CWD || process.cwd();
  const port = Number(process.env.AI_PAGE_CONTEXT_PORT || DEFAULT_BRIDGE_PORT);
  const store = new IssueStore(cwd);

  startHttpBridge(store, port);
  // Log to stderr so stdout stays clean for MCP stdio
  console.error(`[ai-page-context] cwd=${cwd}`);
  console.error(`[ai-page-context] HTTP bridge http://127.0.0.1:${port}`);
  console.error(`[ai-page-context] MCP stdio ready`);

  await startMcpServer(store, cwd);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
