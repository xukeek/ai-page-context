function getFiber(el) {
  const key = Object.keys(el).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (!key) return null;
  return el[key] ?? null;
}

function displayName(type) {
  if (!type) return undefined;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.displayName || type.name || undefined;
  if (typeof type === 'object') {
    if (type.displayName) return type.displayName;
    if (type.name) return type.name;
    if (type.render) return type.render.displayName || type.render.name;
    return displayName(type.type);
  }
  return undefined;
}

function isHostFiber(fiber) {
  return typeof fiber.type === 'string';
}

function isUserComponent(fiber) {
  if (!fiber.type || isHostFiber(fiber)) return false;
  const name = displayName(fiber.type);
  if (!name) return false;
  if (name === 'Anonymous' || name.startsWith('_')) return false;
  return true;
}

function fromDataAttrs(el) {
  const file = el.getAttribute('data-ai-file');
  if (!file) return undefined;
  return {
    name: el.getAttribute('data-ai-name') || el.tagName.toLowerCase(),
    file,
    line: Number(el.getAttribute('data-ai-line') || 0),
    column: Number(el.getAttribute('data-ai-col') || 0),
  };
}

function normalizeFile(file) {
  const marker = '/src/';
  const idx = file.lastIndexOf(marker);
  if (idx >= 0) return file.slice(idx + 1);
  return file;
}

function fromFiber(fiber) {
  if (!isUserComponent(fiber)) return undefined;
  const name = displayName(fiber.type) || 'Component';
  const src = fiber._debugSource;
  const props = fiber.memoizedProps || fiber.pendingProps || {};
  const file =
    (typeof props['data-ai-file'] === 'string' && props['data-ai-file']) ||
    src?.fileName ||
    '';
  const line =
    Number(props['data-ai-line'] ?? src?.lineNumber ?? 0) || 0;
  const column =
    Number(props['data-ai-col'] ?? src?.columnNumber ?? 0) || 0;
  return { name, file: normalizeFile(file), line, column };
}

function walkAncestors(fiber) {
  const result = [];
  let cur = fiber;
  while (cur) {
    const node = fromFiber(cur);
    if (
      node &&
      (!result.length ||
        result[result.length - 1].name !== node.name ||
        result[result.length - 1].file !== node.file)
    ) {
      result.push(node);
    }
    cur = cur.return ?? null;
  }
  return result;
}

function walkChildren(fiber, depth = 0) {
  if (!fiber || depth > 4) return [];
  const result = [];
  let cur = fiber.child ?? null;
  while (cur) {
    if (isUserComponent(cur)) {
      const node = fromFiber(cur);
      if (node) result.push(node);
    } else if (cur.child) {
      result.push(...walkChildren(cur, depth + 1));
    }
    cur = cur.sibling ?? null;
  }
  return result;
}

function resolveElement(el) {
  const snippet = el.outerHTML.slice(0, 500);
  const dom = {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    className: typeof el.className === 'string' ? el.className : undefined,
    outerHTMLSnippet: snippet,
  };

  const fromAttr = fromDataAttrs(el);
  const fiber = getFiber(el);

  if (!fiber) {
    let cur = el;
    let selected = fromAttr;
    while (!selected && cur?.parentElement) {
      cur = cur.parentElement;
      selected = fromDataAttrs(cur);
    }
    return {
      selected,
      ancestors: selected ? [selected] : [],
      children: [],
      deps: [],
      dom,
    };
  }

  let nearest = fiber;
  while (nearest && !isUserComponent(nearest)) {
    nearest = nearest.return ?? null;
  }

  const selected = (nearest && fromFiber(nearest)) || fromAttr;
  const ancestors = nearest ? walkAncestors(nearest.return ?? null) : [];
  const children = nearest ? walkChildren(nearest) : [];
  const deps = children.slice(0, 12);

  return { selected, ancestors, children, deps, dom };
}

if (typeof window !== 'undefined') {
  window.__AI_PAGE_CONTEXT__ = {
    resolveElement,
    version: '0.1.0',
  };
}
