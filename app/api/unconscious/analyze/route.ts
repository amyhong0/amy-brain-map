import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { createBackupIfDue } from '@/lib/gcs-archive';
import {
  AnalysisRun,
  BrowserVisit,
  CandidateKind,
  DiscoveryCandidate,
  completeAnalysisRun,
  createId,
  failAnalysisRun,
  insertDiscoveryCandidates,
  isDomainBlocked,
  listCandidates,
  listRecentAnalysisRuns,
  loadUnconsciousStore,
  pruneExpiredData,
  startAnalysisRun,
} from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'new', 'www', 'com', 'org',
  'https', 'http', '대한', '위한', '있는', '없는', '대한민국', '그리고', '하지만', '에서', '으로', '하는', '하기', '정보',
  '뉴스', '홈', '로그인', '검색', '페이지', '서비스', '공식', '블로그', '게시물', '더보기', '보기', '관련', '오늘',
]);

function termsFromVisit(visit: BrowserVisit): string[] {
  const source = `${visit.title} ${visit.domain}`
    .toLocaleLowerCase('ko-KR')
    .replace(/https?:\/\//g, ' ')
    .replace(/[^a-z0-9가-힣\s-]/gi, ' ');
  return [...new Set(source
    .split(/[\s-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 28 && !STOP_WORDS.has(term)))]
    .slice(0, 8);
}

function humanLabel(term: string): string {
  return term.replace(/(^|\s)\S/g, (value) => value.toUpperCase());
}

function createCandidates(visits: BrowserVisit[], runId: string, now: string, autoApplyThreshold: number): DiscoveryCandidate[] {
  const signals = new Map<string, { visits: BrowserVisit[]; domains: Set<string>; totalVisitCount: number }>();
  for (const visit of visits) {
    for (const term of termsFromVisit(visit)) {
      const signal = signals.get(term) || { visits: [], domains: new Set<string>(), totalVisitCount: 0 };
      signal.visits.push(visit);
      signal.domains.add(visit.domain);
      signal.totalVisitCount += visit.visitCount;
      signals.set(term, signal);
    }
  }

  const result: DiscoveryCandidate[] = [];
  for (const [term, signal] of signals) {
    const uniqueUrls = new Set(signal.visits.map((visit) => visit.normalizedUrl)).size;
    const isRepeated = uniqueUrls >= 2 || signal.totalVisitCount >= 3;
    if (!isRepeated) continue;
    const confidence = Math.min(0.84, 0.45 + uniqueUrls * 0.08 + Math.min(signal.totalVisitCount, 8) * 0.025 + Math.min(signal.domains.size, 4) * 0.04);
    const sourceDomains = [...signal.domains].slice(0, 5);
    result.push({
      id: createId('candidate'), kind: 'interest', subject: humanLabel(term), relation: '반복적으로 탐색함', object: sourceDomains.join(' · '),
      confidence, status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
      evidence: [`${uniqueUrls}개 페이지에서 총 ${signal.totalVisitCount}회 방문 기록이 감지되었습니다.`, `출처 도메인: ${sourceDomains.join(', ')}`],
      sourceVisitIds: [...new Set(signal.visits.map((visit) => visit.id))].slice(0, 12), sourceDomains, createdAt: now, updatedAt: now, analysisRunId: runId,
    });
  }

  const chronological = [...visits].sort((a, b) => a.lastVisitTime - b.lastVisitTime);
  const bridgeSeen = new Set<string>();
  for (let index = 0; index < chronological.length - 1; index += 1) {
    const left = chronological[index];
    const right = chronological[index + 1];
    const gap = right.lastVisitTime - left.lastVisitTime;
    if (gap < 0 || gap > 30 * 60 * 1000 || left.domain === right.domain) continue;
    const leftTerm = termsFromVisit(left)[0];
    const rightTerm = termsFromVisit(right)[0];
    if (!leftTerm || !rightTerm || leftTerm === rightTerm) continue;
    const key = [leftTerm, rightTerm].sort().join('::');
    if (bridgeSeen.has(key)) continue;
    bridgeSeen.add(key);
    result.push({
      id: createId('candidate'), kind: 'bridge', subject: humanLabel(leftTerm), relation: '같은 탐색 흐름에서 연결됨', object: humanLabel(rightTerm),
      confidence: 0.58, status: 'pending',
      evidence: [`${Math.round(gap / 60000)}분 이내에 ${left.domain} → ${right.domain} 순서로 탐색했습니다.`],
      sourceVisitIds: [left.id, right.id], sourceDomains: [left.domain, right.domain], createdAt: now, updatedAt: now, analysisRunId: runId,
    });
  }

  const kindOrder: Record<CandidateKind, number> = { interest: 0, revisit: 1, bridge: 2 };
  return result.sort((a, b) => b.confidence - a.confidence || kindOrder[a.kind] - kindOrder[b.kind]).slice(0, 30);
}

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
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      .slice(0, store.settings.maxVisitsPerRun);
    const generated = createCandidates(eligible, run.id, new Date().toISOString(), store.settings.autoApplyThreshold);
    const candidates = await insertDiscoveryCandidates(userId, generated);
    const completedRun = await completeAnalysisRun(userId, run.id, eligible.length, candidates.length);
    let backup: { created: boolean; archiveId?: string } | { created: false; unavailable: true } = { created: false, unavailable: true };
    try {
      backup = await createBackupIfDue(userId);
    } catch (backupError) {
      // Backups must never block a user's private graph update. Configuration errors stay observable in server logs.
      console.error('GCS backup was skipped:', backupError);
    }
    return NextResponse.json({ success: true, run: completedRun, candidates: candidates.map(publicCandidate), analyzedVisits: eligible.length, backup });
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
    return NextResponse.json({ candidates: candidates.map(publicCandidate), recentRuns, lastAnalyzedAt: settings.lastAnalyzedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load discovery candidates.' }, { status: 500 });
  }
}
