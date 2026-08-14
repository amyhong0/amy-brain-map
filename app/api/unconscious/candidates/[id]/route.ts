import { NextRequest, NextResponse } from 'next/server';
import { requireHistoryToken } from '@/lib/unconscious-auth';
import { saveKnowledgeDoc } from '@/lib/utils/knowledge-storage';
import { CandidateStatus, DiscoveryCandidate, updateUnconsciousStore } from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

function graphDocument(candidate: DiscoveryCandidate) {
  const title = candidate.kind === 'bridge'
    ? `${candidate.subject} ↔ ${candidate.object}`
    : `반복 관심: ${candidate.subject}`;
  const summary = `${candidate.subject} ${candidate.relation} ${candidate.object}`;
  const content = [
    summary,
    '',
    '[발견 근거]',
    ...candidate.evidence.map((item) => `- ${item}`),
    '',
    `[신뢰도] ${Math.round(candidate.confidence * 100)}%`,
    `[분석 시각] ${candidate.createdAt}`,
    `[출처 도메인] ${candidate.sourceDomains.join(', ')}`,
  ].join('\n');
  return {
    id: `unconscious-${candidate.id}`,
    title,
    type: 'web' as const,
    tags: [...new Set([candidate.subject, candidate.object].filter(Boolean))],
    createdAt: candidate.createdAt,
    summary,
    content,
    metadata: {
      topic: candidate.subject,
      source: 'browser-history',
      discoveryCandidateId: candidate.id,
      confidence: candidate.confidence,
      relation: candidate.relation,
      status: 'approved',
      sourceDomains: candidate.sourceDomains,
    },
  };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: unknown };
    const status: CandidateStatus | null = body.status === 'approved' || body.status === 'rejected' || body.status === 'pending' ? body.status : null;
    if (!status) return NextResponse.json({ error: 'status must be approved, rejected, or pending.' }, { status: 400 });

    const candidate = await updateUnconsciousStore((store) => {
      const item = store.candidates.find((entry) => entry.id === id);
      if (!item) throw new Error('Discovery candidate not found.');
      item.status = status;
      item.updatedAt = new Date().toISOString();
      return { ...item };
    });

    if (status === 'approved' && !candidate.promotedDocumentId) {
      const document = graphDocument(candidate);
      await saveKnowledgeDoc(document);
      await updateUnconsciousStore((store) => {
        const item = store.candidates.find((entry) => entry.id === id);
        if (item) {
          item.promotedDocumentId = document.id;
          item.updatedAt = new Date().toISOString();
        }
      });
      candidate.promotedDocumentId = document.id;
    }

    return NextResponse.json({ success: true, candidate });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update discovery candidate.';
    const status = message === 'Discovery candidate not found.' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
