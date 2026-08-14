import { NextRequest, NextResponse } from 'next/server';
import { requireHistoryToken } from '@/lib/unconscious-auth';
import {
  AnalysisRun,
  BrowserVisit,
  CandidateKind,
  DiscoveryCandidate,
  createId,
  isDomainBlocked,
  loadUnconsciousStore,
  updateUnconsciousStore,
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
  const terms = source
    .split(/[\s-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 28 && !STOP_WORDS.has(term));
  return [...new Set(terms)].slice(0, 8);
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
    const subject = humanLabel(term);
    const sourceDomains = [...signal.domains].slice(0, 5);
    result.push({
      id: createId('candidate'),
      kind: 'interest',
      subject,
      relation: '반복적으로 탐색함',
      object: sourceDomains.join(' · '),
      confidence,
      status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
      evidence: [`${uniqueUrls}개 페이지에서 총 ${signal.totalVisitCount}회 방문 기록이 감지되었습니다.`, `출처 도메인: ${sourceDomains.join(', ')}`],
      sourceVisitIds: [...new Set(signal.visits.map((visit) => visit.id))].slice(0, 12),
      sourceDomains,
      createdAt: now,
      updatedAt: now,
      analysisRunId: runId,
    });
  }

  // Short sessions often reveal tacit bridges between otherwise separate topics.
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
    const subject = humanLabel(leftTerm);
    const object = humanLabel(rightTerm);
    result.push({
      id: createId('candidate'),
      kind: 'bridge',
      subject,
      relation: '같은 탐색 흐름에서 연결됨',
      object,
      confidence: 0.58,
      status: 'pending',
      evidence: [`${Math.round(gap / 60000)}분 이내에 ${left.domain} → ${right.domain} 순서로 탐색했습니다.`],
      sourceVisitIds: [left.id, right.id],
      sourceDomains: [left.domain, right.domain],
      createdAt: now,
      updatedAt: now,
      analysisRunId: runId,
    });
  }

  const kindOrder: Record<CandidateKind, number> = { interest: 0, revisit: 1, bridge: 2 };
  return result
    .sort((a, b) => b.confidence - a.confidence || kindOrder[a.kind] - kindOrder[b.kind])
    .slice(0, 30);
}

function publicCandidate(candidate: DiscoveryCandidate) {
  return {
    ...candidate,
    confidence: Number(candidate.confidence.toFixed(2)),
  };
}

export async function POST(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const result = await updateUnconsciousStore((store) => {
      const now = new Date().toISOString();
      const runId = createId('analysis');
      const run: AnalysisRun = { id: runId, startedAt: now, visitCount: 0, candidateCount: 0, status: 'running' };
      store.analysisRuns.unshift(run);
      const since = store.settings.lastAnalyzedAt ? Date.parse(store.settings.lastAnalyzedAt) : 0;
      const eligible = store.visits
        .filter((visit) => visit.lastVisitTime > since && !isDomainBlocked(visit.domain, store.policies))
        .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
        .slice(0, store.settings.maxVisitsPerRun);
      run.visitCount = eligible.length;

      const generated = createCandidates(eligible, runId, now, store.settings.autoApplyThreshold);
      const previousKeys = new Set(store.candidates.map((candidate) => `${candidate.subject}|${candidate.relation}|${candidate.object}`));
      const candidates = generated.filter((candidate) => !previousKeys.has(`${candidate.subject}|${candidate.relation}|${candidate.object}`));
      store.candidates.unshift(...candidates);
      run.candidateCount = candidates.length;
      run.status = 'completed';
      run.completedAt = new Date().toISOString();
      store.settings.lastAnalyzedAt = run.completedAt;
      store.analysisRuns = store.analysisRuns.slice(0, 100);
      return { run, candidates: candidates.map(publicCandidate), analyzedVisits: eligible.length };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Browsing-history analysis failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Browsing-history analysis failed.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const params = new URL(request.url).searchParams;
    const requestedStatus = params.get('status');
    const limit = Math.max(1, Math.min(Number(params.get('limit') || 50), 200));
    const store = await loadUnconsciousStore();
    const candidates = store.candidates
      .filter((candidate) => !requestedStatus || candidate.status === requestedStatus)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map(publicCandidate);
    return NextResponse.json({ candidates, recentRuns: store.analysisRuns.slice(0, 10), lastAnalyzedAt: store.settings.lastAnalyzedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load discovery candidates.' }, { status: 500 });
  }
}
