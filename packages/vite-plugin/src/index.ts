import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ViteDevServer } from 'vite';
import { transformSync } from '@babel/core';
import { createAiContextBabelPlugin } from './babel-plugin.js';

export type AiPageContextOptions = {
  /** Project root for relative paths. Defaults to Vite root. */
  projectRoot?: string;
  /** Enable GET /@ai-context/file?path= middleware. Default true. */
  fileMiddleware?: boolean;
};

const RUNTIME_ID = 'virtual:ai-page-context-runtime';
const RESOLVED_RUNTIME_ID = '\0' + RUNTIME_ID;

function findRuntimeSource(): string {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'runtime-browser.js'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'runtime-browser.js'),
  ];
  try {
    const pkgJson = require.resolve('@ai-page-context/vite-plugin/package.json');
    candidates.push(path.join(path.dirname(pkgJson), 'src', 'runtime-browser.js'));
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }
  throw new Error('ai-page-context runtime-browser.js not found');
}

function isSafeProjectPath(projectRoot: string, requested: string): string | null {
  const resolved = path.resolve(projectRoot, requested);
  const root = path.resolve(projectRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

export function aiPageContext(options: AiPageContextOptions = {}): Plugin {
  let projectRoot = options.projectRoot ?? process.cwd();
  const enableFileMiddleware = options.fileMiddleware !== false;

  return {
    name: 'vite-plugin-ai-context',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      projectRoot = options.projectRoot ?? config.root;
    },
    resolveId(id) {
      if (id === RUNTIME_ID) return RESOLVED_RUNTIME_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_RUNTIME_ID) {
        return findRuntimeSource();
      }
      return null;
    },
    transform(code, id) {
      if (!/\.[cm]?[jt]sx$/.test(id)) return null;
      if (id.includes('node_modules')) return null;
      if (id.includes('\0')) return null;

      const result = transformSync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        plugins: [createAiContextBabelPlugin(projectRoot)],
        parserOpts: {
          sourceType: 'module',
          plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
        },
        sourceMaps: true,
      });

      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `/@id/${RUNTIME_ID}` },
          injectTo: 'body',
        },
      ];
    },
    configureServer(server: ViteDevServer) {
      if (!enableFileMiddleware) return;

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/@ai-context/file')) {
          next();
          return;
        }
        try {
          const parsed = new URL(url, 'http://localhost');
          const filePath = parsed.searchParams.get('path');
          if (!filePath) {
            res.statusCode = 400;
            res.end('missing path');
            return;
          }
          const safe = isSafeProjectPath(projectRoot, filePath);
          if (!safe) {
            res.statusCode = 403;
            res.end('forbidden');
            return;
          }
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(fs.readFileSync(safe, 'utf-8'));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default aiPageContext;
