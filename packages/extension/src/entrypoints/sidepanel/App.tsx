import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Issue, IssueListItem, IssueStatus } from '@ai-page-context/protocol';
import {
  checkBridge,
  createIssue,
  deleteIssue,
  getIssue,
  listIssues,
  updateIssue,
} from '@/lib/bridge';
import {
  clearDraft,
  getDraft,
  removeDraftCapture,
  updateDraftDescription,
  type AnnotateDraft,
} from '@/lib/draft';
import {
  localCreateIssue,
  localDeleteIssue,
  localGetIssue,
  localListIssues,
  localUpdateIssue,
} from '@/lib/local-store';
import type { ExtMessage } from '@/lib/messages';
import { cn } from '@/lib/utils';

const COLUMNS: Array<{ id: IssueStatus; title: string }> = [
  { id: 'open', title: '待修复' },
  { id: 'doing', title: '处理中' },
  { id: 'done', title: '已修复' },
];

export function App() {
  const [bridgeOk, setBridgeOk] = useState(false);
  const [items, setItems] = useState<IssueListItem[]>([]);
  const [draft, setDraft] = useState<AnnotateDraft | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Issue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureIndex, setCaptureIndex] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    const ok = await checkBridge();
    setBridgeOk(ok);
    try {
      const list = ok ? await listIssues() : await localListIssues();
      setItems(list);
    } catch (err) {
      setError(String(err));
      setItems(await localListIssues());
      setBridgeOk(false);
    }
    setDraft(await getDraft());
  }, []);

  useEffect(() => {
    void refresh();
    const onMsg = (message: ExtMessage) => {
      if (message.type === 'ISSUES_CHANGED' || message.type === 'CAPTURE_READY') {
        void refresh();
      }
    };
    browser.runtime.onMessage.addListener(onMsg);
    const onStorage = () => void refresh();
    browser.storage.onChanged.addListener(onStorage);
    return () => {
      browser.runtime.onMessage.removeListener(onMsg);
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void (async () => {
      try {
        const issue = bridgeOk
          ? await getIssue(selectedId)
          : await localGetIssue(selectedId);
        setDetail(issue ?? null);
        setCaptureIndex(0);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, [selectedId, bridgeOk, items]);

  const byStatus = useMemo(() => {
    const map: Record<IssueStatus, IssueListItem[]> = { open: [], doing: [], done: [] };
    for (const item of items) map[item.status].push(item);
    return map;
  }, [items]);

  async function startAnnotate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('没有活动标签页');
      await browser.tabs.sendMessage(tab.id, { type: 'START_ANNOTATE' } satisfies ExtMessage);
    } catch (err) {
      setError(`无法启动标注（请刷新页面后重试）: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftAsIssue(): Promise<void> {
    if (!draft?.captures.length) {
      setError('请先至少截一张图');
      return;
    }
    if (!draft.description.trim()) {
      setError('请填写问题描述');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const input = {
        description: draft.description.trim(),
        url: draft.url || tab?.url || '',
        captures: draft.captures,
        framework: 'react' as const,
      };
      if (bridgeOk) {
        await createIssue(input);
      } else {
        await localCreateIssue(input);
      }
      await clearDraft();
      await browser.tabs.sendMessage(tab!.id!, { type: 'STOP_ANNOTATE' } satisfies ExtMessage).catch(() => undefined);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function moveIssue(id: string, status: IssueStatus): Promise<void> {
    try {
      if (bridgeOk) await updateIssue(id, { status });
      else await localUpdateIssue(id, { status });
      await refresh();
      if (selectedId === id) {
        setDetail((d) => (d ? { ...d, status } : d));
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeIssue(id: string): Promise<void> {
    try {
      if (bridgeOk) await deleteIssue(id);
      else await localDeleteIssue(id);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function copyIssueMarkdown(issue: Issue): Promise<void> {
    const lines = [
      `# UI Issue: ${issue.title}`,
      '',
      `- status: ${issue.status}`,
      `- url: ${issue.url}`,
      `- description: ${issue.description}`,
      '',
      '## Components',
      ...issue.relatedComponents.map((c) => `- ${c.name} — ${c.file}:${c.line}`),
      '',
      `## Captures: ${issue.captures.length}`,
      ...issue.captures.map(
        (c, i) =>
          `- [${i + 1}] mode=${c.captureMode} caption=${c.caption ?? ''} selected=${c.selected?.name ?? 'n/a'}`,
      ),
      '',
      '（截图见扩展看板 / MCP get_issue）',
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">AI Page Context</div>
            <div className="text-[11px] text-slate-500">
              Bridge {bridgeOk ? '已连接' : '离线（本地存储）'}
            </div>
          </div>
          <button
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void startAnnotate()}
          >
            新建标注
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </header>

      {draft && draft.captures.length > 0 && (
        <section className="border-b border-amber-200 bg-amber-50 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-amber-900">
            草稿 · {draft.captures.length} 张图
          </div>
          <div className="mb-2 flex gap-2 overflow-x-auto">
            {draft.captures.map((c) => (
              <div key={c.id} className="relative shrink-0">
                <img
                  src={c.annotatedDataUrl}
                  alt=""
                  className="h-16 w-24 rounded border border-amber-200 object-cover"
                />
                <button
                  className="absolute right-0 top-0 rounded bg-black/70 px-1 text-[10px] text-white"
                  onClick={() => void removeDraftCapture(c.id).then(setDraft)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <textarea
            className="mb-2 w-full rounded border border-amber-200 bg-white p-2 text-xs"
            rows={2}
            placeholder="问题描述，例如：间距太大"
            value={draft.description}
            onChange={(e) => {
              const value = e.target.value;
              setDraft({ ...draft, description: value });
              void updateDraftDescription(value);
            }}
          />
          <div className="flex gap-2">
            <button
              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
              disabled={busy}
              onClick={() => void saveDraftAsIssue()}
            >
              入库看板
            </button>
            <button
              className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
              onClick={() => void startAnnotate()}
            >
              再截一张
            </button>
            <button
              className="rounded bg-slate-300 px-2 py-1 text-xs"
              onClick={() => void clearDraft().then(() => setDraft(null))}
            >
              丢弃草稿
            </button>
          </div>
        </section>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 overflow-hidden p-1">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex min-h-0 flex-col rounded-lg bg-slate-200/70">
            <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-700">
              {col.title} ({byStatus[col.id].length})
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-1">
              {byStatus[col.id].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'w-full rounded-md border bg-white p-1.5 text-left shadow-sm',
                    selectedId === item.id ? 'border-blue-500' : 'border-transparent',
                  )}
                >
                  {item.coverThumbnail && (
                    <div className="relative mb-1">
                      <img
                        src={item.coverThumbnail}
                        alt=""
                        className="h-16 w-full rounded object-cover"
                      />
                      {item.captureCount > 1 && (
                        <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">
                          ×{item.captureCount}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="line-clamp-2 text-[11px] font-medium">{item.title}</div>
                  {item.primaryComponent && (
                    <div className="truncate text-[10px] text-slate-500">
                      {item.primaryComponent.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <section className="max-h-[45%] overflow-y-auto border-t border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{detail.title}</div>
              <div className="text-[11px] text-slate-500">{detail.description}</div>
            </div>
            <button className="text-xs text-slate-500" onClick={() => setSelectedId(null)}>
              关闭
            </button>
          </div>

          {detail.captures[captureIndex] && (
            <img
              src={detail.captures[captureIndex].annotatedDataUrl}
              alt=""
              className="mb-2 max-h-40 w-full rounded object-contain bg-slate-100"
            />
          )}
          {detail.captures.length > 1 && (
            <div className="mb-2 flex gap-1 overflow-x-auto">
              {detail.captures.map((c, i) => (
                <button key={c.id} onClick={() => setCaptureIndex(i)}>
                  <img
                    src={c.annotatedDataUrl}
                    alt=""
                    className={cn(
                      'h-10 w-14 rounded object-cover',
                      i === captureIndex ? 'ring-2 ring-blue-500' : '',
                    )}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 text-[11px] text-slate-600">
            {detail.relatedComponents.map((c) => (
              <div key={`${c.file}:${c.line}:${c.name}`}>
                {c.name} — {c.file}:{c.line}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {COLUMNS.map((col) => (
              <button
                key={col.id}
                className="rounded bg-slate-100 px-2 py-1 text-[11px]"
                onClick={() => void moveIssue(detail.id, col.id)}
              >
                → {col.title}
              </button>
            ))}
            <button
              className="rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700"
              onClick={() => void copyIssueMarkdown(detail)}
            >
              复制 Markdown
            </button>
            <button
              className="rounded bg-red-50 px-2 py-1 text-[11px] text-red-700"
              onClick={() => void removeIssue(detail.id)}
            >
              删除
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
