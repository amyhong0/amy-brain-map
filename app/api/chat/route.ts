import { NextRequest, NextResponse } from 'next/server';
import { loadKnowledgeDocs } from '@/lib/utils/knowledge-storage';

async function callNvidiaLLM(messages: { role: string; content: string }[]): Promise<string | null> {
  try {
    const apiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.1-8b-instruct',
        messages: messages,
        temperature: 0.3,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, knowledgeDocs } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 클라이언트에서 전달받은 지식 문서 사용 (없으면 서버에서 로드)
    const docs = knowledgeDocs || await loadKnowledgeDocs();
    
    // 키워드 및 시간 기반 스코어링 로직
    const targetDocs = docs.map((doc: any) => {
      let score = 0;
      const docDate = new Date(doc.createdAt);
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      
      const isToday = today.toDateString() === docDate.toDateString();
      const isYesterday = yesterday.toDateString() === docDate.toDateString();

      if (message.includes('오늘') && isToday) score += 50;
      if (message.includes('어제') && isYesterday) score += 50;
      
      const tokens = message.split(/\s+/);
      for (const token of tokens) {
        if (token.length < 2) continue;
        if (doc.title?.includes(token)) score += 10;
        if (doc.tags && doc.tags.some((t: string) => t.includes(token))) score += 5;
        if (doc.summary && doc.summary.includes(token)) score += 2;
        if (doc.content && doc.content.includes(token)) score += 1;
      }
      
      return { doc, score };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .map((item: any) => item.doc)
    .slice(0, 10);

    const knowledgeContext = targetDocs.map((doc: any, i: number) => {
      let raw = (doc.content || doc.summary || '');
      // 1) HTML 태그 제거
      let clean = raw.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ');
      // 2) 기상/날씨 정보 제거 (숫자℃, 구름맑음 등)
      clean = clean.replace(/\d+\.?\d*℃/g, '').replace(/[가-힣]{2,4}\d+\.?\d*℃/g, '');
      // 3) 이메일/URL 제거
      clean = clean.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
      clean = clean.replace(/https?:\/\/[^\s]+/g, '');
      // 4) copyright/무단전재 등 제거
      clean = clean.replace(/copyright[^\n]*/gi, '').replace(/무단전재[^\n]*/gi, '');
      // 5) 연속 공백/탭 정리
      clean = clean.replace(/[\t\r]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
      // 6) 의미 있는 라인만 필터링 (10자 이상, 날짜/네비게이션 제외)
      const lines = clean.split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => {
          if (l.length < 10) return false;
          if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}/.test(l)) return false; // 날짜
          if (/^(home|menu|search|login|회원|기자|copyright|저작권|제호|등록|발행|운영|고충|UPDATE|최상단|기사제보|문의|닫기|검색|페이스북|엑스|카카오|네이버|밴드|HOT뉴스|더보기|신문사|편집|윤리|찾아오|개인정보|청소년|이메일|URL복사|목록|메일|프린트|스크랩|글씨)/i.test(l)) return false;
          if (/기자\s*$/.test(l)) return false;
          return true;
        });
      // 7) 첫 30줄, 2000자 제한으로 확대
      const mainContent = lines.slice(0, 30).join('\n').substring(0, 2000);
      return `[문서 ${i + 1}]\n제목: ${doc.title}\n내용: ${mainContent || '(내용 없음)'}\n태그: ${(doc.tags || []).join(', ')}`;
    }).join('\n\n');

    const systemPrompt = targetDocs.length > 0
      ? `당신은 지식 베이스 기반 질의응답 AI입니다. 다음은 사용자가 저장한 지식 문서들입니다.

참고할 지식 문서들:
${knowledgeContext}

중요 규칙:
1. 반드시 한국어로만 답변하세요.
2. 위 문서들의 내용을 읽고, 사용자 질문과 관련된 내용이 있으면 그 내용을 바탕으로 상세히 답변하세요.
3. 문서 내용을 인용할 때는 반드시 위에서 제공된 정확한 문서 제목을 그대로 사용하여 [참조: 정확한 문서 제목] 형식을 답변 중간에 포함하세요. (예: [참조: 뇌는 부정을 모른다])
4. 관련 내용이 여러 문서에 있으면 모두 종합하여 답변하세요.
5. 문서 내용에 없는 정보는 "저장된 지식에 없는 내용입니다"라고 답변하고 추가 정보를 요청하세요.
6. 답변은 문서 내용을 요약/설명하는 형태로 자연스럽게 작성하세요.
7. 문서 제목만 알려주지 말고, 실제 문서 내용을 바탕으로 답변하세요.`
      : `당신은 유용한 AI 어시스턴트입니다. 반드시 한국어로만 간결하고 친절하게 답변해주세요.`;

    const llmResult = await callNvidiaLLM([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    const aiResponse = llmResult || '죄송합니다. 지식 베이스에서 관련 정보를 찾을 수 없습니다. 다른 질문을 해주시겠어요?';

    return NextResponse.json({ 
      response: aiResponse,
      documents: targetDocs.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content || doc.summary || '',
        tags: doc.tags || [],
        createdAt: doc.createdAt,
        url: doc.url,
      }))
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process chat request' },
      { status: 500 }
    );
  }
}