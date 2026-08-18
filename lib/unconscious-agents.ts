import { BrowserVisit, DiscoveryCandidate } from '@/lib/utils/unconscious-storage';
import { searchWebForAnswer, WebSearchSource } from '@/lib/web-search';

export interface AgentTrace {
  agent: '질문 해석자' | '기억 탐색자' | '시간 해석자' | '관계 검증자' | '웹 정찰자' | '지도 항해자' | '응답 구성자';
  status: 'completed' | 'fallback';
  summary: string;
}

type QueryMode = 'keyword' | 'recurring_topics' | 'connections' | 'recent_activity' | 'peak_activity';

interface QueryIntent {
  terms: string[];
  period: { start: number; end: number; label: string } | null;
  mode: QueryMode;
}

interface ScoredVisit {
  visit: BrowserVisit;
  score: number;
}

const QUERY_STOP_WORDS = new Set([
  '내가', '내', '것', '중', '관련', '관련된', '뭐', '뭐더라', '무엇', '뭐야', '언제', '언제야', '어제', '오늘', '최근', '지난', '이번', '일주일', '동안', '본', '봤', '보았', '열어본', '읽은', '찾아', '알려', '질문', '콘텐츠', '내용', '대해', '에서', '으로', '그리고', '있는', '없는', '주제', '관심', '반복', '반복해서', '자주', '흐름', '연결', '가장', '활발', '활발했', '활발했던', '시점', '때', '기간', 'the', 'and', 'what', 'did', 'i', 'see',
]);

function koreanDayStart(dayOffset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.getTime();
}

function normalizeQueryTerm(term: string) {
  return term.replace(/(으로|에서|에게|부터|까지|처럼|보다|은|는|이|가|을|를|와|과|의|에|도|만)$/u, '');
}

function parseIntent(message: string): QueryIntent {
  const normalized = message.toLocaleLowerCase('ko-KR');
  const mode: QueryMode = /가장\s*활발|활발했|활발했던|언제.*시점|시점.*언제/.test(normalized)
    ? 'peak_activity'
    : /반복|자주|되풀이|관심사|관심 주제/.test(normalized)
      ? 'recurring_topics'
      : /연결|함께|관계|이어/.test(normalized)
      ? 'connections'
      : /최근|어제|오늘|이번\s?주|지난\s?7일|일주일/.test(normalized)
        ? 'recent_activity'
        : 'keyword';
  const terms = normalized
    .replace(/[^a-z0-9가-힣\s]/gi, ' ')
    .split(/\s+/)
    .map((term) => normalizeQueryTerm(term.trim()))
    .filter((term) => term.length >= 2 && !QUERY_STOP_WORDS.has(term));
  let period: QueryIntent['period'] = null;
  const todayStart = koreanDayStart(0);
  if (/어제|yesterday/i.test(normalized)) period = { start: koreanDayStart(-1), end: todayStart, label: '어제' };
  else if (/오늘|today/i.test(normalized)) period = { start: todayStart, end: todayStart + 24 * 60 * 60 * 1000, label: '오늘' };
  else if (/이번\s?주|지난\s?7일|최근\s?일주일|this week|last week/i.test(normalized)) period = { start: todayStart - 6 * 24 * 60 * 60 * 1000, end: todayStart + 24 * 60 * 60 * 1000, label: '최근 7일' };
  return { terms: [...new Set(terms)].slice(0, 10), period, mode };
}

