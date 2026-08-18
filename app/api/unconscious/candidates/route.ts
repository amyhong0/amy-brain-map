import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import { approveAllPendingCandidates } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

/** Approves every pending discovery candidate belonging to the signed-in user only. */
export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== 'approve_all_pending') {
      return NextResponse.json({ error: 'action must be approve_all_pending.' }, { status: 400 });
    }
    const candidates = await approveAllPendingCandidates(auth.user.id);
    return NextResponse.json({ success: true, approvedCount: candidates.length, candidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to approve pending candidates.' }, { status: 400 });
  }
}
