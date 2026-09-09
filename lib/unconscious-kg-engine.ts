import { BrowserVisit, DiscoveryCandidate, createId } from '@/lib/utils/unconscious-storage';
import { isAuthenticationVisit } from '@/lib/unconscious-visit-filter';
import {
  BrowsingSession,
  EntityKind,
  ExtractedKnowledgeTriplet,
  KnowledgeGraphExtractionResult,
  RelationType,
} from '@/lib/utils/unconscious-graph-types';

const EXTENDED_STOP_WORDS = new Set([
  // Basic stopwords
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'new', 'www', 'com', 'org',
  'https', 'http', '대한', '위한', '있는', '없는', '대한민국', '그리고', '하지만', '에서', '으로', '하는', '하기', '정보',
  '뉴스', '홈', '로그인', '검색', '페이지', '서비스', '공식', '블로그', '게시물', '더보기', '보기', '관련', '오늘',
  // UI & Generic noise
  'overview', 'app', 'console', 'dashboard', '편집', '마이페이지', '내역', '수강신청내역', '내예약관리', '신청내역',
  '알림', '설정', '계정', '로그아웃', '회원가입', '본인인증', '인증', '메시지', '방금', '보냈습니다', '알려드립니다',
  '개인정보', '이용약관', '고객센터', '공지사항', '자주묻는질문', 'qna', 'faq', 'notice', 'support',
  'search', 'orders', 'campaign', 'view', 'main', 'index',
  // Domain TLDs & suffixes
  'kr', 'co', 'io', 'net', 'ai', 'dev', 'me', 'or', 'go', 'edu', 'ac', 'xyz',
  // Dates & numbers
  '2024', '2025', '2026', '2027', '2028', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월',
]);

const DOMAIN_NOISE_TERMS = new Set(['google', 'naver', 'daum', 'kakao', 'youtube', 'github', 'vercel']);

export function cleanTitleText(title: string): string {
  return title
    .replace(/ - [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+ - Gmail$/i, '')
    .replace(/\s*-\s*Gmail$/i, '')
    .replace(/\s*\|\s*편집$/i, '')
    .replace(/\s*-\s*JupyterLab$/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .trim();
}

export function extractMeaningfulTerms(text: string): string[] {
  const cleaned = cleanTitleText(text)
    .toLocaleLowerCase('ko-KR')
    .replace(/[^a-z0-9가-힣\s_-]/gi, ' ');

  const tokens = cleaned
    .split(/[\s_-]+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (t.length < 2 || t.length > 30) return false;
      if (EXTENDED_STOP_WORDS.has(t)) return false;
      if (/^\d+$/.test(t)) return false; // purely numeric
      return true;
    });

  return [...new Set(tokens)];
}

/**
 * Groups chronological browser visits into Task/Context sessions
 * based on idle gap threshold (e.g. 25 minutes).
 */
export function sessionizeVisits(visits: BrowserVisit[], idleThresholdMs = 25 * 60 * 1000): BrowsingSession[] {
  const meaningful = visits
    .filter((v) => !isAuthenticationVisit(v))
    .sort((a, b) => a.lastVisitTime - b.lastVisitTime);

  if (meaningful.length === 0) return [];

  const sessions: BrowsingSession[] = [];
  let currentGroup: BrowserVisit[] = [meaningful[0]];

  for (let i = 1; i < meaningful.length; i++) {
    const prev = meaningful[i - 1];
    const curr = meaningful[i];
    const gap = curr.lastVisitTime - prev.lastVisitTime;

    if (gap > idleThresholdMs) {
      sessions.push(createSessionFromGroup(currentGroup));
      currentGroup = [curr];
    } else {
      currentGroup.push(curr);
    }
  }

  if (currentGroup.length > 0) {
    sessions.push(createSessionFromGroup(currentGroup));
  }

  return sessions;
}

function createSessionFromGroup(visits: BrowserVisit[]): BrowsingSession {
  const domainCounts = new Map<string, number>();
  let totalVisitCount = 0;
  for (const v of visits) {
    domainCounts.set(v.domain, (domainCounts.get(v.domain) || 0) + v.visitCount);
    totalVisitCount += v.visitCount;
  }

  const primaryDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([d]) => d);

  // Pick the most visited or longest title as hint
  const representative = [...visits].sort((a, b) => b.visitCount - a.visitCount)[0];
  const sessionTitleHint = cleanTitleText(representative?.title || primaryDomains[0] || 'Web Browsing');

  return {
    id: `sess-${visits[0].lastVisitTime}`,
    startTime: visits[0].lastVisitTime,
    endTime: visits[visits.length - 1].lastVisitTime,
    visits,
    primaryDomains,
    totalVisitCount,
    sessionTitleHint,
  };
}

