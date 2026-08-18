const SETTINGS_KEY = 'brainOfficeSettings';
const QUEUE_KEY = 'brainOfficeHistoryQueue';
const STATE_KEY = 'brainOfficeSyncState';
const SYNC_ALARM = 'brain-office-history-sync';
const MAX_BATCH_SIZE = 500;
const MAX_QUEUE_SIZE = 5_000;
const DASHBOARD_MATCHES = ['https://amy-brain-map.vercel.app/*', 'http://localhost/*'];

const EMPTY_SETTINGS = {
  endpoint: '',
  installationToken: '',
  installationId: '',
  enabled: false,
};

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...EMPTY_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function getQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
}

async function setState(next) {
  const current = await chrome.storage.local.get(STATE_KEY);
  await chrome.storage.local.set({
    [STATE_KEY]: {
      syncedCount: 0,
      queuedCount: 0,
      ...current[STATE_KEY],
      ...next,
      updatedAt: new Date().toISOString(),
    },
  });
}

function historyItem(item) {
  if (!item || !item.url || !/^https?:\/\//i.test(item.url)) return null;
  const parsedVisitTime = Number(item.lastVisitTime);
  const lastVisitTime = Number.isFinite(parsedVisitTime) && parsedVisitTime > 0
    ? Math.floor(parsedVisitTime)
    : Date.now();
  return {
    url: item.url,
    title: (item.title || '').slice(0, 300),
    lastVisitTime,
    visitCount: Math.max(1, Math.floor(Number(item.visitCount || 1))),
  };
}

function itemKey(item) {
  return `${item.url}::${item.lastVisitTime}`;
}

async function enqueue(items) {
  const cleaned = items.map(historyItem).filter(Boolean);
  if (cleaned.length === 0) return;
  const queue = await getQueue();
  const existing = new Set(queue.map(itemKey));
  for (const item of cleaned) {
    if (!existing.has(itemKey(item))) {
      queue.push(item);
      existing.add(itemKey(item));
    }
  }
  const compacted = queue.slice(-MAX_QUEUE_SIZE);
  await chrome.storage.local.set({ [QUEUE_KEY]: compacted });
  await setState({ queuedCount: compacted.length });
}

function apiUrl(endpoint, path) {
  return `${endpoint.replace(/\/$/, '')}${path}`;
}

function isSupportedDashboard(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.origin === 'https://amy-brain-map.vercel.app' || url.origin === 'http://localhost:3000';
  } catch {
    return false;
  }
}

async function registerDashboardBridge() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['amy-brain-map-dashboard-bridge'] });
  } catch {
    // The bridge is not registered yet.
  }
  await chrome.scripting.registerContentScripts([{
    id: 'amy-brain-map-dashboard-bridge',
    matches: DASHBOARD_MATCHES,
    js: ['src/dashboard-bridge.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true,
  }]);
}

async function exchangeConnectCode(endpoint, connectCode, installationId) {
  const response = await fetch(apiUrl(endpoint, '/api/unconscious/extension/connect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectCode, installationId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.installationToken) {
    throw new Error(payload.error || `자동 연결 요청이 실패했습니다 (${response.status}).`);
  }
  return payload.installationToken;
}

async function connectFromDashboard(endpoint, connectCode) {
  const normalizedEndpoint = String(endpoint || '').trim().replace(/\/$/, '');
  const normalizedCode = String(connectCode || '').trim().toUpperCase();
  if (!isSupportedDashboard(normalizedEndpoint)) throw new Error('지원되지 않는 Amy Brain Map 대시보드 주소입니다.');
  if (!/^ABM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizedCode)) throw new Error('대시보드의 자동 연결 권한을 확인하지 못했습니다. 웹 페이지를 새로고침한 뒤 다시 시도하세요.');

  const current = await getSettings();
  const installationId = current.installationId || crypto.randomUUID();
  const installationToken = await exchangeConnectCode(normalizedEndpoint, normalizedCode, installationId);
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      ...current,
      endpoint: normalizedEndpoint,
      installationId,
      installationToken,
      enabled: true,
    },
  });
  await registerDashboardBridge();
  await setState({ status: 'ready', lastError: '' });
  return { installationId };
}

async function uploadBatch(settings, visits) {
  const response = await fetch(apiUrl(settings.endpoint, '/api/unconscious/visits'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-brain-installation-token': settings.installationToken,
    },
    body: JSON.stringify({ installationId: settings.installationId, visits }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `동기화 요청이 실패했습니다 (${response.status}).`);
  }
}

