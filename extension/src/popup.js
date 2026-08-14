const statusElement = document.getElementById('status');
const progressElement = document.getElementById('progress');
const queuedElement = document.getElementById('queued');
const lastSyncedElement = document.getElementById('lastSynced');

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '-';
}

function statusLabel(state) {
  if (!state.configured) return '연결 설정 필요';
  if (!state.enabled) return '수집 일시정지됨';
  if (state.status === 'syncing') return '동기화 중';
  if (state.status === 'error') return '동기화 오류';
  if (state.status === 'queued') return '다음 동기화 대기';
  return '안전하게 동기화됨';
}

async function message(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function refresh() {
  const state = await message({ type: 'get-state' });
  statusElement.textContent = statusLabel(state);
  const total = Number(state.totalCount || 0);
  const synced = Number(state.syncedCount || 0);
  progressElement.textContent = total > 0 ? `${synced.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}건` : `${synced.toLocaleString('ko-KR')}건`;
  queuedElement.textContent = `${state.queuedCount || 0}건`;
  lastSyncedElement.textContent = formatDate(state.lastSyncedAt);
}

document.getElementById('syncNow').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = '동기화 중…';
  await message({ type: 'sync-now' });
  event.currentTarget.disabled = false;
  event.currentTarget.textContent = '지금 동기화';
  await refresh();
});

document.getElementById('initialSync').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  event.currentTarget.textContent = '기록을 준비 중…';
  const result = await message({ type: 'initial-sync', days: 3650 });
  event.currentTarget.disabled = false;
  event.currentTarget.textContent = result?.error ? '기록 가져오기 다시 시도' : 'Chrome 전체 기록 가져오기';
  await refresh();
});

document.getElementById('pause').addEventListener('click', async () => {
  await message({ type: 'pause' });
  await refresh();
});

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

void refresh();
window.setInterval(() => void refresh(), 1_000);
