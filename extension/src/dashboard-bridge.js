const REQUEST_SOURCE = 'amy-brain-map-dashboard';
const RESPONSE_SOURCE = 'amy-brain-map-extension';

function postToDashboard(payload) {
  window.postMessage({ source: RESPONSE_SOURCE, ...payload }, window.location.origin);
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== REQUEST_SOURCE) return;

  try {
    if (message.type === 'auto-sync-status') {
      const state = await chrome.runtime.sendMessage({ type: 'get-state' });
      postToDashboard({ type: 'auto-sync-status-result', requestId: message.requestId, result: state.autoSync || null });
      return;
    }
    if (message.type === 'set-auto-sync-interval') {
      const result = await chrome.runtime.sendMessage({ type: 'set-auto-sync-interval', intervalMinutes: message.intervalMinutes });
      if (result?.error) throw new Error(result.error);
      postToDashboard({ type: 'set-auto-sync-interval-result', requestId: message.requestId, result: result.autoSync || null });
      return;
    }
    if (message.type === 'reset-sync-state') {
      await chrome.runtime.sendMessage({ type: 'reset-sync-state' });
      return;
    }
    if (message.type !== 'initial-history-sync' && message.type !== 'auto-connect-and-initial-history-sync') return;

    postToDashboard({ type: 'initial-history-sync-started', requestId: message.requestId });

    let active = true;
    const progressTimer = window.setInterval(async () => {
      if (!active) return;
      try {
        const state = await chrome.runtime.sendMessage({ type: 'get-state' });
        if (active) postToDashboard({ type: 'initial-history-sync-progress', requestId: message.requestId, state });
      } catch {
        // ignore progress polling error
      }
    }, 400);

    try {
      const extensionMessage = message.type === 'auto-connect-and-initial-history-sync'
        ? { type: 'auto-connect-and-initial-sync', endpoint: window.location.origin, connectCode: message.connectCode, days: 3650, forceFull: true }
        : { type: 'initial-sync', days: 3650, forceFull: true };

      const syncResult = await chrome.runtime.sendMessage(extensionMessage);
      active = false;
      window.clearInterval(progressTimer);

      if (syncResult?.error) throw new Error(syncResult.error);

      const finalState = await chrome.runtime.sendMessage({ type: 'get-state' }).catch(() => ({}));
      const total = Number(syncResult?.queuedFromHistory ?? finalState?.totalCount ?? finalState?.syncedCount ?? 0);
      const synced = Number(syncResult?.synced ?? finalState?.syncedCount ?? total);

      postToDashboard({
        type: 'initial-history-sync-result',
        requestId: message.requestId,
        result: {
          queuedFromHistory: Math.max(total, synced),
          synced: Math.max(total, synced),
          incremental: false,
        },
      });
    } catch (error) {
      active = false;
      window.clearInterval(progressTimer);
      postToDashboard({
        type: 'initial-history-sync-result',
        requestId: message.requestId,
        result: { error: error instanceof Error ? error.message : 'Chrome 방문 기록 동기화에 실패했습니다.' },
      });
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Chrome 방문 기록 동기화에 실패했습니다.';
    if (message.type === 'auto-sync-status' || message.type === 'set-auto-sync-interval') {
      postToDashboard({ type: `${message.type}-result`, requestId: message.requestId, error: messageText });
      return;
    }
    postToDashboard({
      type: 'initial-history-sync-result',
      requestId: message.requestId,
      result: { error: messageText },
    });
  }
});
