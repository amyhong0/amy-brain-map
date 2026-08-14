import { NextRequest, NextResponse } from 'next/server';
import { requireHistoryToken } from '@/lib/unconscious-auth';
import { runUnconsciousQuery } from '@/lib/unconscious-agents';
import { loadUnconsciousStore } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const body = await request.json() as { message?: unknown; webSearch?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const webSearchEnabled = body.webSearch === true;
    if (message.length < 2 || message.length > 1_000) {
      return NextResponse.json({ error: '질문은 2자 이상 1,000자 이하여야 합니다.' }, { status: 400 });
    }

    const store = await loadUnconsciousStore();
    const result = await runUnconsciousQuery(message, store.visits, store.candidates, webSearchEnabled);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Unconscious query failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '질문을 처리하지 못했습니다.' }, { status: 500 });
  }
}
