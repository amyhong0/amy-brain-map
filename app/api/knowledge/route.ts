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

function normalizeKeyword(raw: string): string {
  const lower = raw.toLocaleLowerCase('ko-KR').trim();
  // Remove spaces between Korean characters only
  const koreanOnly = lower.replace(/([가-힣])\s+([가-힣])/g, '$1$2');
  // Ensure single spaces elsewhere
  return koreanOnly.replace(/\s+/g, ' ').trim();
}

function extractKeywordsFromContent(text: string): string[] {
  const normalized = text
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s가-힣]/g, ' ')
    .replace(/([가-힣])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([가-힣])/g, '$1 $2');

  const words = normalized
    .split(/\s+/)
    .map(w => w.trim())
    .filter(word => word.length > 1);

  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'of', 'for', 'with', 'as',
    '이', '그', '저', '것', '의', '를', '을', '에', '에서', '와', '과', '하다', '되다', '이다',
    '및', '등', '수', '위', '통해', '경우', '때', '그리고', '하지만', '그러나'
  ]);

  const filteredWords = words.filter(word => !stopWords.has(word));
  const wordCount = new Map<string, number>();
  filteredWords.forEach(word => {
    const key = normalizeKeyword(word);
    wordCount.set(key, (wordCount.get(key) || 0) + 1);
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

async function callNvidiaVisionModel(imageUrls: string[], prompt: string): Promise<string | null> {
  const requestId = `vis_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  console.log(`[${requestId}] Vision API called with ${imageUrls.length} images:`, imageUrls.slice(0, 3).map(u => u.split('?')[0]));
  try {
    const apiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.2-11b-vision-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    console.log(`[${requestId}] Vision API status:`, apiResponse.status, apiResponse.statusText);
    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`[${requestId}] NVIDIA Vision API error:`, errText.slice(0, 500));
      return null;
    }

    const data = await apiResponse.json();
    const result = data.choices[0]?.message?.content || null;
    console.log(`[${requestId}] Vision API result length:`, result?.length || 0, result?.slice(0, 200));
    return result;
  } catch (error) {
    console.error(`[${requestId}] NVIDIA Vision API call failed:`, error);
    return null;
  }
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

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}
function isNaverBlogUrl(url: string): boolean {
  return /blog\.naver\.com/i.test(url);
}

async function fetchInstagramContent(url: string): Promise<{ title: string; content: string; imageUrls: string[] } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const twitterDesc = $('meta[name="description"]').attr('content') || '';
    const description = ogDesc || twitterDesc;
    // ogTitle for Instagram is usually: "USERNAME | bio text on Instagram: photos and videos"
    // For carousel posts, the actual title is often in the first image, so use a placeholder here
    const title = '';  // Will be filled by Vision model from first image
    // description contains likes/comments count + post text with hashtags
    const content = description
      .replace(/^\d+ likes?, \d+ comments? - \S+ on \w+ \d+, \d+:\s*/, '')
      .replace(/- \S+ on Instagram:?/, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    // Collect carousel images - Instagram uses og:image for the first image
    const imageUrls: string[] = [];
    const seen = new Set<string>();
    const addImage = (src: string) => {
      if (!src || !src.startsWith('http')) return;
      const normalized = src.split('?')[0];
      if (!seen.has(normalized)) {
        seen.add(normalized);
        imageUrls.push(src);
      }
    };

    // Collect from all og:image variants
    $('meta[property="og:image"]').each((_, el) => {
      const src = $(el).attr('content') || '';
      addImage(src);
    });
    $('meta[property="og:image:url"]').each((_, el) => {
      const src = $(el).attr('content') || '';
      addImage(src);
    });
    $('meta[name="twitter:image"]').each((_, el) => {
      const src = $(el).attr('content') || '';
      addImage(src);
    });

    // Collect from ALL img tags - be aggressive for Instagram carousels
    $('img').each((_, el) => {
      const src = $(el).attr('src') || '';
      if (!src || !src.startsWith('http')) return;
      // Skip obvious non-content images
      if (src.includes('1x1') || src.includes('pixel') || src.includes('tracking') || src.includes('icon')) return;
      addImage(src);
    });

    // Also look for background-image URLs in inline styles
    $('[style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const urlMatch = style.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/);
      if (urlMatch) addImage(urlMatch[1]);
    });

    // Look for JSON-LD structured data which may contain image array
    const jsonLd = $('script[type="application/ld+json"]').html() || '';
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd);
        const images = Array.isArray(data.image) ? data.image : (data.image ? [data.image] : []);
        images.forEach((img: any) => {
          if (typeof img === 'string') addImage(img);
          else if (img && img.url) addImage(img.url);
        });
      } catch (e) {
        // ignore JSON parse error
      }
    }

    return { title, content, imageUrls };
  } catch (e) {
    console.error('Instagram fetch failed:', e);
    return null;
  }
}

async function fetchNaverBlogContent(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    // Naver blog wraps content in an iframe
    const iframeSrc = $('#mainFrame').attr('src') || $('iframe').first().attr('src');
    if (!iframeSrc) return null;
    const fullFrameUrl = iframeSrc.startsWith('http') ? iframeSrc : `https://blog.naver.com${iframeSrc}`;
    const frameRes = await fetch(fullFrameUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!frameRes.ok) return null;
    const frameHtml = await frameRes.text();
    const $frame = cheerio.load(frameHtml);
    // Remove unwanted elements from frame
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside',
      '.ad', '.advertisement', '.banner', '.popup', '.se-module-toolbar',
      '.blog2_blog_category', '.blog2_blog_category_layer',
      '.blog2_post_comment', '.blog2_post_blogger',
      '.btn_post_share', '.btn_post_scrap',
      'iframe', 'noscript', '.copyright',
      '.blog2_post_related', '.blog2_post_reply',
      '#postViewArea_paging', '#postViewArea_prne'];
    removeSelectors.forEach(sel => { $frame(sel).remove(); });
    const title = $frame('meta[property="og:title"]').attr('content')
      || $frame('.se-title').text()
      || $frame('h1').first().text()
      || $frame('title').text()
      || '';
    let content = $frame('#postViewArea').text()
      || $frame('.se-main-container').text()
      || $frame('.se_component_wrap').text()
      || $frame('body').text().trim();
    content = content.replace(/\s+/g, ' ').trim();
    return { title, content: content.substring(0, 5000) };
  } catch (e) {
    console.error('Naver blog fetch failed:', e);
    return null;
  }
}

