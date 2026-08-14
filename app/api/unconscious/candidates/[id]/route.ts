import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { CandidateStatus, updateCandidateStatus } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: unknown };
    const status: CandidateStatus | null = body.status === 'approved' || body.status === 'rejected' || body.status === 'pending'
      ? body.status : null;
    if (!status) return NextResponse.json({ error: 'status must be approved, rejected, or pending.' }, { status: 400 });

    const candidate = await updateCandidateStatus(auth.user.id, id, status);
    if (!candidate) return NextResponse.json({ error: 'Discovery candidate not found.' }, { status: 404 });
    return NextResponse.json({ success: true, candidate });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update discovery candidate.' }, { status: 400 });
  }
}
