import { NextRequest, NextResponse } from 'next/server';
import { requireExtensionInstallation, requireUser } from '@/lib/unconscious-auth';
import { countBrowserVisits, getRecentVisits, ingestBrowserVisits, normalizeUrl, safeVisitView } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

const MAX_BATCH_SIZE = 1_000;
const MAX_TITLE_LENGTH = 300;

interface IncomingVisit {
  url?: unknown;
  title?: unknown;
  lastVisitTime?: unknown;
  visitCount?: unknown;
}

function parseVisit(input: IncomingVisit) {
  if (typeof input.url !== 'string' || input.url.length > 8_000) return null;
  const normalized = normalizeUrl(input.url);
  if (!normalized) return null;
  return {
    ...normalized,
    url: input.url,
    title: typeof input.title === 'string' ? input.title.trim().slice(0, MAX_TITLE_LENGTH) : '',
    lastVisitTime: typeof input.lastVisitTime === 'number' && Number.isFinite(input.lastVisitTime)
      ? Math.max(0, Math.floor(input.lastVisitTime))
      : Date.now(),
    visitCount: typeof input.visitCount === 'number' && Number.isFinite(input.visitCount)
      ? Math.max(1, Math.min(Math.floor(input.visitCount), 1_000_000))
      : 1,
  };
}

/** Receives metadata-only history batches from an already enrolled extension installation. */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { installationId?: unknown; visits?: unknown[] };
    const installationId = typeof payload.installationId === 'string' ? payload.installationId.trim().slice(0, 120) : '';
    if (!installationId || !Array.isArray(payload.visits)) {
      return NextResponse.json({ error: 'installationId and visits[] are required.' }, { status: 400 });
    }
    if (payload.visits.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `A request can include at most ${MAX_BATCH_SIZE} history items.` }, { status: 413 });
    }

    const extensionAuth = await requireExtensionInstallation(request, installationId);
    if ('response' in extensionAuth) return extensionAuth.response;
    const parsed = payload.visits
      .map((visit) => parseVisit((visit || {}) as IncomingVisit))
      .filter((visit): visit is NonNullable<typeof visit> => Boolean(visit));
    const result = await ingestBrowserVisits(
      extensionAuth.installation.userId,
      extensionAuth.installation.installationRecordId,
      extensionAuth.installation.installationId,
      parsed,
    );

    return NextResponse.json({
      success: true,
      received: payload.visits.length,
      accepted: parsed.length,
      ...result,
    });
  } catch (error) {
    console.error('Failed to ingest browsing-history batch:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to ingest browsing history.' }, { status: 500 });
  }
}

/** Returns only the currently signed-in user's recent history metadata. */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get('limit') || 50), 500));
    const [visits, total] = await Promise.all([getRecentVisits(auth.user.id, limit), countBrowserVisits(auth.user.id)]);
    return NextResponse.json({
      visits: visits.map(safeVisitView),
      total,
      lastSyncedAt: visits[0]?.updatedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read browsing history.' }, { status: 500 });
  }
}
