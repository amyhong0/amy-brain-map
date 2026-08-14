import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { downloadUserExport } from '@/lib/gcs-archive';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const { id } = await context.params;
    const archive = await downloadUserExport(auth.user.id, id);
    if (!archive) return NextResponse.json({ error: '내보내기 파일을 찾을 수 없습니다.' }, { status: 404 });
    return new NextResponse(archive.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${archive.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Unable to download GCS export:', error);
    return NextResponse.json({ error: '내보내기 파일을 읽을 수 없습니다.' }, { status: 503 });
  }
}
