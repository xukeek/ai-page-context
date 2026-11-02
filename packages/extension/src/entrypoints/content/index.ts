import type { AnnotationStroke, IssueCapture } from '@ai-page-context/protocol';
import { composeAnnotated, compressDataUrl, cropDataUrl } from '@/lib/image';
import type { ExtMessage, ResolvePayload } from '@/lib/messages';
import { uid } from '@/lib/utils';

type Tool =
  | 'element'
  | 'region'
  | 'visible'
  | 'pen'
  | 'arrow'
  | 'rect'
  | 'text'
  | 'idle';

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main() {
    let active = false;
    let tool: Tool = 'idle';
    let highlight: HTMLDivElement | null = null;
    let toolbar: HTMLDivElement | null = null;
    let overlay: HTMLDivElement | null = null;
    let previewRoot: HTMLDivElement | null = null;
    let currentShot: string | null = null;
    let annotations: AnnotationStroke[] = [];
    let resolved: ResolvePayload | null = null;
    let captureMode: IssueCapture['captureMode'] = 'visible';
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let tempCanvas: HTMLCanvasElement | null = null;
    let penPoints: number[][] = [];

    function resolveFromDom(el: Element): ResolvePayload {
      const api = (window as Window & {
        __AI_PAGE_CONTEXT__?: {
          resolveElement: (el: Element) => ResolvePayload;
        };
      }).__AI_PAGE_CONTEXT__;
      if (api?.resolveElement) {
        return api.resolveElement(el);
      }
      return {
        ancestors: [],
        children: [],
        deps: [],
        dom: {
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || undefined,
          className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : undefined,
          outerHTMLSnippet: el.outerHTML.slice(0, 500),
        },
      };
    }

    async function captureVisible(): Promise<string> {
      const res = (await browser.runtime.sendMessage({
        type: 'CAPTURE_VISIBLE',
      } satisfies ExtMessage)) as ExtMessage;
      if (res.type !== 'CAPTURE_VISIBLE_RESULT' || !res.dataUrl) {
        throw new Error(res.type === 'CAPTURE_VISIBLE_RESULT' ? res.error || 'capture failed' : 'capture failed');
      }
      return res.dataUrl;
    }

    function ensureHighlight(): HTMLDivElement {
      if (highlight) return highlight;
      highlight = document.createElement('div');
      Object.assign(highlight.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483645',
        border: '2px solid #2563eb',
        background: 'rgba(37,99,235,0.12)',
        display: 'none',
      } as CSSStyleDeclaration);
      document.documentElement.appendChild(highlight);
      return highlight;
    }

    function placeHighlight(el: Element): void {
      const box = ensureHighlight();
      const r = el.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    }

    function hideHighlight(): void {
      if (highlight) highlight.style.display = 'none';
    }

    function destroyUi(): void {
      highlight?.remove();
      toolbar?.remove();
      overlay?.remove();
      previewRoot?.remove();
      highlight = toolbar = overlay = previewRoot = tempCanvas = null;
      currentShot = null;
      annotations = [];
      resolved = null;
      active = false;
      tool = 'idle';
      document.body.style.cursor = '';
    }

    function setTool(next: Tool): void {
      tool = next;
      document.body.style.cursor = next === 'element' || next === 'region' ? 'crosshair' : '';
      refreshToolbar();
      if (next === 'visible') {
        void doVisibleCapture();
      }
    }

    function refreshToolbar(): void {
      if (!toolbar) return;
      toolbar.querySelectorAll('[data-tool]').forEach((btn) => {
        const el = btn as HTMLButtonElement;
        const on = el.dataset.tool === tool;
        el.style.background = on ? '#2563eb' : '#111827';
      });
    }

    function buildToolbar(): void {
      toolbar = document.createElement('div');
      Object.assign(toolbar.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        display: 'flex',
        gap: '6px',
        padding: '8px',
        borderRadius: '12px',
        background: 'rgba(17,24,39,0.92)',
        color: '#fff',
        fontFamily: 'system-ui,sans-serif',
        fontSize: '12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      } as CSSStyleDeclaration);

      const tools: Array<{ id: Tool; label: string }> = [
        { id: 'element', label: '元素 E' },
        { id: 'region', label: '区域 R' },
        { id: 'visible', label: '可视 V' },
        { id: 'pen', label: '画笔 P' },
        { id: 'arrow', label: '箭头 A' },
        { id: 'rect', label: '矩形 B' },
        { id: 'text', label: '文字 T' },
      ];

      for (const t of tools) {
        const btn = document.createElement('button');
        btn.textContent = t.label;
        btn.dataset.tool = t.id;
        Object.assign(btn.style, {
          border: 'none',
          borderRadius: '8px',
          padding: '6px 10px',
          color: '#fff',
          background: '#111827',
          cursor: 'pointer',
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          setTool(t.id);
          if (t.id === 'region') onRegionPointer();
        });
        toolbar.appendChild(btn);
      }

      const done = document.createElement('button');
      done.textContent = '完成 ✓';
      Object.assign(done.style, {
        border: 'none',
        borderRadius: '8px',
        padding: '6px 10px',
        color: '#052e16',
        background: '#86efac',
        cursor: 'pointer',
        fontWeight: '700',
      });
      done.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void finishCapture();
      });
      toolbar.appendChild(done);

      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      Object.assign(cancel.style, {
        border: 'none',
        borderRadius: '8px',
        padding: '6px 10px',
        color: '#fff',
        background: '#7f1d1d',
        cursor: 'pointer',
      });
      cancel.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        destroyUi();
      });
      toolbar.appendChild(cancel);

      document.documentElement.appendChild(toolbar);
      refreshToolbar();
    }

    async function doVisibleCapture(): Promise<void> {
      hideHighlight();
      if (toolbar) toolbar.style.display = 'none';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const raw = await captureVisible();
        currentShot = await compressDataUrl(raw);
        captureMode = 'visible';
        resolved = null;
        annotations = [];
        openPreviewEditor();
      } finally {
        if (toolbar) toolbar.style.display = 'flex';
        tool = 'pen';
        refreshToolbar();
      }
    }

    async function doElementCapture(el: Element): Promise<void> {
      hideHighlight();
      if (toolbar) toolbar.style.display = 'none';
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const raw = await captureVisible();
        const rect = el.getBoundingClientRect();
        const padded = {
          x: Math.max(0, rect.left - 4),
          y: Math.max(0, rect.top - 4),
          width: Math.min(window.innerWidth, rect.width + 8),
          height: Math.min(window.innerHeight, rect.height + 8),
        };
        currentShot = await compressDataUrl(await cropDataUrl(raw, padded));
        captureMode = 'element';
        resolved = resolveFromDom(el);
        annotations = [];
        openPreviewEditor();
      } finally {
        if (toolbar) toolbar.style.display = 'flex';
        tool = 'pen';
        refreshToolbar();
      }
    }

    async function doRegionCapture(rect: { x: number; y: number; width: number; height: number }): Promise<void> {
      if (toolbar) toolbar.style.display = 'none';
      overlay?.remove();
      overlay = null;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const raw = await captureVisible();
        currentShot = await compressDataUrl(await cropDataUrl(raw, rect));
        captureMode = 'region';
        // Try center element
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const el = document.elementFromPoint(cx, cy);
        resolved = el ? resolveFromDom(el) : null;
        annotations = [];
        openPreviewEditor();
      } finally {
        if (toolbar) toolbar.style.display = 'flex';
        tool = 'pen';
        refreshToolbar();
      }
    }

    function openPreviewEditor(): void {
      previewRoot?.remove();
      if (!currentShot) return;
      previewRoot = document.createElement('div');
      Object.assign(previewRoot.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });

      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position: 'relative',
        maxWidth: '90vw',
        maxHeight: '80vh',
      });

      const img = document.createElement('img');
      img.src = currentShot;
      Object.assign(img.style, {
        maxWidth: '90vw',
        maxHeight: '80vh',
        display: 'block',
        borderRadius: '8px',
        userSelect: 'none',
      });

      tempCanvas = document.createElement('canvas');
      Object.assign(tempCanvas.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
      });

      img.onload = () => {
        if (!tempCanvas) return;
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        redrawPreview();
      };

      tempCanvas.addEventListener('mousedown', onAnnotateDown);
      tempCanvas.addEventListener('mousemove', onAnnotateMove);
      tempCanvas.addEventListener('mouseup', onAnnotateUp);

      wrap.appendChild(img);
      wrap.appendChild(tempCanvas);
      previewRoot.appendChild(wrap);
      document.documentElement.appendChild(previewRoot);
    }

    function scaleEvent(e: MouseEvent): { x: number; y: number } {
      if (!tempCanvas) return { x: 0, y: 0 };
      const r = tempCanvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * tempCanvas.width;
      const y = ((e.clientY - r.top) / r.height) * tempCanvas.height;
      return { x, y };
    }

    function redrawPreview(): void {
      if (!tempCanvas || !currentShot) return;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      // drawAnnotations expects coords in canvas pixels
      const { drawAnnotations } = requireDraw();
      drawAnnotations(ctx, annotations);
    }

    function requireDraw() {
      // inline to avoid circular import issues in content bundle - use image module
      return {
        drawAnnotations: (
          ctx: CanvasRenderingContext2D,
          strokes: AnnotationStroke[],
        ) => {
          for (const stroke of strokes) {
            ctx.save();
            if (stroke.type === 'pen') {
              ctx.strokeStyle = stroke.color;
              ctx.lineWidth = stroke.width;
              ctx.lineJoin = 'round';
              ctx.lineCap = 'round';
              ctx.beginPath();
              stroke.points.forEach((pt, i) => {
                const x = pt[0] ?? 0;
                const y = pt[1] ?? 0;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.stroke();
            } else if (stroke.type === 'arrow') {
              const x1 = stroke.from[0] ?? 0;
              const y1 = stroke.from[1] ?? 0;
              const x2 = stroke.to[0] ?? 0;
              const y2 = stroke.to[1] ?? 0;
              ctx.strokeStyle = stroke.color;
              ctx.fillStyle = stroke.color;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              const angle = Math.atan2(y2 - y1, x2 - x1);
              const head = 12;
              ctx.beginPath();
              ctx.moveTo(x2, y2);
              ctx.lineTo(
                x2 - head * Math.cos(angle - Math.PI / 6),
                y2 - head * Math.sin(angle - Math.PI / 6),
              );
              ctx.lineTo(
                x2 - head * Math.cos(angle + Math.PI / 6),
                y2 - head * Math.sin(angle + Math.PI / 6),
              );
              ctx.closePath();
              ctx.fill();
            } else if (stroke.type === 'rect') {
              ctx.strokeStyle = stroke.color;
              ctx.lineWidth = 3;
              ctx.strokeRect(stroke.x, stroke.y, stroke.w, stroke.h);
              ctx.fillStyle = `${stroke.color}22`;
              ctx.fillRect(stroke.x, stroke.y, stroke.w, stroke.h);
            } else if (stroke.type === 'text') {
              ctx.fillStyle = stroke.color;
              ctx.font = 'bold 18px sans-serif';
              ctx.fillText(stroke.text, stroke.x, stroke.y);
            }
            ctx.restore();
          }
        },
      };
    }

    function onAnnotateDown(e: MouseEvent): void {
      if (!['pen', 'arrow', 'rect', 'text'].includes(tool)) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = scaleEvent(e);
      drawing = true;
      startX = x;
      startY = y;
      if (tool === 'pen') {
        penPoints = [[x, y]];
      } else if (tool === 'text') {
        const text = window.prompt('批注文字', '这里') || '';
        if (text) {
          annotations.push({ type: 'text', x, y, text, color: '#ef4444' });
          redrawPreview();
        }
        drawing = false;
      }
    }

    function onAnnotateMove(e: MouseEvent): void {
      if (!drawing || !tempCanvas) return;
      const { x, y } = scaleEvent(e);
      if (tool === 'pen') {
        penPoints.push([x, y]);
        redrawPreview();
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        penPoints.forEach((pt, i) => {
          const px = pt[0] ?? 0;
          const py = pt[1] ?? 0;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      } else if (tool === 'rect' || tool === 'arrow') {
        redrawPreview();
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        if (tool === 'rect') {
          ctx.strokeRect(startX, startY, x - startX, y - startY);
        } else {
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    }

    function onAnnotateUp(e: MouseEvent): void {
      if (!drawing) return;
      drawing = false;
      const { x, y } = scaleEvent(e);
      if (tool === 'pen' && penPoints.length > 1) {
        annotations.push({ type: 'pen', points: penPoints, color: '#ef4444', width: 3 });
      } else if (tool === 'arrow') {
        annotations.push({
          type: 'arrow',
          from: [startX, startY],
          to: [x, y],
          color: '#ef4444',
        });
      } else if (tool === 'rect') {
        annotations.push({
          type: 'rect',
          x: Math.min(startX, x),
          y: Math.min(startY, y),
          w: Math.abs(x - startX),
          h: Math.abs(y - startY),
          color: '#ef4444',
        });
      }
      penPoints = [];
      redrawPreview();
    }

    async function finishCapture(): Promise<void> {
      if (!currentShot) {
        window.alert('请先截图');
        return;
      }
      const annotatedDataUrl = await composeAnnotated(currentShot, annotations);
      const capture: IssueCapture = {
        id: uid(),
        captureMode,
        screenshotDataUrl: currentShot,
        annotatedDataUrl,
        annotations,
        selected: resolved?.selected,
        ancestors: resolved?.ancestors,
        children: resolved?.children,
        deps: resolved?.deps,
        dom: resolved?.dom,
      };
      await browser.runtime.sendMessage({
        type: 'CAPTURE_READY',
        capture,
      } satisfies ExtMessage);
      // Keep session? For multi-capture from page, reset preview but keep toolbar
      previewRoot?.remove();
      previewRoot = null;
      currentShot = null;
      annotations = [];
      tool = 'element';
      refreshToolbar();
    }

    function onMouseMove(e: MouseEvent): void {
      if (!active || tool !== 'element') return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === toolbar || toolbar?.contains(el) || previewRoot?.contains(el)) {
        hideHighlight();
        return;
      }
      placeHighlight(el);
    }

    function onClick(e: MouseEvent): void {
      if (!active) return;
      if (toolbar && (e.target === toolbar || toolbar.contains(e.target as Node))) return;
      if (previewRoot && previewRoot.contains(e.target as Node)) return;

      if (tool === 'element') {
        e.preventDefault();
        e.stopPropagation();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el) void doElementCapture(el);
      }
    }

    function onRegionPointer(): void {
      if (!active || tool !== 'region') return;
      overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483644',
        cursor: 'crosshair',
        background: 'rgba(0,0,0,0.15)',
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed',
        border: '2px dashed #fff',
        background: 'rgba(37,99,235,0.2)',
        display: 'none',
      });
      overlay.appendChild(box);
      document.documentElement.appendChild(overlay);

      let sx = 0;
      let sy = 0;
      let dragging = false;

      const down = (e: MouseEvent) => {
        dragging = true;
        sx = e.clientX;
        sy = e.clientY;
        box.style.display = 'block';
      };
      const move = (e: MouseEvent) => {
        if (!dragging) return;
        const x = Math.min(sx, e.clientX);
        const y = Math.min(sy, e.clientY);
        const w = Math.abs(e.clientX - sx);
        const h = Math.abs(e.clientY - sy);
        Object.assign(box.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${w}px`,
          height: `${h}px`,
        });
      };
      const up = (e: MouseEvent) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.min(sx, e.clientX);
        const y = Math.min(sy, e.clientY);
        const w = Math.abs(e.clientX - sx);
        const h = Math.abs(e.clientY - sy);
        overlay?.removeEventListener('mousedown', down);
        overlay?.removeEventListener('mousemove', move);
        overlay?.removeEventListener('mouseup', up);
        if (w > 4 && h > 4) {
          void doRegionCapture({ x, y, width: w, height: h });
        } else {
          overlay?.remove();
          overlay = null;
        }
      };
      overlay.addEventListener('mousedown', down);
      overlay.addEventListener('mousemove', move);
      overlay.addEventListener('mouseup', up);
    }

    function onKey(e: KeyboardEvent): void {
      if (!active) return;
      const map: Record<string, Tool> = {
        e: 'element',
        r: 'region',
        v: 'visible',
        p: 'pen',
        a: 'arrow',
        b: 'rect',
        t: 'text',
      };
      const key = e.key.toLowerCase();
      if (map[key] && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        const next = map[key];
        setTool(next);
        if (next === 'region') onRegionPointer();
      } else if (e.key === 'Escape') {
        destroyUi();
      } else if (e.key === 'Enter' && currentShot) {
        e.preventDefault();
        void finishCapture();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        annotations.pop();
        redrawPreview();
      }
    }

    function start(): void {
      if (active) return;
      active = true;
      buildToolbar();
      setTool('element');
      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('click', onClick, true);
      window.addEventListener('keydown', onKey, true);
    }

    function stop(): void {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      destroyUi();
    }

    browser.runtime.onMessage.addListener((message: ExtMessage) => {
      if (message.type === 'START_ANNOTATE') {
        start();
        return Promise.resolve({ type: 'CONTENT_READY' } satisfies ExtMessage);
      }
      if (message.type === 'STOP_ANNOTATE') {
        stop();
      }
      if (message.type === 'PING_CONTENT') {
        return Promise.resolve({ type: 'CONTENT_READY' } satisfies ExtMessage);
      }
      return undefined;
    });

    },
});