export function relationLabel(relation: RelationType): string {
  switch (relation) {
    case 'USED_IN':
      return '작업 도구/기술로 활용됨';
    case 'DEPLOYED_TO':
      return '배포/운영 플랫폼으로 연결됨';
    case 'RESEARCHED':
      return '연구/탐색 대상과 연결됨';
    case 'LEARNING':
      return '학습/참고 자료로 탐색됨';
    case 'CONNECTED_TO':
    default:
      return '같은 탐색 맥락에서 연결됨';
  }
}

/**
 * Fallback heuristic extractor when LLM is unavailable.
 * Analyzes co-occurring entities within the same session and cross-session frequencies.
 */
export function extractTripletsFallback(
  sessions: BrowsingSession[],
  autoApplyThreshold: number,
  runId: string,
  now: string
): KnowledgeGraphExtractionResult {
  const termStats = new Map<string, { visits: BrowserVisit[]; domains: Set<string>; totalCount: number; sessions: Set<string> }>();
  const coOccurrences = new Map<string, { count: number; sessions: Set<string>; left: string; right: string; visitIds: Set<string>; domains: Set<string> }>();

  for (const session of sessions) {
    const sessionTerms = new Set<string>();
    for (const v of session.visits) {
      const terms = extractMeaningfulTerms(`${v.title} ${v.description || ''} ${v.domain}`);
      for (const t of terms) {
        sessionTerms.add(t);
        const stat = termStats.get(t) || { visits: [], domains: new Set(), totalCount: 0, sessions: new Set() };
        stat.visits.push(v);
        stat.domains.add(v.domain);
        stat.totalCount += v.visitCount;
        stat.sessions.add(session.id);
        termStats.set(t, stat);
      }
    }

    // Co-occurrence within session
    const termList = [...sessionTerms];
    for (let i = 0; i < termList.length; i++) {
      for (let j = i + 1; j < termList.length; j++) {
        const left = termList[i];
        const right = termList[j];
        if (left === right) continue;
        const key = [left, right].sort().join('::');
        const co = coOccurrences.get(key) || { count: 0, sessions: new Set(), left, right, visitIds: new Set(), domains: new Set() };
        co.count += 1;
        co.sessions.add(session.id);
        session.visits.forEach((v) => {
          co.visitIds.add(v.id);
          co.domains.add(v.domain);
        });
        coOccurrences.set(key, co);
      }
    }
  }

  const triplets: ExtractedKnowledgeTriplet[] = [];
  const candidates: DiscoveryCandidate[] = [];

  // 1. Single entity interests
  for (const [term, stat] of termStats) {
    const uniqueUrls = new Set(stat.visits.map((v) => v.normalizedUrl)).size;
    if (uniqueUrls < 2 && stat.totalCount < 3) continue;

    const confidence = Math.min(0.85, 0.50 + uniqueUrls * 0.07 + Math.min(stat.totalCount, 10) * 0.02 + Math.min(stat.domains.size, 4) * 0.03);
    const sourceDomains = [...stat.domains].slice(0, 5);
    const sourceVisitIds = [...new Set(stat.visits.map((v) => v.id))].slice(0, 15);
    const humanSubject = term.charAt(0).toUpperCase() + term.slice(1);

    candidates.push({
      id: createId('candidate'),
      kind: 'interest',
      subject: humanSubject,
      relation: '반복적으로 탐색함',
      object: sourceDomains.join(' · '),
      confidence: Number(confidence.toFixed(2)),
      status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
      evidence: [`${uniqueUrls}개 페이지에서 총 ${stat.totalCount}회 방문 확인`, `출처 도메인: ${sourceDomains.join(', ')}`],
      sourceVisitIds,
      sourceDomains,
      createdAt: now,
      updatedAt: now,
      analysisRunId: runId,
    });
  }

  // 2. Co-occurring pairs as bridge relationships
  const sortedCo = [...coOccurrences.values()]
    .filter((c) => c.sessions.size >= 1 && (termStats.get(c.left)?.totalCount || 0) >= 2 && (termStats.get(c.right)?.totalCount || 0) >= 2)
    .sort((a, b) => b.count - a.count);

  for (const co of sortedCo.slice(0, 15)) {
    const leftSubject = co.left.charAt(0).toUpperCase() + co.left.slice(1);
    const rightObject = co.right.charAt(0).toUpperCase() + co.right.slice(1);
    const confidence = Math.min(0.78, 0.55 + co.sessions.size * 0.08);
    const domains = [...co.domains].slice(0, 4);

    triplets.push({
      subject: leftSubject,
      subjectKind: 'concept',
      relation: 'CONNECTED_TO',
      relationLabel: '같은 탐색 맥락에서 연결됨',
      object: rightObject,
      objectKind: 'concept',
      confidence,
      evidence: `${co.sessions.size}개의 작업 세션에서 함께 탐색된 관심사입니다.`,
      sourceVisitIds: [...co.visitIds].slice(0, 8),
      sourceDomains: domains,
    });

    candidates.push({
      id: createId('candidate'),
      kind: 'bridge',
      subject: leftSubject,
      relation: '같은 탐색 흐름에서 연결됨',
      object: rightObject,
      confidence: Number(confidence.toFixed(2)),
      status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
      evidence: [`${co.sessions.size}개의 작업 세션에서 함께 탐색됨 (${domains.join(', ')})`],
      sourceVisitIds: [...co.visitIds].slice(0, 8),
      sourceDomains: domains,
      createdAt: now,
      updatedAt: now,
      analysisRunId: runId,
    });
  }

  return {
    triplets,
    candidates: candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 35),
    usedLLM: false,
    sessionCount: sessions.length,
  };
}