function scoreVisit(visit: BrowserVisit, intent: QueryIntent): ScoredVisit | null {
  if (intent.period && (visit.lastVisitTime < intent.period.start || visit.lastVisitTime >= intent.period.end)) return null;
  const searchable = `${visit.title} ${visit.domain} ${visit.normalizedUrl}`.toLocaleLowerCase('ko-KR');
  const matchedTerms = intent.terms.filter((term) => searchable.includes(term));
  const isDiscoveryIntent = intent.mode !== 'keyword' && intent.terms.length === 0;
  const queryScore = isDiscoveryIntent ? 0.24 : intent.terms.length === 0 ? 0.3 : matchedTerms.length / intent.terms.length;
  const recurrenceScore = Math.min(visit.visitCount, 12) * (intent.mode === 'recurring_topics' ? 0.09 : intent.mode === 'peak_activity' ? 0.08 : 0.04);
  const recencyScore = Math.max(0, 0.18 - (Date.now() - visit.lastVisitTime) / (1000 * 60 * 60 * 24 * 365) * 0.18);
  const score = queryScore + recurrenceScore + recencyScore;
  if (intent.terms.length > 0 && matchedTerms.length === 0) return null;
  return { visit, score };
}

function rankVisits(visits: BrowserVisit[], intent: QueryIntent, limit = 8) {
  return visits.map((visit) => scoreVisit(visit, intent)).filter((entry): entry is ScoredVisit => Boolean(entry)).sort((a, b) => b.score - a.score).slice(0, limit);
}

