import type { ExtMessage } from '@/lib/messages';
import { appendCapture } from '@/lib/draft';

export default defineBackground(() => {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('sidePanel behavior failed', err));

  browser.runtime.onMessage.addListener((message: ExtMessage, sender) => {
    if (message.type === 'CAPTURE_VISIBLE') {
      return (async () => {
        try {
          const windowId = sender.tab?.windowId;
          if (windowId == null) {
            return { type: 'CAPTURE_VISIBLE_RESULT', error: 'window not found' } satisfies ExtMessage;
          }
          const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
          return { type: 'CAPTURE_VISIBLE_RESULT', dataUrl } satisfies ExtMessage;
        } catch (error) {
          const text = error instanceof Error ? error.message : 'capture failed';
          return { type: 'CAPTURE_VISIBLE_RESULT', error: text } satisfies ExtMessage;
        }
      })();
    }

    if (message.type === 'CAPTURE_READY') {
      return (async () => {
        try {
          await appendCapture(message.capture, sender.tab?.url);
          await browser.runtime.sendMessage({ type: 'ISSUES_CHANGED' } satisfies ExtMessage).catch(() => {
            // sidepanel may not be open
          });
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      })();
    }

    return undefined;
  });
});