/**
 * Extracts high-quality knowledge triplets using NVIDIA AI API (meta/llama-3.1-8b-instruct).
 */
export async function extractTripletsWithLLM(
  sessions: BrowsingSession[],
  apiKey: string,
  autoApplyThreshold: number,
  runId: string,
  now: string
): Promise<KnowledgeGraphExtractionResult> {
  // If no sessions or no API key, immediate fallback
  if (!apiKey || sessions.length === 0) {
    return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
  }

  // Prepare condensed sessions summary for LLM prompt
  const sessionSummaries = sessions.slice(0, 12).map((sess, idx) => {
    const titles = sess.visits
      .map((v) => {
        const clean = cleanTitleText(v.title);
        const desc = v.description ? ` (${v.description.slice(0, 100)})` : '';
        return `${clean}${desc}`;
      })
      .filter((t) => t.length > 2)
      .slice(0, 5);
    return {
      sessionIndex: idx + 1,
      durationMinutes: Math.max(1, Math.round((sess.endTime - sess.startTime) / 60000)),
      primaryDomains: sess.primaryDomains,
      totalVisits: sess.totalVisitCount,
      representativeTitles: titles,
    };
  });

  const systemPrompt = `당신은 브라우징 로그에서 개인의 전문적 작업 맥락과 지식 그래프를 구성하는 지식 엔지니어링 AI입니다.
주어진 세션별 웹 탐색 기록을 분석하여, 사용자가 수행한 핵심 프로젝트, 활용한 도구/기술, 연구 주제 사이의 삼원조(Triplets)를 JSON 배열로 추출하세요.

[규칙]
1. 단일 단어로 무의미하게 쪼개지 말고, 온전한 개체명(예: "Amy Brain Map", "Tableau", "MindTracker", "FDA 부작용 분석", "Docker", "Vertex AI")을 추출하세요.
2. "로그인", "마이페이지", "Overview", "2026", "수강신청", "App"과 같은 범용 UI나 날짜는 절대 노드로 만들지 마세요.
3. 관계(relation)는 다음 중 하나여야 합니다:
   - "USED_IN": 도구/기술이 특정 프로젝트나 분석 작업에 활용됨
   - "DEPLOYED_TO": 프로젝트가 호스팅/배포 플랫폼에 배포됨
   - "RESEARCHED": 특정 기술이나 개념을 학습/조사함
   - "LEARNING": 강의, 튜토리얼을 통해 역량을 습득함
   - "CONNECTED_TO": 동일 맥락에서 밀접하게 교차 탐색됨
4. 출력은 반드시 다음 스키마를 만족하는 JSON 객체여야 합니다:
{
  "triplets": [
    {
      "subject": "도구 또는 개념명",
      "subjectKind": "tool" | "project" | "learning" | "domain_concept",
      "relation": "USED_IN" | "DEPLOYED_TO" | "RESEARCHED" | "LEARNING" | "CONNECTED_TO",
      "relationLabel": "자연스러운 한국어 설명 (예: 분석 도구로 활용됨)",
      "object": "대상 프로젝트 또는 상위 개념명",
      "objectKind": "tool" | "project" | "learning" | "domain_concept",
      "confidence": 0.70 ~ 0.95 사이 실수,
      "evidence": "판단 근거 1문장"
    }
  ]
}`;

  const userPrompt = `다음 브라우징 작업 세션들을 분석해 유효한 지식 삼원조 4~12개를 JSON으로 응답하세요:\n${JSON.stringify(sessionSummaries, null, 2)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`NVIDIA API call returned ${response.status}, falling back to rule-based engine.`);
      return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== 'string') {
      return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
    }

    // Extract JSON block from markdown if needed
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
    }

    const parsed = JSON.parse(jsonMatch[0]) as { triplets?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.triplets) || parsed.triplets.length === 0) {
      return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
    }

    const triplets: ExtractedKnowledgeTriplet[] = [];
    const candidates: DiscoveryCandidate[] = [];
    const allVisits = sessions.flatMap((s) => s.visits);
    const domainMap = new Map<string, string[]>();
    for (const v of allVisits) {
      domainMap.set(v.domain, (domainMap.get(v.domain) || []).concat(v.id));
    }

    for (const item of parsed.triplets) {
      const subject = String(item.subject || '').trim();
      const object = String(item.object || '').trim();
      const rawRel = String(item.relation || 'CONNECTED_TO') as RelationType;
      const validRel: RelationType = ['USED_IN', 'DEPLOYED_TO', 'RESEARCHED', 'LEARNING', 'CONNECTED_TO'].includes(rawRel)
        ? rawRel
        : 'CONNECTED_TO';
      const relLabel = String(item.relationLabel || relationLabel(validRel));
      const confidence = Math.max(0.5, Math.min(0.95, Number(item.confidence) || 0.75));
      const evidenceText = String(item.evidence || '브라우징 세션 기록을 기반으로 LLM이 맥락을 분석함.');

      if (!subject || !object || subject.toLocaleLowerCase() === object.toLocaleLowerCase()) continue;

      // Find matching source domains and visits
      const matchingVisits = allVisits.filter((v) => {
        const text = `${v.title} ${v.domain}`.toLocaleLowerCase();
        return text.includes(subject.toLocaleLowerCase()) || text.includes(object.toLocaleLowerCase());
      });
      const sourceDomains = [...new Set(matchingVisits.map((v) => v.domain))].slice(0, 4);
      const sourceVisitIds = [...new Set(matchingVisits.map((v) => v.id))].slice(0, 10);

      const triplet: ExtractedKnowledgeTriplet = {
        subject,
        subjectKind: (item.subjectKind as EntityKind) || 'concept',
        relation: validRel,
        relationLabel: relLabel,
        object,
        objectKind: (item.objectKind as EntityKind) || 'concept',
        confidence,
        evidence: evidenceText,
        sourceVisitIds,
        sourceDomains,
      };
      triplets.push(triplet);

      // Create Bridge candidate
      candidates.push({
        id: createId('candidate'),
        kind: 'bridge',
        subject,
        relation: relLabel,
        object,
        confidence: Number(confidence.toFixed(2)),
        status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
        evidence: [evidenceText, `출처: ${sourceDomains.join(', ') || '복합 세션'}`],
        sourceVisitIds,
        sourceDomains,
        createdAt: now,
        updatedAt: now,
        analysisRunId: runId,
      });

      // Also ensure subject is registered as interest candidate if prominent
      candidates.push({
        id: createId('candidate'),
        kind: 'interest',
        subject,
        relation: '반복적으로 탐색함',
        object: sourceDomains.join(' · ') || '브라우징 세션',
        confidence: Number((confidence * 0.95).toFixed(2)),
        status: confidence >= autoApplyThreshold ? 'auto_applied' : 'pending',
        evidence: [`${evidenceText} (${subject})`],
        sourceVisitIds,
        sourceDomains,
        createdAt: now,
        updatedAt: now,
        analysisRunId: runId,
      });
    }

    // Deduplicate candidates
    const dedupedMap = new Map<string, DiscoveryCandidate>();
    for (const cand of candidates) {
      const key = `${cand.kind}::${cand.subject}::${cand.relation}::${cand.object}`;
      if (!dedupedMap.has(key) || cand.confidence > dedupedMap.get(key)!.confidence) {
        dedupedMap.set(key, cand);
      }
    }

    return {
      triplets,
      candidates: [...dedupedMap.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 30),
      usedLLM: true,
      sessionCount: sessions.length,
    };
  } catch (error) {
    console.error('Failed to extract triplets via LLM, falling back:', error);
    return extractTripletsFallback(sessions, autoApplyThreshold, runId, now);
  }
}