function rankCandidates(candidates: DiscoveryCandidate[], intent: QueryIntent, matchedVisits: ScoredVisit[]) {
  const matchingVisitIds = new Set(matchedVisits.map((entry) => entry.visit.id));
  return candidates
    .filter((candidate) => candidate.status !== 'rejected')
    .map((candidate) => {
      const searchable = `${candidate.subject} ${candidate.object} ${candidate.relation} ${candidate.evidence.join(' ')} ${candidate.sourceDomains.join(' ')}`.toLocaleLowerCase('ko-KR');
      const termScore = intent.terms.length === 0 ? 0.2 : intent.terms.filter((term) => searchable.includes(term)).length / intent.terms.length;
      const provenanceScore = candidate.sourceVisitIds.some((id) => matchingVisitIds.has(id)) ? 0.35 : 0;
      return { candidate, score: termScore + provenanceScore + candidate.confidence * 0.3 };
    })
    .filter((entry) => entry.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

interface TopicSummary {
  label: string;
  pages: BrowserVisit[];
  score: number;
}

function readableVisitLabel(visit: BrowserVisit) {
  const title = visit.title.replace(/\s+/g, ' ').trim();
  if (title && title.length >= 3 && title.length <= 72) return title;
  return visit.domain.replace(/^www\./, '');
}

function buildTopicSummaries(visits: ScoredVisit[], candidates: Array<{ candidate: DiscoveryCandidate; score: number }>) {
  const visitById = new Map(visits.map(({ visit }) => [visit.id, visit]));
  const groups = new Map<string, { anchor: BrowserVisit; pages: Map<string, BrowserVisit>; score: number }>();

  for (const { candidate, score } of candidates) {
    const relatedPages = candidate.sourceVisitIds.map((id) => visitById.get(id)).filter((visit): visit is BrowserVisit => Boolean(visit));
    if (relatedPages.length === 0) continue;
    const anchor = [...relatedPages].sort((left, right) => right.visitCount - left.visitCount || right.lastVisitTime - left.lastVisitTime)[0];
    const existing = groups.get(anchor.normalizedUrl) || { anchor, pages: new Map<string, BrowserVisit>(), score: 0 };
    for (const page of relatedPages) existing.pages.set(page.normalizedUrl, page);
    existing.score += score + Math.min(candidate.confidence, 1);
    groups.set(anchor.normalizedUrl, existing);
  }

  if (groups.size === 0) {
    for (const { visit, score } of visits.slice(0, 3)) groups.set(visit.normalizedUrl, { anchor: visit, pages: new Map([[visit.normalizedUrl, visit]]), score });
  }

  return [...groups.values()]
    .map(({ anchor, pages, score }) => ({
      label: readableVisitLabel(anchor),
      pages: [...pages.values()].sort((left, right) => right.visitCount - left.visitCount || right.lastVisitTime - left.lastVisitTime).slice(0, 2),
      score,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3) satisfies TopicSummary[];
}

function peakActivityResponse(visits: ScoredVisit[]) {
  const formatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });
  const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  const grouped = new Map<string, { label: string; signal: number; pages: BrowserVisit[] }>();
  for (const { visit } of visits) {
    const key = dayKeyFormatter.format(new Date(visit.lastVisitTime));
    const current = grouped.get(key) || { label: formatter.format(new Date(visit.lastVisitTime)), signal: 0, pages: [] };
    current.signal += Math.max(1, visit.visitCount);
    current.pages.push(visit);
    grouped.set(key, current);
  }
  const peak = [...grouped.values()].sort((left, right) => right.signal - left.signal || right.pages.length - left.pages.length)[0];
  if (!peak) return null;
  const pages = peak.pages.sort((left, right) => right.visitCount - left.visitCount || right.lastVisitTime - left.lastVisitTime).slice(0, 3).map((visit) => `${readableVisitLabel(visit)} (${visit.domain})`).join(' · ');
  return `저장된 페이지별 방문 횟수와 마지막 방문 시각을 기준으로, 가장 활발했던 시점은 **${peak.label}**입니다.\n\n그 시점의 주요 페이지: ${pages}\n\n같은 기간의 다른 날짜와 비교해 가장 강한 재방문 신호가 나타난 시점입니다.`;
}

function fallbackResponse(message: string, intent: QueryIntent, visits: ScoredVisit[], candidates: Array<{ candidate: DiscoveryCandidate; score: number }>, webSources: WebSearchSource[]) {
  if (visits.length === 0 && webSources.length > 0) {
    const sourceNames = webSources.slice(0, 3).map((source) => source.title).join(', ');
    return `개인 방문 기록에서는 직접 근거를 찾지 못해 웹 검색으로 보강했습니다. ${sourceNames} 등의 공개 자료를 바탕으로 답변하며, 아래의 웹 출처를 확인해 주세요.`;
  }
  if (visits.length === 0) {
    const periodText = intent.period ? `${intent.period.label} ` : '';
    if (intent.mode === 'recurring_topics') return `${periodText}기록이 아직 없어 반복 관심을 정리하기 어렵습니다. Chrome 기록을 동기화한 뒤 다시 물어보면 방문 횟수와 주제를 기준으로 보여 드릴게요.`;
    if (intent.mode === 'peak_activity') return `${periodText}기록이 아직 없어 가장 활발했던 시점을 계산하기 어렵습니다. Chrome 기록을 동기화한 뒤 다시 물어보면 날짜별 방문 신호를 비교해 보여 드릴게요.`;
    if (intent.mode === 'connections') return `${periodText}기록에서 연결을 판단할 공통 탐색 근거를 아직 찾지 못했습니다. 방문 기록이 더 쌓이면 같은 페이지·도메인·탐색 흐름을 기준으로 연결을 찾아 드릴게요.`;
    return `${periodText}기록에서 “${intent.terms.join(' · ') || message}”와 직접 맞는 방문 흔적을 찾지 못했습니다. 다른 표현으로 다시 물어보거나, Chrome 확장 프로그램의 동기화 상태를 확인해 보세요.`;
  }
  const periodText = intent.period ? `${intent.period.label} ` : '';
  if (intent.mode === 'peak_activity') return peakActivityResponse(visits) || `${periodText}기록에서 활동 시점을 정리할 근거를 찾지 못했습니다.`;
  const visitText = visits.slice(0, 4).map(({ visit }) => `**${visit.title || visit.domain}** (${visit.domain}, ${visit.visitCount}회)`).join(', ');
  const connection = candidates[0]?.candidate;
  if (intent.mode === 'recurring_topics') {
    const topics = buildTopicSummaries(visits, candidates);
    const topicLines = topics.map((topic, index) => {
      const pages = topic.pages.map((page) => `${readableVisitLabel(page)} (${page.domain})`).join(' · ');
      return `${index + 1}. ${topic.label}\n   관련 페이지: ${pages}`;
    });
    return `${periodText}기록에서 반복적으로 나타난 관심은 다음과 같습니다.\n\n${topicLines.join('\n\n')}`;
  }
  if (intent.mode === 'connections') {
    return `${periodText}기록에서 함께 이어진 흔적으로 ${visitText}을(를) 찾았습니다.${connection ? ` 이 흐름은 **${connection.subject}** → ${connection.object} 연결 가설과 맞닿아 있습니다.` : ' 아직 충분한 공통 근거가 없어 관련 페이지를 중심으로 표시했습니다.'}`;
  }
  return `${periodText}기록에서 ${visitText}을(를) 찾았습니다.${connection ? ` 이 흐름은 **${connection.subject}** → ${connection.object} 연결 가설과도 맞닿아 있습니다.` : ''} 지도에서 관련 관심 축을 강조했습니다.`;
}

async function composeWithModel(message: string, intent: QueryIntent, visits: ScoredVisit[], candidates: Array<{ candidate: DiscoveryCandidate; score: number }>, webSources: WebSearchSource[]) {
  if ((intent.mode === 'recurring_topics' || intent.mode === 'peak_activity') || !process.env.NVIDIA_API_KEY || (visits.length === 0 && webSources.length === 0)) return null;
  const context = {
    period: intent.period?.label || '전체 기간',
    queryTerms: intent.terms,
    queryMode: intent.mode,
    visits: visits.map(({ visit }) => ({ title: visit.title, domain: visit.domain, visitedAt: new Date(visit.lastVisitTime).toISOString(), visitCount: visit.visitCount })),
    connections: candidates.map(({ candidate }) => ({ subject: candidate.subject, relation: candidate.relation, object: candidate.object, confidence: candidate.confidence, evidence: candidate.evidence })),
    webSources: webSources.map((source) => ({ title: source.title, url: source.url, snippet: source.snippet })),
  };
  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.2,
      max_tokens: 500,
      messages: [
        { role: 'system', content: '당신은 개인의 방문 기록과, 사용자가 명시적으로 켠 웹 검색 결과를 구분해 설명하는 AI입니다. 제공된 컨텍스트만 근거로 한국어로 간결하게 답하세요. 페이지 제목에서 쪼개진 단어를 독립 주제로 나열하지 말고, 사용자가 실제로 열어본 페이지와 도메인을 중심으로 자연스러운 주제 묶음을 설명하세요. queryMode가 connections이면 함께 나타난 페이지와 확인된 관계 가설을 설명하세요. 방문 기록이 없고 웹 출처만 있다면 반드시 “웹 검색으로 보강한 답변”이라고 밝히고 출처 제목을 제시하세요. 추측을 사실처럼 말하지 말고, 관계 가설에는 “가설”이라고 명시하세요.' },
        { role: 'user', content: `질문: ${message}\n\n검증된 컨텍스트:\n${JSON.stringify(context)}` },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content.trim() : null;
}

export async function runUnconsciousQuery(message: string, visits: BrowserVisit[], candidates: DiscoveryCandidate[], webSearchEnabled = false) {
  const trace: AgentTrace[] = [];
  const intent = parseIntent(message);
  const modeLabel: Record<QueryMode, string> = { keyword: '키워드 탐색', recurring_topics: '반복 관심 탐색', connections: '연결 탐색', recent_activity: '최근 기록 탐색', peak_activity: '활동 시점 탐색' };
  trace.push({ agent: '질문 해석자', status: 'completed', summary: `${modeLabel[intent.mode]} · ${intent.terms.join(', ') || '주제어 없이 기록 흐름'} · ${intent.period?.label || '전체 기간'} 조건으로 해석했습니다.` });

  const [retrieved, preliminaryRelationships] = await Promise.all([
    Promise.resolve(rankVisits(visits, intent, intent.mode === 'peak_activity' ? 250 : 8)),
    Promise.resolve(rankCandidates(candidates, intent, [])),
  ]);
  trace.push({ agent: '기억 탐색자', status: 'completed', summary: `${retrieved.length}개의 방문 흔적을 시간·키워드·재방문 신호로 선별했습니다.` });
  trace.push({ agent: '시간 해석자', status: 'completed', summary: intent.period ? `${intent.period.label}의 KST 날짜 경계를 적용했습니다.` : '기간 제한 없이 최근성과 반복 신호를 함께 고려했습니다.' });

  const webSearchAttempted = webSearchEnabled && retrieved.length === 0;
  const webSearch = webSearchAttempted ? await searchWebForAnswer(message) : { configured: Boolean(process.env.TAVILY_API_KEY), sources: [] as WebSearchSource[] };
  if (webSearchEnabled && retrieved.length === 0) {
    trace.push({ agent: '웹 정찰자', status: webSearch.sources.length > 0 ? 'completed' : 'fallback', summary: webSearch.sources.length > 0 ? `개인 기록에 없는 주제로 웹 출처 ${webSearch.sources.length}개를 확보했습니다.` : (webSearch.configured ? '웹 검색 결과를 찾지 못했습니다.' : 'TAVILY_API_KEY가 설정되지 않아 웹 검색을 건너뛰었습니다.') });
  } else if (webSearchEnabled) {
    trace.push({ agent: '웹 정찰자', status: 'completed', summary: '개인 방문 기록에서 충분한 근거를 찾아 웹 검색을 호출하지 않았습니다.' });
  }

  // A2A handoff: the relationship verifier receives the retrieval agent's exact evidence IDs,
  // then only returns graph candidates that agree with those primary records.
  const retrievedIds = new Set(retrieved.map(({ visit }) => visit.id));
  const verifiedRelationships = retrieved.length > 0
    ? rankCandidates(candidates, intent, retrieved).filter(({ candidate }) => candidate.sourceVisitIds.some((id) => retrievedIds.has(id)))
    : [];
  trace.push({ agent: '관계 검증자', status: 'completed', summary: `${preliminaryRelationships.length}개 1차 관계 중 방문 출처와 교차 확인된 ${verifiedRelationships.length}개만 지도 후보로 채택했습니다.` });

  const highlightedCandidateIds = verifiedRelationships.map(({ candidate }) => candidate.id);
  const highlightedVisitIds = retrieved.map(({ visit }) => visit.id);
  trace.push({ agent: '지도 항해자', status: 'completed', summary: `관련 관심 축 ${highlightedCandidateIds.length}개와 근거 방문 ${highlightedVisitIds.length}개를 강조하도록 전달했습니다.` });

  let answer = fallbackResponse(message, intent, retrieved, verifiedRelationships, webSearch.sources);
  try {
    const modelAnswer = await composeWithModel(message, intent, retrieved, verifiedRelationships, webSearch.sources);
    if (modelAnswer) answer = modelAnswer;
    trace.push({ agent: '응답 구성자', status: modelAnswer ? 'completed' : 'fallback', summary: modelAnswer ? '검증된 컨텍스트만 사용해 답변을 구성했습니다.' : '모델 응답 없이 근거 기반 요약으로 답변했습니다.' });
  } catch {
    trace.push({ agent: '응답 구성자', status: 'fallback', summary: '응답 모델을 사용할 수 없어 근거 기반 요약으로 답변했습니다.' });
  }

  return {
    answer,
    intent,
    matchedVisits: retrieved.map(({ visit, score }) => ({ id: visit.id, domain: visit.domain, title: visit.title, lastVisitTime: visit.lastVisitTime, visitCount: visit.visitCount, score: Number(score.toFixed(2)) })),
    matchedCandidates: verifiedRelationships.map(({ candidate, score }) => ({ ...candidate, score: Number(score.toFixed(2)) })),
    highlightedCandidateIds,
    highlightedVisitIds,
    webSearchRequested: webSearchEnabled,
    webSearchAttempted,
    webSearchUsed: webSearchAttempted && webSearch.sources.length > 0,
    webSearchConfigured: webSearch.configured,
    webSearchError: webSearch.error,
    webSources: webSearch.sources,
    trace,
  };
}