function configuredForSync(settings) {
  return Boolean(settings.enabled && settings.endpoint && settings.installationToken && settings.installationId);
}

async function syncPending() {
  const settings = await getSettings();
  const queue = await getQueue();
  if (!configuredForSync(settings)) {
    await setState({ queuedCount: queue.length, status: 'needs_configuration' });
    return { synced: 0, queued: queue.length, configured: false };
  }
  if (queue.length === 0) {
    await setState({ queuedCount: 0, status: 'idle' });
    return { synced: 0, queued: 0, configured: true };
  }

  const batch = queue.slice(0, MAX_BATCH_SIZE);
  await setState({ queuedCount: queue.length, status: 'syncing', lastError: '' });
  try {
    await uploadBatch(settings, batch);
    const remaining = queue.slice(batch.length);
    await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
    await setState({
      syncedCount: batch.length,
      queuedCount: remaining.length,
      status: remaining.length > 0 ? 'queued' : 'idle',
      lastSyncedAt: new Date().toISOString(),
      lastError: '',
    });
    if (remaining.length > 0) return syncPending();
    return { synced: batch.length, queued: 0, configured: true };
  } catch (error) {
    await setState({ queuedCount: queue.length, status: 'error', lastError: error instanceof Error ? error.message : '동기화 중 알 수 없는 오류가 발생했습니다.' });
    return { synced: 0, queued: queue.length, configured: true, error: String(error) };
  }
}

async function syncInitialHistory(days = 3650) {
  const settings = await getSettings();
  if (!configuredForSync(settings)) {
    await setState({ status: 'needs_configuration' });
    return { synced: 0, queued: 0, configured: false, error: '웹 대시보드에서 Chrome 기록 가져오기를 눌러 자동 연결을 시작해 주세요.' };
  }
  const startTime = Date.now() - Math.max(1, Math.min(days, 3650)) * 24 * 60 * 60 * 1000;
  const rawRecords = await chrome.history.search({ text: '', startTime, maxResults: 100000 });
  const records = rawRecords.map(historyItem).filter(Boolean);
  const total = records.length;
  let synced = 0;
  await setState({ syncedCount: 0, queuedCount: total, totalCount: total, status: 'syncing', lastError: '' });

  try {
    for (let start = 0; start < total; start += MAX_BATCH_SIZE) {
      const batch = records.slice(start, start + MAX_BATCH_SIZE);
      await uploadBatch(settings, batch);
      synced += batch.length;
      await setState({ syncedCount: synced, queuedCount: total - synced, totalCount: total, status: 'syncing', lastError: '' });
    }
    await setState({ syncedCount: synced, queuedCount: 0, totalCount: total, status: 'idle', lastSyncedAt: new Date().toISOString(), lastError: '' });
    return { synced, queued: 0, queuedFromHistory: total, configured: true };
  } catch (error) {
    await setState({ syncedCount: synced, queuedCount: total - synced, totalCount: total, status: 'error', lastError: error instanceof Error ? error.message : '동기화 중 알 수 없는 오류가 발생했습니다.' });
    return { synced, queued: total - synced, queuedFromHistory: total, configured: true, error: String(error) };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  await registerDashboardBridge();
  const settings = await getSettings();
  await setState({ status: settings.enabled ? 'ready' : 'paused' });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 30 });
  await registerDashboardBridge();
  await syncPending();
});

chrome.history.onVisited.addListener(async (item) => {
  await enqueue([item]);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SYNC_ALARM) await syncPending();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'get-state') {
      const state = await chrome.storage.local.get(STATE_KEY);
      const settings = await getSettings();
      sendResponse({ ...(state[STATE_KEY] || {}), configured: Boolean(settings.endpoint && settings.installationToken), enabled: settings.enabled });
      return;
    }
    if (message.type === 'auto-connect-and-initial-sync') {
      await connectFromDashboard(message.endpoint, message.connectCode);
      sendResponse({ success: true, started: true });
      await syncInitialHistory(Number(message.days || 3650));
      return;
    }
    if (message.type === 'initial-sync') {
      sendResponse({ success: true, started: true });
      await syncInitialHistory(Number(message.days || 3650));
      return;
    }
    if (message.type === 'sync-now') {
      sendResponse(await syncPending());
      return;
    }
    if (message.type === 'pause') {
      const settings = await getSettings();
      await chrome.storage.local.set({ [SETTINGS_KEY]: { ...settings, enabled: false } });
      await setState({ status: 'paused' });
      sendResponse({ success: true });
      return;
    }
    sendResponse({ error: 'Unknown request.' });
  })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
