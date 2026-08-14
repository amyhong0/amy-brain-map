import { NextRequest, NextResponse } from 'next/server';
import { connectExtension } from '@/lib/unconscious-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { connectCode?: unknown; installationId?: unknown };
    const connectCode = typeof body.connectCode === 'string' ? body.connectCode.trim().toUpperCase() : '';
    const installationId = typeof body.installationId === 'string' ? body.installationId.trim().slice(0, 120) : '';
    if (!/^ABM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(connectCode) || !installationId) {
      return NextResponse.json({ error: '유효한 연결 코드와 확장 프로그램 설치 ID가 필요합니다.' }, { status: 400 });
    }
    const connected = await connectExtension(connectCode, installationId);
    if (!connected) {
      return NextResponse.json({ error: '연결 코드가 만료되었거나 이미 사용되었습니다. 웹 대시보드에서 새 코드를 발급해 주세요.' }, { status: 401 });
    }
    return NextResponse.json({ success: true, installationToken: connected.token });
  } catch (error) {
    console.error('Chrome extension connection failed:', error);
    return NextResponse.json({ error: 'Chrome 확장 프로그램을 연결할 수 없습니다.' }, { status: 500 });
  }
}