async function fetchWebContent(url: string): Promise<{ title: string; content: string; keywords: string[]; topic?: string; imageUrls?: string[] }> {
  try {
    let instagramData: { content: string; imageUrls: string[] } | null = null;
    // Special handling for Instagram - do NOT early return so A2A image analysis can run
    if (isInstagramUrl(url)) {
      const igData = await fetchInstagramContent(url);
      if (igData) {
        instagramData = { content: igData.content, imageUrls: igData.imageUrls };
      }
    }

    // Special handling for Naver blog
    if (isNaverBlogUrl(url)) {
      const blogData = await fetchNaverBlogContent(url);
      if (blogData && blogData.title) {
        const keywords = extractKeywordsFromContent(blogData.title + ' ' + blogData.content);
        return {
          title: blogData.title,
          content: blogData.content || '네이버 블로그 콘텐츠',
          keywords,
          topic: keywords[0] || 'web',
        };
      }
    }

    let rawContent = '';
    let imageUrls: string[] = [];
    let rawTitle = '';

    if (instagramData) {
      // Use Instagram data
      rawContent = instagramData.content;
      imageUrls = [...instagramData.imageUrls];
      rawTitle = '';  // Will be generated by Vision model or LLM
    } else {
      // Regular web page fetching
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      if (!response.ok) throw new Error('Failed to fetch URL');

      const html = await response.text();
      const $ = cheerio.load(html);

      const metaTitle = $('meta[property="og:title"]').attr('content') ||
                       $('meta[name="twitter:title"]').attr('content') || '';
      const h1Title = $('h1').first().text().trim();
      const htmlTitle = $('title').text().trim();

      // Avoid using overly long titles as-is (often full article text on blogs)
      rawTitle = (metaTitle && metaTitle.length < 120) ? metaTitle
        : (h1Title && h1Title.length < 120) ? h1Title
        : (htmlTitle && htmlTitle.length < 120) ? htmlTitle
        : url;

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
        '.search-box', '.search-bar', '.search-form',
        'img[src*="ad"]', 'img[class*="ad"]', 'img[id*="ad"]',
        '.carousel-ad', '.ad-image', '.promo-image'
      ];

      removeSelectors.forEach(selector => { $(selector).remove(); });

      rawContent = $('body').text().trim();

      // Collect meaningful image URLs (exclude ads, icons)
      const adKeywords = ['ad', 'banner', 'promo', 'sponsor', '광고'];
      $('img').each((_, el) => {
        const $img = $(el);
        const src = $img.attr('src') || '';
        const className = ($img.attr('class') || '').toLowerCase();
        const id = ($img.attr('id') || '').toLowerCase();
        const width = $img.attr('width');
        const height = $img.attr('height');

        if (adKeywords.some(k => src.toLowerCase().includes(k) || className.includes(k) || id.includes(k))) return;
        if (width && height && (parseInt(width) < 50 || parseInt(height) < 50)) return;
        if (!src.startsWith('http')) return;
        imageUrls.push(src);
      });
    }

    const trimmedContent = rawContent.substring(0, 4000);

    // If first image exists, analyze it to get title candidate and content description (especially for carousels)
    let visionTitleCandidate: string | null = null;
    let imageDescriptions: string[] = [];
    if (imageUrls.length > 0) {
      console.log(`[${new URL(url).hostname}] Starting vision analysis for ${imageUrls.length} images`);
      try {
        const [titleResult, descResult] = await Promise.all([
          callNvidiaVisionModel([imageUrls[0]], '이 이미지에 제목이나 핵심 문구가 있으면 한국어로 추출해주세요. 없다면 "none"이라고만 출력하세요.'),
          callNvidiaVisionModel(imageUrls.slice(0, 8), '이 인스타그램 캐러셀 이미지들에 있는 모든 텍스트를 빠짐없이 한국어로 추출해주세요. 각 이미지에 있는 글자, 문구, 설명, 콘텐츠를 순서대로 추출하고 "이미지 N:" 형식으로 번호를 매겨주세요.')
        ]);
        console.log(`[${new URL(url).hostname}] Vision title result:`, titleResult?.slice(0, 100));
        console.log(`[${new URL(url).hostname}] Vision desc result length:`, descResult?.length || 0);
        if (titleResult && !/^none$/i.test(titleResult)) {
          visionTitleCandidate = titleResult.trim().split('\n')[0].trim();
        }
        if (descResult) {
          imageDescriptions = descResult.split('\n').filter((line: string) => line.trim().length > 0).slice(0, 10);
        }
        console.log(`[${new URL(url).hostname}] Image descriptions count:`, imageDescriptions.length);
      } catch (e) {
        console.error('Vision analysis failed:', e);
      }
    } else {
      console.log(`[${new URL(url).hostname}] No images found for vision analysis`);
    }

    const systemPrompt = `당신은 웹 콘텐츠 분석 전문가입니다. 주어진 HTML 본문에서 핵심 정보만 추출하여 JSON 형식으로 반환하세요.

반드시 다음 JSON 형식만 출력하세요 (다른 텍스트 없이):
{
  "title": "50자 이내의 핵심 제목 (언론사명, 사이트명 제외). '인스타그램 게시글', '웹 문서' 등 일반적인 제목은 사용하지 마세요. 실제 제목을 추출하거나, 추출할 수 없으면 본문 내용을 바탕으로 생성하세요.",
  "content": "800자 이내의 핵심 요약 (기자정보, 저작권문구, 광고, 네비게이션 등 불필요한 내용 제외)",
  "keywords": [
    "의미있는 핵심 키워드 5개",
    "조사/어미/접속사/단독 글자('것이','그것','이것','오픈' 등)는 절대 포함하지 마세요",
    "복합어는 부분보다 전체로 추출하세요 ('오픈소스'는 '오픈'과 '소스'로 분리하지 마세요)",
    "한글은 2글자 이상, 영문은 의미있는 단어만 포함"
  ],
  "topic": "문서의 핵심 기술/연구 분야를 1~3단어로 선택. 제목에 프로젝트명(예: 제네시스 미션)과 기술 키워드(예: AI)가 같이 있으면 절대 프로젝트명을 선택하지 말고 반드시 기술 분야(AI 등)를 선택. 회사명·서비스명·제품명·프로젝트명은 topic으로 사용 금지."
}`;

    // Combine text + image descriptions for LLM
    const imageSection = imageDescriptions.length > 0
      ? '\n\n[이미지 내용]\n' + imageDescriptions.map((d, i) => `이미지${i + 1}: ${d}`).join('\n')
      : '';
    const combinedContent = trimmedContent + imageSection;
    const titleNote = visionTitleCandidate ? `\n[참고: 첫 이미지 문구: ${visionTitleCandidate}]` : '';

    const userPrompt = `URL: ${url}
제목: ${rawTitle || '(제목 없음 - 이미지 또는 본문을 참고하여 생성)'}

${instagramData ? '인스타그램 게시글 본문(og:description):' : '본문 내용:'}
${combinedContent}${titleNote}

위 내용과 이미지를 분석하여 JSON 형식으로 출력하세요.
${instagramData ? '인스타그램 게시글의 경우, 이미지에 제목이 있을 경우 그것을 우선 사용하고, 없다면 본문과 이미지 내용을 바탕으로 적합한 제목을 생성하세요.' : ''}`;

    // A2A: 텍스트 분석은 완료되었고, 이미지 분석도 이미 위에서 수행했으므로 LLM만 호출
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

        let keywords: string[] = parsed.keywords || [];
        let content = parsed.content?.trim() || rawContent;

        // Reject generic titles from LLM
        const GENERIC_TITLES = new Set(['인스타그램 게시글', '웹 문서', '문서', '제목 없음', 'untitled', 'no title']);
        let title = (parsed.title?.trim() || rawTitle.trim() || visionTitleCandidate || '').trim();
        if (!title || GENERIC_TITLES.has(title.toLowerCase()) || title.length < 2) {
          // Fallback: use first keyword or first line of content
          const firstKeyword = keywords.find(k => !GENERIC_TITLES.has(k.toLowerCase())) || extractKeywordsFromContent(content)[0];
          const firstLine = content.split('\n')[0].trim().slice(0, 50);
          title = firstKeyword || firstLine || '웹 문서';
        }

        // 이미지 분석 결과를 content에 포함
        if (imageDescriptions.length > 0) {
          content += '\n\n[이미지 분석]\n' + imageDescriptions.join('\n');
        }
        const topic = normalizeKnowledgeTopic(normalizeKeyword(parsed.topic?.trim()), keywords) || keywords[0] || 'web';

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

        let title = titleMatch ? titleMatch[1] : rawTitle.trim() || visionTitleCandidate || '웹 문서';
        let content = contentMatch ? contentMatch[1] : rawContent;
        let keywords: string[] = [];
        if (keywordMatch) {
          keywords = keywordMatch[1].split(',').map(k => k.trim().replace(/"/g, '')).filter(k => k.length > 0);
        }
        if (keywords.length === 0) keywords = extractKeywordsFromContent(content);
        const topic = normalizeKnowledgeTopic(undefined, keywords.map(normalizeKeyword)) || keywords[0] || 'web';

        if (imageDescriptions.length > 0) {
          content += '\n\n[이미지 분석]\n' + imageDescriptions.join('\n');
        }

        return { title, content, keywords, topic };
      }
    }

    // LLM 실패 시 향상된 fallback
    console.log('LLM returned null, using enhanced fallback');
    let fallbackContent = rawContent;
    if (imageDescriptions.length > 0) {
      fallbackContent += '\n\n[이미지 분석]\n' + imageDescriptions.join('\n');
    }

    // 이미지 분석 텍스트를 보존하면서 노이즈 제거
    let fallbackClean: { title: string; content: string; keywords: string[] };
    if (imageDescriptions.length > 0) {
      const lines = fallbackContent.split('\n')
        .map(l => l.trim())
        .filter(line => {
          if (line.length < 15 && !line.startsWith('이미지')) return false;
          if (/^[가-힣]{2,4}\s*기자$/.test(line)) return false;
          if (/무단전재|재배포|copyright/i.test(line)) return false;
          if (/핫클릭|더보기|관련기사|추천기사/i.test(line)) return false;
          return true;
        });
      const content = lines.join('\n\n');
      const keywords = extractKeywordsFromContent(fallbackContent);
      fallbackClean = {
        title: rawTitle.trim() || visionTitleCandidate || keywords[0] || '웹 문서',
        content,
        keywords: keywords.slice(0, 5)
      };
    } else {
      fallbackClean = cleanTextFallback(fallbackContent);
    }

    const fallbackKeywords = fallbackClean.keywords.length > 0
      ? fallbackClean.keywords
      : extractKeywordsFromContent((rawTitle || '') + ' ' + fallbackContent.substring(0, 500));

    return {
      title: fallbackClean.title || visionTitleCandidate || fallbackKeywords[0] || '웹 문서',
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
    const kwList: string[] = (Array.isArray(tags) ? tags : [title.split(' ')[0]]).map(normalizeKeyword).filter((t: string) => t && t !== 'web');
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