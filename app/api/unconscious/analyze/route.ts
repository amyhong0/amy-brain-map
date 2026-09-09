import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { isAuthenticationDomain, isAuthenticationVisit } from '@/lib/unconscious-visit-filter';
import { createBackupIfDue } from '@/lib/gcs-archive';
import {
  AnalysisRun,
  DiscoveryCandidate,
  completeAnalysisRun,
  failAnalysisRun,
  insertDiscoveryCandidates,
  isDomainBlocked,
  listCandidates,
  listRecentAnalysisRuns,
  loadUnconsciousStore,
  pruneExpiredData,
  startAnalysisRun,
} from '@/lib/utils/unconscious-storage';
import {
  sessionizeVisits,
  extractTripletsWithLLM,
} from '@/lib/unconscious-kg-engine';

export const runtime = 'nodejs';

function publicCandidate(candidate: DiscoveryCandidate) {
  return { ...candidate, confidence: Number(candidate.confidence.toFixed(2)) };
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  const userId = auth.user.id;
  let run: AnalysisRun | null = null;

  try {
    const store = await loadUnconsciousStore(userId);
    await pruneExpiredData(userId, store.settings.retentionDays);
    run = await startAnalysisRun(userId);
    const eligible = store.visits
      .filter((visit) => visit.lastVisitTime > (store.settings.lastAnalyzedAt ? Date.parse(store.settings.lastAnalyzedAt) : 0))
      .filter((visit) => !isDomainBlocked(visit.domain, store.policies))
      .filter((visit) => !isAuthenticationVisit(visit))
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      .slice(0, store.settings.maxVisitsPerRun);

    // 1. Sessionize chronological browsing visits
    const sessions = sessionizeVisits(eligible);

    // 2. Extract rich knowledge triplets via NVIDIA AI API (or fallback rule engine)
    const apiKey = process.env.NVIDIA_API_KEY?.trim() || '';
    const now = new Date().toISOString();
    const extraction = await extractTripletsWithLLM(sessions, apiKey, store.settings.autoApplyThreshold, run.id, now);

    // 3. Persist discovery candidates
    const candidates = await insertDiscoveryCandidates(userId, extraction.candidates);
    const completedRun = await completeAnalysisRun(userId, run.id, eligible.length, candidates.length);
    let backup: { created: boolean; archiveId?: string } | { created: false; unavailable: true } = { created: false, unavailable: true };
    try {
      backup = await createBackupIfDue(userId);
    } catch (backupError) {
      // Backups must never block a user's private graph update. Configuration errors stay observable in server logs.
      console.error('GCS backup was skipped:', backupError);
    }
    return NextResponse.json({
      success: true,
      run: completedRun,
      candidates: candidates.map(publicCandidate),
      analyzedVisits: eligible.length,
      sessionCount: extraction.sessionCount,
      usedLLM: extraction.usedLLM,
      backup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browsing-history analysis failed.';
    if (run) await failAnalysisRun(userId, run.id, message);
    console.error('Browsing-history analysis failed:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const requestedStatus = request.nextUrl.searchParams.get('status');
    const status = requestedStatus === 'pending' || requestedStatus === 'approved' || requestedStatus === 'rejected' || requestedStatus === 'auto_applied'
      ? requestedStatus : undefined;
    const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get('limit') || 50), 200));
    const [candidates, recentRuns, settings] = await Promise.all([
      listCandidates(auth.user.id, status, limit),
      listRecentAnalysisRuns(auth.user.id, 10),
      loadUnconsciousStore(auth.user.id).then((store) => store.settings),
    ]);
    const displayCandidates = candidates.filter((candidate) => candidate.sourceDomains.every((domain) => !isAuthenticationDomain(domain)));
    return NextResponse.json({ candidates: displayCandidates.map(publicCandidate), recentRuns, lastAnalyzedAt: settings.lastAnalyzedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load discovery candidates.' }, { status: 500 });
  }
}
