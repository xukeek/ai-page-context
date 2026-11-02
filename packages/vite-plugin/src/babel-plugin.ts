import type { PluginObj, PluginPass } from '@babel/core';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import path from 'node:path';

type State = PluginPass & {
  filename?: string;
  projectRoot?: string;
};

function relativeFile(filename: string | undefined, projectRoot: string | undefined): string {
  if (!filename || filename.startsWith('\0')) return '';
  if (projectRoot) {
    return path.relative(projectRoot, filename).split(path.sep).join('/');
  }
  return filename.split(path.sep).join('/');
}

function nameFromOpening(opening: t.JSXOpeningElement): string {
  const name = opening.name;
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXMemberExpression(name)) {
    const parts: string[] = [];
    let cur: t.JSXMemberExpression | t.JSXIdentifier = name;
    while (t.isJSXMemberExpression(cur)) {
      if (t.isJSXIdentifier(cur.property)) parts.unshift(cur.property.name);
      cur = cur.object as t.JSXMemberExpression | t.JSXIdentifier;
    }
    if (t.isJSXIdentifier(cur)) parts.unshift(cur.name);
    return parts.join('.');
  }
  return 'Unknown';
}

function hasAttr(opening: t.JSXOpeningElement, attrName: string): boolean {
  return opening.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === attrName,
  );
}

export function createAiContextBabelPlugin(projectRoot: string): PluginObj<State> {
  return {
    name: 'ai-page-context-jsx-source',
    visitor: {
      JSXOpeningElement(jsxPath: NodePath<t.JSXOpeningElement>, state) {
        const opening = jsxPath.node;
        if (opening.selfClosing === undefined) return;

        // Skip fragments
        if (t.isJSXIdentifier(opening.name) && opening.name.name === 'Fragment') return;
        if (
          t.isJSXMemberExpression(opening.name) &&
          t.isJSXIdentifier(opening.name.object) &&
          opening.name.object.name === 'React' &&
          t.isJSXIdentifier(opening.name.property) &&
          opening.name.property.name === 'Fragment'
        ) {
          return;
        }

        const file = relativeFile(state.filename, projectRoot);
        if (!file || file.includes('node_modules')) return;

        const loc = opening.loc?.start;
        const line = loc?.line ?? 0;
        const column = (loc?.column ?? 0) + 1;
        const componentName = nameFromOpening(opening);

        const attrs: Array<[string, string | number]> = [
          ['data-ai-file', file],
          ['data-ai-line', line],
          ['data-ai-col', column],
          ['data-ai-name', componentName],
        ];

        for (const [key, value] of attrs) {
          if (hasAttr(opening, key)) continue;
          opening.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier(key),
              t.stringLiteral(String(value)),
            ),
          );
        }
      },
    },
  };
}
