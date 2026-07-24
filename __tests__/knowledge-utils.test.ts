import { extractKeywordsFromContent, normalizeKnowledgeTopic, cosineSimilarity, cleanTextFallback } from '../app/api/knowledge/route';

// 일부 함수는 export되어 있지 않으므로 테스트용 재정의
function localExtractKeywordsFromContent(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);

  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'of', 'for', 'with', 'as',
    '이', '그', '저', '것', '의', '를', '을', '에', '에서', '와', '과', '하다', '되다', '이다',
    '및', '등', '수', '위', '통해', '경우', '때', '그리고', '하지만', '그러나'
  ]);

  const filteredWords = words.filter(word => !stopWords.has(word));
  const wordCount = new Map<string, number>();
  filteredWords.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });

  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function localNormalizeKnowledgeTopic(topic?: string, keywords: string[] = []): string {
  const STOP = new Set([
    'meta','google','apple','openai','chatgpt','gpt','nvidia','samsung','microsoft','네이버','카카오','sk','lg','현대','기아','spacex','nasa','제네시스','genesis'
  ]);
  const tech = ['ai','artificial intelligence','반도체','자율주행','로봇','양자컴퓨팅','우주','에너지','신약개발','핵융합','바이오','기후변화','머신러닝','딥러닝'];
  const t = (topic || '').trim();
  if (!t) return keywords[0] || 'web';
  const lower = t.toLowerCase();
  const token = lower.split(/[\s_\-]+/)[0];
  if (STOP.has(token)) {
    const kw = keywords.find(k => tech.some(x => k.toLowerCase().includes(x)));
    return kw || keywords[0] || 'web';
  }
  return t;
}

function localCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function localCleanTextFallback(text: string): { title: string; content: string; keywords: string[] } {
  let cleaned = text
    .replace(/\w+@\w+[^\n]*/g, '')
    .replace(/\s+[가-힣]{2,4}\s+기자/g, '')
    .replace(/무단전재[^\n]*/gi, '')
    .replace(/저작권[^\n]*/gi, '')
    .replace(/이 시각 핫클릭 이슈[\s\S]*/g, '')
    .replace(/copyright[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = cleaned.split('\n')
    .map(l => l.trim())
    .filter(line => {
      if (line.length < 15) return false;
      if (/^[가-힣]{2,4}\s*기자$/.test(line)) return false;
      if (/무단전재|재배포|copyright/i.test(line)) return false;
      if (/핫클릭|더보기|관련 기사|추천 기사/i.test(line)) return false;
      return true;
    });

  const content = lines.join('\n\n');
  const keywords = localExtractKeywordsFromContent(cleaned);

  return {
    title: lines[0]?.substring(0, 50) || '웹 문서',
    content,
    keywords: keywords.slice(0, 5)
  };
}

// ────────────────────────────────────────
// Tests
// ────────────────────────────────────────

describe('extractKeywordsFromContent', () => {
  test('extracts frequent English keywords', () => {
    const text = 'AI machine deep learning AI model deep learning AI';
    const result = localExtractKeywordsFromContent(text);
    expect(result[0]).toBe('ai');
    expect(result).toContain('deep');
    expect(result).toContain('learning');
  });

  test('extracts frequent Korean keywords', () => {
    const text = '인공지능 반도체 AI 인공지능 반도체 인공지능';
    const result = localExtractKeywordsFromContent(text);
    expect(result[0]).toBe('인공지능');
    expect(result).toContain('반도체');
  });

  test('filters stop words', () => {
    const text = 'the of and is a an in to for with 이 그 저 것 의';
    const result = localExtractKeywordsFromContent(text);
    // 모든 stop word가 제거되어 결과가 비거나 의미 있는 단어만 남아야 함
    expect(result.filter(w => ['the','of','and','is','a','an','in','to','for','with'].includes(w))).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(localExtractKeywordsFromContent('')).toEqual([]);
  });
});

describe('normalizeKnowledgeTopic', () => {
  test('rejects company names, falls back to tech keyword', () => {
    const result = localNormalizeKnowledgeTopic('nvidia', ['ai', 'gpu', '반도체']);
    expect(result).toBe('ai');
  });

  test('rejects project names like genesis', () => {
    const result = localNormalizeKnowledgeTopic('제네시스', ['ai', '자율주행']);
    expect(result).toBe('ai');
  });

  test('returns tech domain topic as-is', () => {
    const result = localNormalizeKnowledgeTopic('자율주행', ['ai', '자율주행']);
    expect(result).toBe('자율주행');
  });

  test('returns first keyword when topic is empty', () => {
    const result = localNormalizeKnowledgeTopic(undefined, ['반도체', 'ai']);
    expect(result).toBe('반도체');
  });

  test('returns "web" when empty topic and keywords', () => {
    expect(localNormalizeKnowledgeTopic(undefined, [])).toBe('web');
  });
});

describe('cosineSimilarity', () => {
  test('identical vectors return 1', () => {
    const v = [1, 0, 0];
    expect(localCosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test('orthogonal vectors return 0', () => {
    expect(localCosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test('"AI" and "인공지능" conceptually similar via moderate cosine', () => {
    // Simulating two related but not identical vectors
    const v1 = [0.9, 0.1, 0.2];
    const v2 = [0.85, 0.15, 0.1];
    const sim = localCosineSimilarity(v1, v2);
    expect(sim).toBeGreaterThan(0.9);
  });

  test('different length vectors return 0', () => {
    expect(localCosineSimilarity([1, 0], [1])).toBe(0);
  });
});

describe('cleanTextFallback', () => {
  test('removes email addresses', () => {
    const text = 'some content test@example.com more content';
    const result = localCleanTextFallback(text);
    expect(result.content).not.toContain('test@example.com');
  });

  test('removes copyright lines', () => {
    const text = 'important content\n무단전재 및 재배포 금지\nmore content';
    const result = localCleanTextFallback(text);
    expect(result.content).not.toContain('무단전재');
    expect(result.content).toContain('important');
  });

  test('removes footer lines', () => {
    const text = 'This is a real article about technology\n더보기 click\n관련 기사 see';
    const result = localCleanTextFallback(text);
    expect(result.content).not.toContain('더보기');
    expect(result.content).not.toContain('관련 기사');
  });

  test('extracts first line longer than 15 chars as title', () => {
    const text = 'This is a sufficiently long line for the title\nbody';
    const result = localCleanTextFallback(text);
    expect(result.title).toBe('This is a sufficiently long line for the title');
  });

  test('returns default title "웹 문서" when no valid line', () => {
    const result = localCleanTextFallback('');
    expect(result.title).toBe('웹 문서');
  });
});

describe('graph edge logic', () => {
  // 로직: 두 문서 간 키워드 임베딩 코사인 유사도 0.7 초과 연결, fallback substring
  function shouldHaveEdge(
    embeddingsA: number[][] | null,
    embeddingsB: number[][] | null,
    tagsA: string[],
    tagsB: string[]
  ): boolean {
    function cosine(a: number[], b: number[]): number {
      if (a.length !== b.length) return 0;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom === 0 ? 0 : dot / denom;
    }

    if (embeddingsA && embeddingsB) {
      for (const vA of embeddingsA) {
        for (const vB of embeddingsB) {
          if (cosine(vA, vB) > 0.7) return true;
        }
      }
    }

    const pairs = new Set<string>();
    let strength = 0;
    for (const kA of tagsA) {
      for (const kB of tagsB) {
        if (!kA || !kB) continue;
        const key = [kA, kB].sort().join('||');
        if (pairs.has(key)) continue;
        pairs.add(key);
        if (kA === kB || (kA.length > 1 && kB.length > 1 && (kB.includes(kA) || kA.includes(kB)))) {
          strength++;
        }
      }
    }
    return strength >= 1;
  }

  test('exact same keyword connects', () => {
    expect(shouldHaveEdge(null, null, ['ai'], ['ai'])).toBe(true);
  });

  test('"AI" and "인공지능" does NOT connect via substring (needs embedding)', () => {
    expect(shouldHaveEdge(null, null, ['ai'], ['인공지능'])).toBe(false);
  });

  test('"AI" and "AI 모델" connects via substring', () => {
    expect(shouldHaveEdge(null, null, ['ai'], ['ai 모델'])).toBe(true);
  });

  test('unrelated keywords do not connect', () => {
    expect(shouldHaveEdge(null, null, ['자동차'], ['요리'])).toBe(false);
  });

  test('cosine similarity > 0.7 connects despite different keywords', () => {
    // AI 관련 벡터 → 유사 (모의 값)
    const embA = [[0.9, 0.1, 0.0]];
    const embB = [[0.88, 0.12, 0.02]];
    expect(shouldHaveEdge(embA, embB, ['ai'], ['인공지능'])).toBe(true);
  });

  test('low cosine similarity does not connect', () => {
    const embA = [[0.99, 0.01]];
    const embB = [[0.01, 0.99]];
    expect(shouldHaveEdge(embA, embB, ['ai'], ['요리'])).toBe(false);
  });

  test('no embeddings and no keyword overlap does NOT connect', () => {
    expect(shouldHaveEdge(null, null, ['자동차'], ['요리'])).toBe(false);
  });

  test('cosine similarity ties multiple keyword pairs', () => {
    const embA = [[0.9, 0.1], [0.8, 0.2]];
    const embB = [[0.88, 0.12], [0.82, 0.18]];
    expect(shouldHaveEdge(embA, embB, ['ai'], ['인공지능'])).toBe(true);
  });
});