import { NextRequest, NextResponse } from 'next/server';
import { issueConnectCode, requireUser } from '@/lib/unconscious-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const result = await issueConnectCode(auth.user.id);
    return NextResponse.json({
      success: true,
      code: result.code,
      expiresAt: result.expiresAt,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });
  } catch (error) {
    console.error('Unable to issue extension connection code:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '연결 코드를 만들 수 없습니다.' }, { status: 500 });
  }
}
