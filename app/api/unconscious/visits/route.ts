import { NextRequest, NextResponse } from 'next/server';
import { requireHistoryToken } from '@/lib/unconscious-auth';
import {
  BrowserVisit,
  createId,
  canCollectContent,
  isDomainBlocked,
  loadUnconsciousStore,
  normalizeUrl,
  pruneExpiredData,
  updateUnconsciousStore,
} from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

const MAX_BATCH_SIZE = 1_000;
const MAX_TITLE_LENGTH = 300;

interface IncomingVisit {
  url?: unknown;
  title?: unknown;
  lastVisitTime?: unknown;
  visitCount?: unknown;
}

function parseVisit(input: IncomingVisit): Omit<BrowserVisit, 'id' | 'installationId' | 'receivedAt' | 'updatedAt' | 'contentStatus'> | null {
  if (typeof input.url !== 'string' || input.url.length > 8_000) return null;
  const normalized = normalizeUrl(input.url);
  if (!normalized) return null;

  const lastVisitTime = typeof input.lastVisitTime === 'number' && Number.isFinite(input.lastVisitTime)
    ? input.lastVisitTime
    : Date.now();
  const visitCount = typeof input.visitCount === 'number' && Number.isFinite(input.visitCount)
    ? Math.max(1, Math.min(Math.floor(input.visitCount), 1_000_000))
    : 1;

  return {
    ...normalized,
    url: input.url,
    title: typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : '',
    lastVisitTime,
    visitCount,
  };
}

export async function POST(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const payload = await request.json() as { installationId?: unknown; visits?: unknown[] };
    const installationId = typeof payload.installationId === 'string' ? payload.installationId.trim().slice(0, 120) : '';
    if (!installationId || !Array.isArray(payload.visits)) {
      return NextResponse.json({ error: 'installationId and visits[] are required.' }, { status: 400 });
    }
    const visits = payload.visits;
    if (visits.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `A request can include at most ${MAX_BATCH_SIZE} history items.` }, { status: 413 });
    }

    const parsed = visits.map((visit) => parseVisit((visit || {}) as IncomingVisit)).filter((visit): visit is NonNullable<typeof visit> => Boolean(visit));
    const now = new Date().toISOString();

    const result = await updateUnconsciousStore((store) => {
      pruneExpiredData(store);
      const existing = new Map(store.visits.map((visit) => [`${visit.installationId}:${visit.normalizedUrl}`, visit]));
      let created = 0;
      let updated = 0;
      let blocked = 0;

      for (const item of parsed) {
        const contentStatus = isDomainBlocked(item.domain, store.policies)
          ? 'blocked'
          : canCollectContent(item.domain, store.policies)
            ? 'eligible'
            : 'metadata_only';
        if (contentStatus === 'blocked') blocked += 1;

        const key = `${installationId}:${item.normalizedUrl}`;
        const present = existing.get(key);
        if (present) {
          present.title = item.title || present.title;
          present.url = item.url;
          present.lastVisitTime = Math.max(present.lastVisitTime, item.lastVisitTime);
          present.visitCount = Math.max(present.visitCount, item.visitCount);
          present.contentStatus = contentStatus;
          present.updatedAt = now;
          updated += 1;
        } else {
          const createdVisit: BrowserVisit = {
            id: createId('visit'),
            installationId,
            ...item,
            receivedAt: now,
            updatedAt: now,
            contentStatus,
          };
          store.visits.push(createdVisit);
          existing.set(key, createdVisit);
          created += 1;
        }
      }
      store.settings.lastSyncedAt = now;
      return { received: visits.length, accepted: parsed.length, created, updated, blocked, lastSyncedAt: now };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Failed to ingest browsing-history batch:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ingest browsing history.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const limit = Math.max(1, Math.min(Number(new URL(request.url).searchParams.get('limit') || 50), 500));
    const store = await loadUnconsciousStore();
    const visits = [...store.visits]
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      .slice(0, limit)
      .map((visit) => ({
        id: visit.id,
        domain: visit.domain,
        title: visit.title,
        lastVisitTime: visit.lastVisitTime,
        visitCount: visit.visitCount,
        contentStatus: visit.contentStatus,
      }));

    return NextResponse.json({ visits, total: store.visits.length, lastSyncedAt: store.settings.lastSyncedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read browsing history.' }, { status: 500 });
  }
}
