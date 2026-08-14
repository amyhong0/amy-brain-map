import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { createUserArchive } from '@/lib/gcs-archive';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({})) as { kind?: unknown };
    const kind = body.kind === 'backup' ? 'backup' : 'export';
    const archive = await createUserArchive(auth.user.id, kind);
    return NextResponse.json({ success: true, archive });
  } catch (error) {
    console.error('Unable to create GCS archive:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : '암호화 보관 파일을 만들 수 없습니다.' }, { status: 503 });
  }
}
