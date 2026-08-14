import { NextRequest, NextResponse } from 'next/server';
import { requireHistoryToken } from '@/lib/unconscious-auth';
import {
  DomainPolicy,
  PolicyMode,
  loadUnconsciousStore,
  normalizeUrl,
  pruneExpiredData,
  updateUnconsciousStore,
} from '@/lib/utils/unconscious-storage';

export const runtime = 'nodejs';

function normalizeDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const fromUrl = normalizeUrl(raw.startsWith('http') ? raw : `https://${raw}`);
  return fromUrl?.domain || null;
}

function publicSettings(store: Awaited<ReturnType<typeof loadUnconsciousStore>>) {
  return {
    settings: store.settings,
    policies: [...store.policies].sort((a, b) => a.domain.localeCompare(b.domain)),
    totalVisits: store.visits.length,
    pendingCandidates: store.candidates.filter((candidate) => candidate.status === 'pending').length,
  };
}

export async function GET(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;
  try {
    return NextResponse.json(publicSettings(await loadUnconsciousStore()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load privacy settings.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authError = requireHistoryToken(request);
  if (authError) return authError;
  try {
    const body = await request.json() as {
      analysisRunsPerDay?: unknown;
      autoApplyThreshold?: unknown;
      maxVisitsPerRun?: unknown;
      retentionDays?: unknown;
      policy?: { domain?: unknown; mode?: unknown; collectContent?: unknown };
      removePolicyDomain?: unknown;
    };

    const result = await updateUnconsciousStore((store) => {
      if (body.analysisRunsPerDay === 1 || body.analysisRunsPerDay === 2) store.settings.analysisRunsPerDay = body.analysisRunsPerDay;
      if (typeof body.autoApplyThreshold === 'number' && body.autoApplyThreshold >= 0.5 && body.autoApplyThreshold <= 1) store.settings.autoApplyThreshold = body.autoApplyThreshold;
      if (typeof body.maxVisitsPerRun === 'number' && Number.isInteger(body.maxVisitsPerRun)) store.settings.maxVisitsPerRun = Math.max(10, Math.min(body.maxVisitsPerRun, 2_000));
      if (typeof body.retentionDays === 'number' && Number.isInteger(body.retentionDays)) store.settings.retentionDays = Math.max(7, Math.min(body.retentionDays, 3_650));

      const removeDomain = normalizeDomain(body.removePolicyDomain);
      if (removeDomain) {
        store.policies = store.policies.filter((policy) => policy.domain !== removeDomain);
      }

      if (body.policy) {
        const domain = normalizeDomain(body.policy.domain);
        const mode: PolicyMode | null = body.policy.mode === 'allow' || body.policy.mode === 'block' ? body.policy.mode : null;
        if (!domain || !mode) throw new Error('A policy requires a valid domain and mode (allow or block).');
        const now = new Date().toISOString();
        const policy: DomainPolicy = {
          domain,
          mode,
          collectContent: mode === 'allow' && body.policy.collectContent === true,
          createdAt: now,
          updatedAt: now,
        };
        const index = store.policies.findIndex((item) => item.domain === domain);
        if (index >= 0) policy.createdAt = store.policies[index].createdAt;
        if (index >= 0) store.policies[index] = policy;
        else store.policies.push(policy);
      }

      pruneExpiredData(store);
      return publicSettings(store);
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update privacy settings.' }, { status: 400 });
  }
}
