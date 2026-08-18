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
    expect(result.answer).not.toContain('단어 조각이 아니라');
    expect(result.trace.find((entry) => entry.agent === '질문 해석자')?.summary).toContain('반복 관심 탐색');
  });
});


describe('time-flow and web-search states', () => {
  beforeEach(() => {
    process.env.NVIDIA_API_KEY = '';
    process.env.TAVILY_API_KEY = '';
  });

  it('answers peak-activity questions from dated visit signals rather than matching question words', async () => {
    const strongestDay = visit({
      id: 'visit-peak-day',
      normalizedUrl: 'https://example.com/project-review',
      url: 'https://example.com/project-review',
      title: '프로젝트 검토 노트',
      domain: 'example.com',
      visitCount: 9,
      lastVisitTime: now - 24 * 60 * 60 * 1000,
    });
    const quieterDay = visit({
      id: 'visit-quiet-day',
      normalizedUrl: 'https://example.com/reference',
      url: 'https://example.com/reference',
      title: '참고 자료',
      domain: 'example.com',
      visitCount: 2,
      lastVisitTime: now,
    });

    const result = await runUnconsciousQuery('이 관심이 가장 활발했던 시점은 언제야?', [strongestDay, quieterDay], [], false);

    expect(result.answer).toContain('가장 활발했던 시점');
    expect(result.answer).toContain('프로젝트 검토 노트');
    expect(result.answer).not.toContain('직접 맞는 방문 흔적을 찾지 못했습니다');
    expect(result.trace.find((entry) => entry.agent === '질문 해석자')?.summary).toContain('활동 시점 탐색');
  });

  it('returns explicit web-search request state when external search is not configured', async () => {
    const result = await runUnconsciousQuery('개인 기록에 없는 새로운 주제', [], [], true);

    expect(result.webSearchRequested).toBe(true);
    expect(result.webSearchAttempted).toBe(true);
    expect(result.webSearchConfigured).toBe(false);
    expect(result.webSearchUsed).toBe(false);
  });
});


describe('private-history-only responses', () => {
  beforeEach(() => {
    process.env.NVIDIA_API_KEY = 'should-not-be-called-for-private-history';
    process.env.TAVILY_API_KEY = '';
  });

  it('finds a semantically related yesterday visit without using web search when the toggle is off', async () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const todayStart = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+09:00`).getTime();
    const yesterdayNoon = todayStart - 12 * 60 * 60 * 1000;
    const bootcamp = visit({
      id: 'visit-openai-bootcamp',
      normalizedUrl: 'https://academy.openai.com/api-builder-bootcamp',
      url: 'https://academy.openai.com/api-builder-bootcamp',
      title: 'OpenAI API Builder Bootcamp',
      domain: 'academy.openai.com',
      visitCount: 2,
      lastVisitTime: yesterdayNoon,
    });

    const result = await runUnconsciousQuery('내가 어제 본 것 중에 AI 콘텐츠 제작 관련된 게 뭐더라?', [bootcamp], [], false);

    expect(result.matchedVisits).toHaveLength(1);
    expect(result.matchedVisits[0].id).toBe('visit-openai-bootcamp');
    expect(result.answer).toContain('OpenAI API Builder Bootcamp');
    expect(result.answer).not.toContain('웹 검색으로 보강한 답변');
    expect(result.webSearchRequested).toBe(false);
    expect(result.webSearchAttempted).toBe(false);
    expect(result.webSearchUsed).toBe(false);
  });
});


describe('private-history summaries and map grounding', () => {
  beforeEach(() => {
    process.env.NVIDIA_API_KEY = '';
    process.env.TAVILY_API_KEY = '';
  });

  it('deduplicates matching pages and highlights a candidate grounded by the same domain', async () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const yesterdayNoon = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+09:00`).getTime() - 12 * 60 * 60 * 1000;
    const firstBootcamp = visit({
      id: 'visit-bootcamp-1',
      normalizedUrl: 'https://academy.openai.com/api-builder-bootcamp',
      url: 'https://academy.openai.com/api-builder-bootcamp',
      title: 'API Builder Bootcamp - Resource | OpenAI Academy',
      domain: 'academy.openai.com',
      visitCount: 2,
      lastVisitTime: yesterdayNoon,
    });
    const repeatedBootcamp = visit({ ...firstBootcamp, id: 'visit-bootcamp-2', visitCount: 1, lastVisitTime: yesterdayNoon + 30 * 60 * 1000 });
    const academyCandidate = candidate({
      id: 'candidate-openai-academy',
      subject: 'AI 도구 학습',
      sourceVisitIds: ['other-openai-visit'],
      sourceDomains: ['academy.openai.com'],
    });

    const result = await runUnconsciousQuery('내가 어제 본 것 중에 AI 콘텐츠 제작 관련된 게 뭐더라?', [firstBootcamp, repeatedBootcamp], [academyCandidate], false);

    expect(result.matchedVisits).toHaveLength(1);
    expect(result.matchedVisits[0].visitCount).toBe(3);
    expect(result.answer.match(/API Builder Bootcamp/g)).toHaveLength(1);
    expect(result.answer).toContain('AI 콘텐츠 제작');
    expect(result.highlightedCandidateIds).toEqual(['candidate-openai-academy']);
  });
});
