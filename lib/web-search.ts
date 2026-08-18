export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  configured: boolean;
  sources: WebSearchSource[];
  answer?: string;
  error?: string;
}

const TRUSTED_SOURCE_DOMAINS = [
  'openai.com', 'anthropic.com', 'google.com', 'deepmind.google', 'microsoft.com', 'nvidia.com',
  'aws.amazon.com', 'arxiv.org', 'github.com', 'huggingface.co', 'langchain.com', 'modelcontextprotocol.io',
];
const LOW_QUALITY_TITLE_PATTERNS = /지원금|지급|결제|쿠폰|채용|casino|hackathon|해커톤|로그인|sign in/i;

function sourceQuality(source: WebSearchSource) {
  let hostname = '';
  try { hostname = new URL(source.url).hostname.replace(/^www\./, ''); } catch { return -100; }
  const trusted = TRUSTED_SOURCE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  const relevance = Math.max(0, Math.min(1, source.score || 0)) * 10;
  return (trusted ? 100 : 0) + relevance - (LOW_QUALITY_TITLE_PATTERNS.test(source.title) ? 80 : 0);
}

function curateSources(sources: WebSearchSource[]) {
  const curated = sources
    .filter((source) => source.snippet.trim().length >= 40)
    .map((source) => ({ source, quality: sourceQuality(source) }))
    .filter(({ quality }) => quality > -40)
    .sort((left, right) => right.quality - left.quality)
    .slice(0, 5)
    .map(({ source }) => source);
  return curated;
}

/**
 * Web search is intentionally server-only. The provider key never reaches the
 * browser and is called only after the personal-history retrieval agent finds
 * no relevant evidence.
 */
export async function searchWebForAnswer(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, sources: [], error: 'TAVILY_API_KEY is not configured.' };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        topic: 'general',
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
      }),
      cache: 'no-store',
    });
    if (!response.ok) {
      return { configured: true, sources: [], error: `Web search request failed (${response.status}).` };
    }
    const data = await response.json() as { answer?: unknown; results?: Array<{ title?: unknown; url?: unknown; content?: unknown; score?: unknown }> };
    const sources = curateSources((data.results || [])
      .filter((result) => typeof result.title === 'string' && typeof result.url === 'string')
      .map((result) => ({
        title: String(result.title).slice(0, 240),
        url: String(result.url),
        snippet: typeof result.content === 'string' ? result.content.slice(0, 1_000) : '',
        score: typeof result.score === 'number' ? result.score : undefined,
      })));
    const answer = typeof data.answer === 'string' && data.answer.trim().length > 0 ? data.answer.trim().slice(0, 2_000) : undefined;
    return { configured: true, sources, answer };
  } catch (error) {
    return { configured: true, sources: [], error: error instanceof Error ? error.message : 'Web search request failed.' };
  }
}
