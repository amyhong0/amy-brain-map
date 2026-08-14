import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/unconscious-auth';
import {
  CandidateStatus,
  countBrowserVisits,
  DomainPolicy,
  PolicyMode,
  listCandidates,
  listDomainPolicies,
  getUserSettings,
  normalizeUrl,
  pruneExpiredData,
  removeDomainPolicy,
  updateUserSettings,
  upsertDomainPolicy,
} from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  return normalizeUrl(raw.startsWith('http') ? raw : `https://${raw}`)?.domain || null;
}

async function publicSettings(userId: string) {
  const [settings, policies, visits, pending] = await Promise.all([
    getUserSettings(userId),
    listDomainPolicies(userId),
    countBrowserVisits(userId),
    listCandidates(userId, 'pending' as CandidateStatus, 1_000),
  ]);
  return { settings, policies: policies.sort((a, b) => a.domain.localeCompare(b.domain)), totalVisits: visits, pendingCandidates: pending.length };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json(await publicSettings(auth.user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load privacy settings.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json() as {
      analysisRunsPerDay?: unknown;
      autoApplyThreshold?: unknown;
      maxVisitsPerRun?: unknown;
      retentionDays?: unknown;
      policy?: { domain?: unknown; mode?: unknown; collectContent?: unknown };
      removePolicyDomain?: unknown;
    };
    const patch: Parameters<typeof updateUserSettings>[1] = {};
    if (body.analysisRunsPerDay === 1 || body.analysisRunsPerDay === 2) patch.analysisRunsPerDay = body.analysisRunsPerDay;
    if (typeof body.autoApplyThreshold === 'number' && body.autoApplyThreshold >= 0.5 && body.autoApplyThreshold <= 1) patch.autoApplyThreshold = body.autoApplyThreshold;
    if (typeof body.maxVisitsPerRun === 'number' && Number.isInteger(body.maxVisitsPerRun)) patch.maxVisitsPerRun = Math.max(10, Math.min(body.maxVisitsPerRun, 2_000));
    if (typeof body.retentionDays === 'number' && Number.isInteger(body.retentionDays)) patch.retentionDays = Math.max(7, Math.min(body.retentionDays, 3_650));
    if (Object.keys(patch).length > 0) await updateUserSettings(auth.user.id, patch);

    const removeDomain = normalizeDomain(body.removePolicyDomain);
    if (removeDomain) await removeDomainPolicy(auth.user.id, removeDomain);
    if (body.policy) {
      const domain = normalizeDomain(body.policy.domain);
      const mode: PolicyMode | null = body.policy.mode === 'allow' || body.policy.mode === 'block' ? body.policy.mode : null;
      if (!domain || !mode) throw new Error('A policy requires a valid domain and mode (allow or block).');
      const policy: Pick<DomainPolicy, 'domain' | 'mode' | 'collectContent'> = { domain, mode, collectContent: mode === 'allow' && body.policy.collectContent === true };
      await upsertDomainPolicy(auth.user.id, policy);
    }

    const settings = await getUserSettings(auth.user.id);
    await pruneExpiredData(auth.user.id, settings.retentionDays);
    return NextResponse.json(await publicSettings(auth.user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update privacy settings.' }, { status: 400 });
  }
}
