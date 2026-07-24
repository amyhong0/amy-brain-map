import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeDocs, saveKnowledgeDoc, deleteKnowledgeDoc, KnowledgeDoc } from '@/lib/utils/knowledge-storage';
import * as cheerio from 'cheerio';

// 텍스트 정제 함수 (LLM 없이도 사용)
function cleanTextFallback(text: string): { title: string; content: string; keywords: string[] } {
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

  // 하드코딩된 키워드 제거 - 실제 텍스트에서 빈도 기반으로만 추출
  const keywords = extractKeywordsFromContent(cleaned);

  return {
    title: lines[0]?.substring(0, 50) || '웹 문서',
    content,
    keywords: keywords.slice(0, 5)
  };
}

function extractKeywordsFromContent(text: string): string[] {
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

function normalizeKnowledgeTopic(topic?: string, keywords: string[] = []): string {
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

async function callNvidiaLLM(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    const apiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 2048,
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`NVIDIA API error (${apiResponse.status}):`, errText);
      return null;
    }

    const data = await apiResponse.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('NVIDIA API call failed:', error);
    return null;
  }
}

async function callNvidiaEmbeddings(texts: string[]): Promise<number[][] | null> {
  try {
    const apiResponse = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nvidia/nv-embed-qa-4',
        input: texts,
        input_type: 'query',
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`NVIDIA Embedding API error (${apiResponse.status}):`, errText);
      return null;
    }

    const data = await apiResponse.json();
    return data.data?.map((item: any) => item.embedding) || null;
  } catch (error) {
    console.error('NVIDIA Embedding API call failed:', error);
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
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

async function fetchWebContent(url: string): Promise<{ title: string; content: string; keywords: string[]; topic?: string }> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });

    if (!response.ok) throw new Error('Failed to fetch URL');

    const html = await response.text();
    const $ = cheerio.load(html);

    const rawTitle = $('meta[property="og:title"]').attr('content') ||
                     $('meta[name="twitter:title"]').attr('content') ||
                     $('h1').first().text() ||
                     $('title').text() ||
                     url;

    const removeSelectors = [
      'script', 'style', 'nav', 'footer', 'header', 'aside',
      '.ad', '.advertisement', '.ads', '.banner', '.popup', '.modal',
      '.share', '.sns', '.btn', '.button', '[role="navigation"]',
      '[class*="copyright"]', '[class*="reporter"]', '[class*="article-info"]',
      '[id*="copyright"]', '[id*="reporter"]', '[id*="article-info"]',
      '.byline', '.meta', '.metadata', '.published', '.date', '.timestamp',
      '.related', '.related-article', '.recommend', '.recommend-article',
      '.pagination', '.page-nav', '.social', '.twitter', '.facebook',
      '.print', '.print-btn', '.subscription', '.subscribe', '.newsletter',
      '[data-component="article-footer"]',
      '.article-footer', '.article-header', '.article-tool',
      '.floating-menu', '.sticky', '.fixed', '.overlay',
      'iframe', 'noscript', '.video-container', '.embed',
      '.author-info', '.journalist', '.writer-info',
      '.copyright-area', '.copy-area', '.copy-right',
      '.article-share', '.share-button', '.share-area',
      '.more-news', '.more-articles', '.see-also',
      '.ad-area', '.ad-space', '.ad-wrapper', '.ad-container',
      '[class*="ad-"]', '[id*="ad-"]', '[data-ad]',
      '.sponsor', '.partnership', '.promotion',
      '.newsletter-signup', '.subscribe-box',
      '.breadcrumb', '.breadcrumbs', '.path',
      '.search-box', '.search-bar', '.search-form'
    ];

    removeSelectors.forEach(selector => { $(selector).remove(); });

    const rawContent = $('body').text().trim();

    // LLM API 호출 - 더 강력한 모델 사용
    const systemPrompt = `당신은 웹 콘텐츠 분석 전문가입니다. 주어진 HTML 본문에서 핵심 정보만 추출하여 JSON 형식으로 반환하세요.

반드시 다음 JSON 형식만 출력하세요 (다른 텍스트 없이):
{
  "title": "50자 이내의 핵심 제목 (언론사명, 사이트명 제외)",
  "content": "800자 이내의 핵심 요약 (기자정보, 저작권문구, 광고, 네비게이션 등 불필요한 내용 제외)",
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "topic": "문서의 핵심 기술/연구 분야를 1~3단어로 선택. 제목에 프로젝트명(예: 제네시스 미션)과 기술 키워드(예: AI)가 같이 있으면 절대 프로젝트명을 선택하지 말고 반드시 기술 분야(AI 등)를 선택. 회사명·서비스명·제품명·프로젝트명은 topic으로 사용 금지."
}`;

    const trimmedContent = rawContent.substring(0, 4000);
    const userPrompt = `URL: ${url}
제목: ${rawTitle}

본문 내용:
${trimmedContent}

위 내용을 분석하여 JSON 형식으로 출력하세요.`;

    const llmResult = await callNvidiaLLM(userPrompt, systemPrompt);

    if (llmResult) {
      try {
        console.log('LLM raw response:', llmResult);
        let jsonStr = llmResult;
        const jsonMatch = llmResult.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        } else {
          const firstBrace = llmResult.indexOf('{');
          const lastBrace = llmResult.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = llmResult.substring(firstBrace, lastBrace + 1);
          }
        }
        console.log('LLM raw topic payload:', jsonStr);
        const parsed = JSON.parse(jsonStr);

        const title = parsed.title?.trim() || rawTitle.trim();
        let content = parsed.content?.trim() || rawContent;
        let keywords: string[] = parsed.keywords || [];
        const topic = normalizeKnowledgeTopic(parsed.topic?.trim(), keywords) || keywords[0] || 'web';

        if (keywords.length === 0) keywords = extractKeywordsFromContent(content);

        content = content
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          .replace(/\s+[가-힣]{2,4}\s+기자/g, '')
          .replace(/이 시각 핫클릭 이슈[\s\S]*/g, '')
          .trim();

        if (rawContent.length > 4000 && content.length < rawContent.length * 0.5) {
          content += '\n\n... (본문이 너무 길어서 잘렸습니다. 전체 내용은 원문 링크에서 확인하세요.)';
        }

        return { title, content, keywords, topic };
      } catch (parseError) {
        console.error('LLM JSON parse error, trying regex fallback:', parseError);
        // JSON 파싱 실패 시 정규식으로 추출 시도
        const titleMatch = llmResult.match(/"title"\s*:\s*"([^"]+)"/);
        const contentMatch = llmResult.match(/"content"\s*:\s*"([^"]+)"/);
        const keywordMatch = llmResult.match(/"keywords"\s*:\s*\[([^\]]+)\]/);

        const title = titleMatch ? titleMatch[1] : rawTitle.trim();
        const content = contentMatch ? contentMatch[1] : rawContent;
        let keywords: string[] = [];
        if (keywordMatch) {
          keywords = keywordMatch[1].split(',').map(k => k.trim().replace(/"/g, '')).filter(k => k.length > 0);
        }
        if (keywords.length === 0) keywords = extractKeywordsFromContent(content);
        const topic = normalizeKnowledgeTopic(undefined, keywords) || keywords[0] || 'web';

        return { title, content, keywords, topic };
      }
    }

    // LLM 실패 시 향상된 fallback
    console.log('LLM returned null, using enhanced fallback');
    const fallbackClean = cleanTextFallback(rawContent);
    const fallbackKeywords = fallbackClean.keywords.length > 0 
      ? fallbackClean.keywords 
      : extractKeywordsFromContent(rawTitle + ' ' + rawContent.substring(0, 500));
    
    return {
      title: rawTitle.trim(),
      content: fallbackClean.content || `URL: ${url}\n\n콘텐츠 추출 실패 - 직접 방문하여 확인하세요.`,
      keywords: fallbackKeywords,
      topic: fallbackKeywords[0] || 'web'
    };
  } catch (error) {
    console.error('Failed to fetch web content:', error);
    return {
      title: url,
      content: `URL: ${url}\n\n콘텐츠 추출 실패 - 직접 방문하여 확인하세요.`,
      keywords: []
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');

    if (docId) {
      const docs = await loadKnowledgeDocs();
      const doc = docs.find(d => d.id === docId);
      if (doc) return NextResponse.json({ documents: [doc] });
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const docs = await loadKnowledgeDocs();
    return NextResponse.json({ documents: docs });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load knowledge documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { title, type, tags, url, content, summary }: KnowledgeDoc = body;

    if (url && (!content || content === url)) {
      const webData = await fetchWebContent(url);
      if (!title || title.includes('문서') || title === url) title = webData.title;
      content = webData.content || cleanTextFallback(webData.content).content;
      if (webData.keywords && webData.keywords.length > 0) tags = webData.keywords;
      summary = content.substring(0, 100) + '...';
    }

    if (!title || !type) {
      return NextResponse.json({ error: 'Missing required fields: title, type' }, { status: 400 });
    }

    // 키워드 임베딩 계산
    const kwList: string[] = (Array.isArray(tags) ? tags : [title.split(' ')[0]]).filter((t: string) => t && t !== 'web');
    let kwEmbeddings: number[][] | null = null;
    if (kwList.length > 0) {
      try {
        kwEmbeddings = await callNvidiaEmbeddings(kwList);
      } catch (e) {
        console.error('Embedding call failed, skipping:', e);
      }
    }

    const doc: KnowledgeDoc = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      type: type as 'pdf' | 'web' | 'image',
      tags: tags || [],
      createdAt: new Date().toISOString(),
      summary,
      content,
      url,
      metadata: {
        topic: typeof tags === 'string' ? tags : (tags && (tags as any).topic) || (Array.isArray(tags) ? tags[0] : undefined) || title.split(' ')[0],
        kwEmbeddings: kwEmbeddings ? JSON.stringify(kwEmbeddings) : undefined,
      }
    };

    const filePath = await saveKnowledgeDoc(doc);
    return NextResponse.json({ success: true, document: doc, filePath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save document' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('id');
    if (!docId) return NextResponse.json({ error: 'Missing doc id parameter' }, { status: 400 });
    await deleteKnowledgeDoc(docId);
    return NextResponse.json({ success: true, deletedId: docId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete document' },
      { status: 500 }
    );
  }
}