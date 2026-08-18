const REQUEST_SOURCE = 'amy-brain-map-dashboard';
const RESPONSE_SOURCE = 'amy-brain-map-extension';
const POLL_INTERVAL_MS = 1_000;

function postToDashboard(payload) {
  window.postMessage({ source: RESPONSE_SOURCE, ...payload }, window.location.origin);
}

async function trackInitialSync(requestId, requestedAt) {
  let sawSyncing = false;
  let polling = false;

  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const state = await chrome.runtime.sendMessage({ type: 'get-state' });
      postToDashboard({ type: 'initial-history-sync-progress', requestId, state });
      if (state.status === 'syncing') sawSyncing = true;

      const updatedAt = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
      const changedAfterRequest = updatedAt >= requestedAt - 2_000;
      const completed = (sawSyncing || changedAfterRequest) && (state.status === 'idle' || state.status === 'error');
      if (!completed) return;

      window.clearInterval(intervalId);
      if (state.status === 'error') {
        postToDashboard({ type: 'initial-history-sync-result', requestId, result: { error: state.lastError || 'Chrome 방문 기록 동기화에 실패했습니다.' } });
        return;
      }
      postToDashboard({
        type: 'initial-history-sync-result',
        requestId,
        result: { queuedFromHistory: Number(state.totalCount || state.syncedCount || 0), synced: Number(state.syncedCount || 0) },
      });
    } catch (error) {
      window.clearInterval(intervalId);
      postToDashboard({
        type: 'initial-history-sync-result',
        requestId,
        result: { error: error instanceof Error ? error.message : 'Chrome 방문 기록 동기화 상태를 확인하지 못했습니다.' },
      });
    } finally {
      polling = false;
    }
  };

  const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
  await poll();
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== REQUEST_SOURCE) return;
  if (message.type !== 'initial-history-sync' && message.type !== 'auto-connect-and-initial-history-sync') return;

  try {
    const requestedAt = Date.now();
    const extensionMessage = message.type === 'auto-connect-and-initial-history-sync'
      ? { type: 'auto-connect-and-initial-sync', endpoint: window.location.origin, connectCode: message.connectCode, days: 3650 }
      : { type: 'initial-sync', days: 3650 };
    const started = await chrome.runtime.sendMessage(extensionMessage);
    if (started?.error) throw new Error(started.error);
    postToDashboard({ type: 'initial-history-sync-started', requestId: message.requestId });
    await trackInitialSync(message.requestId, requestedAt);
  } catch (error) {
    postToDashboard({
      type: 'initial-history-sync-result',
      requestId: message.requestId,
      result: { error: error instanceof Error ? error.message : 'Chrome 방문 기록 동기화에 실패했습니다.' },
    });
  }
});
