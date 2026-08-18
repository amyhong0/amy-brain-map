import { runUnconsciousQuery } from './unconscious-agents';
import { BrowserVisit, DiscoveryCandidate } from './utils/unconscious-storage';

const now = Date.now();

function visit(overrides: Partial<BrowserVisit> = {}): BrowserVisit {
  return {
    id: 'visit-ai-1',
    installationId: 'chrome-test',
    normalizedUrl: 'https://example.com/ai-content',
    url: 'https://example.com/ai-content',
    title: 'AI 콘텐츠 제작 워크플로우',
    domain: 'example.com',
    lastVisitTime: now,
    visitCount: 3,
    receivedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    contentStatus: 'metadata_only',
    ...overrides,
  };
}

function candidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    id: 'candidate-ai-1',
    kind: 'interest',
    subject: 'AI',
    relation: '반복적으로 탐색함',
    object: 'example.com',
    confidence: 0.82,
    status: 'pending',
    evidence: ['AI 콘텐츠 제작 주제를 3회 방문했습니다.'],
    sourceVisitIds: ['visit-ai-1'],
    sourceDomains: ['example.com'],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    analysisRunId: 'analysis-1',
    ...overrides,
  };
}

describe('runUnconsciousQuery', () => {
  beforeEach(() => {
    process.env.NVIDIA_API_KEY = '';
    process.env.TAVILY_API_KEY = '';
  });

  it('retrieves personal visit evidence and only highlights a candidate backed by the same visit', async () => {
    const result = await runUnconsciousQuery('AI 콘텐츠 제작 관련해서 내가 본 건 뭐야?', [visit()], [candidate()], false);

    expect(result.matchedVisits).toHaveLength(1);
    expect(result.matchedVisits[0].id).toBe('visit-ai-1');
    expect(result.highlightedCandidateIds).toEqual(['candidate-ai-1']);
    expect(result.trace.find((entry) => entry.agent === '관계 검증자')?.summary).toContain('교차 확인된 1개');
  });

  it('does not highlight an ungrounded relationship when the memory retriever finds no matching visit', async () => {
    const result = await runUnconsciousQuery('양자 컴퓨팅 관련 자료가 뭐야?', [visit()], [candidate({ subject: '양자', sourceVisitIds: ['missing-visit'] })], false);

    expect(result.matchedVisits).toHaveLength(0);
    expect(result.highlightedCandidateIds).toHaveLength(0);
  });

  it('interprets a recent recurring-topic question without treating generic question words as search keywords', async () => {
    const result = await runUnconsciousQuery('최근 일주일 동안 반복해서 본 주제는 뭐야?', [visit({ visitCount: 5 })], [candidate()], false);

    expect(result.matchedVisits).toHaveLength(1);
    expect(result.highlightedCandidateIds).toEqual(['candidate-ai-1']);
    expect(result.answer).toContain('반복적으로 나타난 관심');
    expect(result.answer).toContain('AI 콘텐츠 제작 워크플로우');
    expect(result.answer).toContain('관련 페이지:');
    expect(result.answer).not.toContain('직접 맞는 방문 흔적을 찾지 못했습니다');
    expect(result.trace.find((entry) => entry.agent === '질문 해석자')?.summary).toContain('반복 관심 탐색');
  });
});
