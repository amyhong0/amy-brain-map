const REQUEST_SOURCE = 'amy-brain-map-dashboard';
const RESPONSE_SOURCE = 'amy-brain-map-extension';

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== REQUEST_SOURCE || message.type !== 'initial-history-sync') return;

  try {
    const result = await chrome.runtime.sendMessage({ type: 'initial-sync', days: 3650 });
    window.postMessage({
      source: RESPONSE_SOURCE,
      type: 'initial-history-sync-result',
      requestId: message.requestId,
      result,
    }, window.location.origin);
  } catch (error) {
    window.postMessage({
      source: RESPONSE_SOURCE,
      type: 'initial-history-sync-result',
      requestId: message.requestId,
      result: { error: error instanceof Error ? error.message : 'Chrome 방문 기록 동기화에 실패했습니다.' },
    }, window.location.origin);
  }
});
