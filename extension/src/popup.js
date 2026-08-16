const statusElement = document.getElementById('status');
const progressElement = document.getElementById('progress');
const progressFillElement = document.getElementById('progressFill');
const progressTrackElement = progressFillElement.parentElement;
const syncNoteElement = document.getElementById('syncNote');
const queuedElement = document.getElementById('queued');
const lastSyncedElement = document.getElementById('lastSynced');
const connectionNoticeElement = document.getElementById('connectionNotice');
const syncNowButton = document.getElementById('syncNow');
const initialSyncButton = document.getElementById('initialSync');
const pauseButton = document.getElementById('pause');
const openOptionsElement = document.getElementById('openOptions');

let latestState = {};

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '-';
}

function statusLabel(state) {
  if (!state.configured) return '연결 설정 필요';
  if (!state.enabled) return '수집 일시정지됨';
  if (state.status === 'syncing') return '동기화 중';
  if (state.status === 'error') return '동기화 오류';
  if (state.status === 'queued') return '다음 동기화 대기';
  return '동기화 준비 완료';
}

function progressSummary(state) {
  const total = Number(state.totalCount || 0);
  const synced = Number(state.syncedCount || 0);
  if (total > 0) {
    const percentage = Math.min(100, Math.round((synced / total) * 100));
    return { total, synced, percentage, label: `${percentage}% · ${synced.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}건` };
  }
  return { total: 0, synced, percentage: 0, label: synced > 0 ? `${synced.toLocaleString('ko-KR')}건 동기화됨` : '시작 전' };
}

function syncNote(state, progress) {
  if (!state.configured) return '아래 연결 설정 열기에서 앱 주소와 대시보드 연결 코드를 입력하세요.';
  if (!state.enabled) return '수집이 일시정지되어 있습니다. 연결 설정에서 동기화를 다시 켜세요.';
  if (state.status === 'syncing') return progress.total > 0 ? `Chrome 전체 기록을 안전하게 전송하고 있습니다. ${progress.percentage}% 완료` : '새로 쌓인 방문 기록을 전송하고 있습니다.';
  if (state.status === 'error') return state.lastError || '동기화 중 오류가 발생했습니다. 연결 설정을 확인한 뒤 다시 시도하세요.';
  if (state.status === 'queued') return `${Number(state.queuedCount || 0).toLocaleString('ko-KR')}건을 다음 동기화에서 전송합니다.`;
  if (state.lastSyncedAt) return '동기화가 완료되었습니다. 새 방문 기록은 자동으로 이어서 수집합니다.';
  return 'Chrome 전체 기록을 가져오거나, 새 방문 기록을 기다리고 있습니다.';
}

function updateControls(state) {
  const needsConfiguration = !state.configured;
  const syncing = state.status === 'syncing';
  syncNowButton.disabled = needsConfiguration || syncing;
  initialSyncButton.disabled = needsConfiguration || syncing;
  pauseButton.disabled = needsConfiguration || syncing;
  syncNowButton.textContent = syncing ? '동기화 중…' : '지금 동기화';
  initialSyncButton.textContent = syncing ? '기록을 가져오는 중…' : 'Chrome 전체 기록 가져오기';
}

async function message(payload) {
  return chrome.runtime.sendMessage(payload);
}

async function refresh() {
  try {
    const state = await message({ type: 'get-state' });
    latestState = state || {};
    const progress = progressSummary(latestState);
    statusElement.textContent = statusLabel(latestState);
    progressElement.textContent = progress.label;
    progressFillElement.style.width = `${progress.percentage}%`;
    progressFillElement.classList.toggle('is-syncing', latestState.status === 'syncing');
    progressTrackElement.setAttribute('aria-valuenow', String(progress.percentage));
    syncNoteElement.textContent = syncNote(latestState, progress);
    queuedElement.textContent = `${Number(latestState.queuedCount || 0).toLocaleString('ko-KR')}건`;
    lastSyncedElement.textContent = formatDate(latestState.lastSyncedAt);
    connectionNoticeElement.hidden = Boolean(latestState.configured);
    updateControls(latestState);
  } catch (error) {
    syncNoteElement.textContent = error instanceof Error ? error.message : '확장 프로그램 상태를 확인하지 못했습니다.';
  }
}

async function openOptions() {
  await chrome.runtime.openOptionsPage();
}

syncNowButton.addEventListener('click', async () => {
  if (!latestState.configured) return openOptions();
  try {
    syncNowButton.disabled = true;
    syncNowButton.textContent = '동기화 중…';
    const result = await message({ type: 'sync-now' });
    if (result?.error) throw new Error(result.error);
  } catch (error) {
    syncNoteElement.textContent = error instanceof Error ? error.message : '동기화 요청에 실패했습니다.';
  } finally {
    await refresh();
  }
});

initialSyncButton.addEventListener('click', async () => {
  if (!latestState.configured) return openOptions();
  try {
    initialSyncButton.disabled = true;
    initialSyncButton.textContent = '기록을 준비 중…';
    const result = await message({ type: 'initial-sync', days: 3650 });
    if (result?.error) throw new Error(result.error);
  } catch (error) {
    syncNoteElement.textContent = error instanceof Error ? error.message : '전체 기록 동기화를 시작하지 못했습니다.';
  } finally {
    await refresh();
  }
});

pauseButton.addEventListener('click', async () => {
  try {
    await message({ type: 'pause' });
  } finally {
    await refresh();
  }
});

openOptionsElement.addEventListener('click', () => void openOptions());
openOptionsElement.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void openOptions();
  }
});

void refresh();
window.setInterval(() => void refresh(), 1_000);
