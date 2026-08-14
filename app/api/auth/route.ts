import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, deleteSession, getSessionUser, sessionCookieName } from '@/lib/unconscious-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    return NextResponse.json({ authenticated: Boolean(user), user });
  } catch (error) {
    console.error('Unable to read authentication session:', error);
    return NextResponse.json({ authenticated: false, user: null, error: '로그인 세션을 확인할 수 없습니다.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await deleteSession(request.cookies.get(sessionCookieName())?.value);
  } catch (error) {
    console.error('Unable to remove authentication session:', error);
  }
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
