export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  configured: boolean;
  sources: WebSearchSource[];
  error?: string;
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
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: 'no-store',
    });
    if (!response.ok) {
      return { configured: true, sources: [], error: `Web search request failed (${response.status}).` };
    }
    const data = await response.json() as { results?: Array<{ title?: unknown; url?: unknown; content?: unknown; score?: unknown }> };
    const sources = (data.results || [])
      .filter((result) => typeof result.title === 'string' && typeof result.url === 'string')
      .map((result) => ({
        title: String(result.title).slice(0, 240),
        url: String(result.url),
        snippet: typeof result.content === 'string' ? result.content.slice(0, 1_000) : '',
        score: typeof result.score === 'number' ? result.score : undefined,
      }));
    return { configured: true, sources };
  } catch (error) {
    return { configured: true, sources: [], error: error instanceof Error ? error.message : 'Web search request failed.' };
  }
}
