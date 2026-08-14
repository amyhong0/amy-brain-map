import crypto from 'crypto';
import { database } from '@/lib/db';

export type PolicyMode = 'allow' | 'block';
export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';
export type CandidateKind = 'interest' | 'revisit' | 'bridge';
export type ContentStatus = 'metadata_only' | 'eligible' | 'extracted' | 'blocked';

export interface BrowserVisit {
  id: string;
  installationId: string;
  normalizedUrl: string;
  url: string;
  title: string;
  domain: string;
  lastVisitTime: number;
  visitCount: number;
  receivedAt: string;
  updatedAt: string;
  contentStatus: ContentStatus;
}

export interface DomainPolicy {
  domain: string;
  mode: PolicyMode;
  collectContent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveryCandidate {
  id: string;
  kind: CandidateKind;
  subject: string;
  relation: string;
  object: string;
  confidence: number;
  status: CandidateStatus;
  evidence: string[];
  sourceVisitIds: string[];
  sourceDomains: string[];
  createdAt: string;
  updatedAt: string;
  analysisRunId: string;
  promotedDocumentId?: string;
}

export interface AnalysisRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  visitCount: number;
  candidateCount: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

export interface UnconsciousSettings {
  analysisRunsPerDay: 1 | 2;
  autoApplyThreshold: number;
  maxVisitsPerRun: number;
  retentionDays: number;
  lastAnalyzedAt?: string;
  lastSyncedAt?: string;
}

export interface UnconsciousStore {
  version: number;
  visits: BrowserVisit[];
  policies: DomainPolicy[];
  candidates: DiscoveryCandidate[];
  analysisRuns: AnalysisRun[];
  settings: UnconsciousSettings;
}

export interface IncomingStoredVisit {
  normalizedUrl: string;
  url: string;
  title: string;
  domain: string;
  lastVisitTime: number;
  visitCount: number;
}

const STORE_VERSION = 2;
export const DEFAULT_SETTINGS: UnconsciousSettings = {
  analysisRunsPerDay: 1,
  autoApplyThreshold: 0.88,
  maxVisitsPerRun: 500,
  retentionDays: 365,
};

export const DEFAULT_BLOCKED_DOMAINS = [
  'accounts.google.com',
  'bank',
  'card',
  'insurance',
  'health',
  'hospital',
  'clinic',
  'pay',
  'checkout',
  'admin',
  'localhost',
];

type DatabaseRow = Record<string, unknown>;

function asIso(value: unknown): string {
  if (typeof value === 'string') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      return asStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toVisit(row: DatabaseRow): BrowserVisit {
  return {
    id: String(row.id),
    installationId: String(row.installation_id),
    normalizedUrl: String(row.normalized_url),
    url: String(row.url),
    title: String(row.title || ''),
    domain: String(row.domain),
    lastVisitTime: asNumber(row.last_visit_time),
    visitCount: asNumber(row.visit_count, 1),
    receivedAt: asIso(row.received_at),
    updatedAt: asIso(row.updated_at),
    contentStatus: row.content_status as ContentStatus,
  };
}

function toPolicy(row: DatabaseRow): DomainPolicy {
  return {
    domain: String(row.domain),
    mode: row.mode as PolicyMode,
    collectContent: row.collect_content === true || row.collect_content === 'true',
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function toCandidate(row: DatabaseRow): DiscoveryCandidate {
  return {
    id: String(row.id),
    kind: row.kind as CandidateKind,
    subject: String(row.subject),
    relation: String(row.relation),
    object: String(row.object),
    confidence: asNumber(row.confidence),
    status: row.status as CandidateStatus,
    evidence: asStringArray(row.evidence),
    sourceVisitIds: asStringArray(row.source_visit_ids),
    sourceDomains: asStringArray(row.source_domains),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    analysisRunId: String(row.analysis_run_id || ''),
    promotedDocumentId: typeof row.promoted_document_id === 'string' ? row.promoted_document_id : undefined,
  };
}

function toRun(row: DatabaseRow): AnalysisRun {
  return {
    id: String(row.id),
    startedAt: asIso(row.started_at),
    completedAt: row.completed_at ? asIso(row.completed_at) : undefined,
    visitCount: asNumber(row.visit_count),
    candidateCount: asNumber(row.candidate_count),
    status: row.status as AnalysisRun['status'],
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}

function toSettings(row: DatabaseRow | undefined): UnconsciousSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    analysisRunsPerDay: asNumber(row.analysis_runs_per_day, 1) === 2 ? 2 : 1,
    autoApplyThreshold: asNumber(row.auto_apply_threshold, DEFAULT_SETTINGS.autoApplyThreshold),
    maxVisitsPerRun: asNumber(row.max_visits_per_run, DEFAULT_SETTINGS.maxVisitsPerRun),
    retentionDays: asNumber(row.retention_days, DEFAULT_SETTINGS.retentionDays),
    lastAnalyzedAt: row.last_analyzed_at ? asIso(row.last_analyzed_at) : undefined,
    lastSyncedAt: row.last_synced_at ? asIso(row.last_synced_at) : undefined,
  };
}

/** Initializes a new user's privacy defaults. User identity itself must already be authenticated and stored. */
export async function ensureUnconsciousUserState(userId: string): Promise<void> {
  const sql = database();
  await sql.transaction((tx) => [
    tx.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    ),
    ...DEFAULT_BLOCKED_DOMAINS.map((domain) => tx.query(
      `INSERT INTO domain_policies (user_id, domain, mode, collect_content)
       VALUES ($1, $2, 'block', false)
       ON CONFLICT (user_id, domain) DO NOTHING`,
      [userId, domain],
    )),
  ]);
}

/** Returns only the requesting user's private browsing-history graph data. */
export async function loadUnconsciousStore(userId: string): Promise<UnconsciousStore> {
  await ensureUnconsciousUserState(userId);
  const sql = database();
  const [settingRows, policyRows, visitRows, candidateRows, runRows] = await Promise.all([
    sql.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]),
    sql.query('SELECT * FROM domain_policies WHERE user_id = $1 ORDER BY domain ASC', [userId]),
    sql.query('SELECT * FROM browser_visits WHERE user_id = $1 ORDER BY last_visit_time DESC', [userId]),
    sql.query('SELECT * FROM discovery_candidates WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    sql.query('SELECT * FROM analysis_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT 100', [userId]),
  ]);

  return {
    version: STORE_VERSION,
    settings: toSettings(settingRows[0] as DatabaseRow | undefined),
    policies: policyRows.map((row) => toPolicy(row as DatabaseRow)),
    visits: visitRows.map((row) => toVisit(row as DatabaseRow)),
    candidates: candidateRows.map((row) => toCandidate(row as DatabaseRow)),
    analysisRuns: runRows.map((row) => toRun(row as DatabaseRow)),
  };
}

export async function getUserSettings(userId: string): Promise<UnconsciousSettings> {
  await ensureUnconsciousUserState(userId);
  const rows = await database().query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  return toSettings(rows[0] as DatabaseRow | undefined);
}

export async function updateUserSettings(userId: string, patch: Partial<Pick<UnconsciousSettings, 'analysisRunsPerDay' | 'autoApplyThreshold' | 'maxVisitsPerRun' | 'retentionDays'>>): Promise<UnconsciousSettings> {
  await ensureUnconsciousUserState(userId);
  const current = await getUserSettings(userId);
  const next = { ...current, ...patch };
  await database().query(
    `UPDATE user_settings
     SET analysis_runs_per_day = $2,
         auto_apply_threshold = $3,
         max_visits_per_run = $4,
         retention_days = $5,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, next.analysisRunsPerDay, next.autoApplyThreshold, next.maxVisitsPerRun, next.retentionDays],
  );
  return next;
}

export async function listDomainPolicies(userId: string): Promise<DomainPolicy[]> {
  await ensureUnconsciousUserState(userId);
  const rows = await database().query('SELECT * FROM domain_policies WHERE user_id = $1 ORDER BY domain ASC', [userId]);
  return rows.map((row) => toPolicy(row as DatabaseRow));
}

export async function upsertDomainPolicy(userId: string, policy: Pick<DomainPolicy, 'domain' | 'mode' | 'collectContent'>): Promise<void> {
  await ensureUnconsciousUserState(userId);
  await database().query(
    `INSERT INTO domain_policies (user_id, domain, mode, collect_content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, domain) DO UPDATE SET
       mode = EXCLUDED.mode,
       collect_content = EXCLUDED.collect_content,
       updated_at = NOW()`,
    [userId, policy.domain, policy.mode, policy.mode === 'allow' && policy.collectContent],
  );
}

export async function removeDomainPolicy(userId: string, domain: string): Promise<void> {
  await database().query('DELETE FROM domain_policies WHERE user_id = $1 AND domain = $2', [userId, domain]);
}

export async function ingestBrowserVisits(userId: string, installationRecordId: string, installationId: string, visits: IncomingStoredVisit[]): Promise<{ created: number; updated: number; blocked: number; lastSyncedAt: string }> {
  await ensureUnconsciousUserState(userId);
  const policies = await listDomainPolicies(userId);
  const timestamp = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let blocked = 0;
  const sql = database();

  const queries = visits.map((visit) => {
    const contentStatus: ContentStatus = isDomainBlocked(visit.domain, policies)
      ? 'blocked'
      : canCollectContent(visit.domain, policies) ? 'eligible' : 'metadata_only';
    if (contentStatus === 'blocked') blocked += 1;
    return sql.query(
      `INSERT INTO browser_visits (
        id, user_id, installation_id, normalized_url, url, title, domain, last_visit_time,
        visit_count, received_at, updated_at, content_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
      ON CONFLICT (installation_id, normalized_url) DO UPDATE SET
        url = EXCLUDED.url,
        title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE browser_visits.title END,
        last_visit_time = GREATEST(browser_visits.last_visit_time, EXCLUDED.last_visit_time),
        visit_count = GREATEST(browser_visits.visit_count, EXCLUDED.visit_count),
        content_status = EXCLUDED.content_status,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted`,
      [createId('visit'), userId, installationRecordId, visit.normalizedUrl, visit.url, visit.title, visit.domain, visit.lastVisitTime, visit.visitCount, contentStatus],
    );
  });

  if (queries.length > 0) {
    const results = await sql.transaction(queries);
    for (const rows of results) {
      if ((rows[0] as DatabaseRow | undefined)?.inserted === true) created += 1;
      else updated += 1;
    }
  }

  await sql.query(
    'UPDATE user_settings SET last_synced_at = $2, updated_at = NOW() WHERE user_id = $1',
    [userId, timestamp],
  );
  await sql.query(
    'UPDATE extension_installations SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2',
    [installationRecordId, userId],
  );

  return { created, updated, blocked, lastSyncedAt: timestamp };
}

export async function getRecentVisits(userId: string, limit = 50): Promise<BrowserVisit[]> {
  const rows = await database().query(
    'SELECT * FROM browser_visits WHERE user_id = $1 ORDER BY last_visit_time DESC LIMIT $2',
    [userId, limit],
  );
  return rows.map((row) => toVisit(row as DatabaseRow));
}

export async function countBrowserVisits(userId: string): Promise<number> {
  const rows = await database().query('SELECT COUNT(*)::integer AS total FROM browser_visits WHERE user_id = $1', [userId]);
  return asNumber((rows[0] as DatabaseRow | undefined)?.total);
}

export async function pruneExpiredData(userId: string, retentionDays: number, now = Date.now()): Promise<void> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const sql = database();
  await sql.transaction((tx) => [
    tx.query('DELETE FROM browser_visits WHERE user_id = $1 AND last_visit_time < $2', [userId, cutoff]),
    tx.query(
      `DELETE FROM discovery_candidates
       WHERE user_id = $1 AND status = 'pending'
       AND NOT EXISTS (
         SELECT 1
         FROM browser_visits
         WHERE browser_visits.user_id = discovery_candidates.user_id
           AND discovery_candidates.source_visit_ids ? browser_visits.id
       )`,
      [userId],
    ),
  ]);
}

export async function startAnalysisRun(userId: string): Promise<AnalysisRun> {
  await ensureUnconsciousUserState(userId);
  const id = createId('analysis');
  const rows = await database().query(
    `INSERT INTO analysis_runs (id, user_id, status)
     VALUES ($1, $2, 'running') RETURNING *`,
    [id, userId],
  );
  return toRun(rows[0] as DatabaseRow);
}

export async function completeAnalysisRun(userId: string, runId: string, visitCount: number, candidateCount: number): Promise<AnalysisRun> {
  const rows = await database().query(
    `UPDATE analysis_runs
     SET status = 'completed', completed_at = NOW(), visit_count = $3, candidate_count = $4
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [runId, userId, visitCount, candidateCount],
  );
  if (!rows[0]) throw new Error('Analysis run not found.');
  await database().query('UPDATE user_settings SET last_analyzed_at = NOW(), updated_at = NOW() WHERE user_id = $1', [userId]);
  return toRun(rows[0] as DatabaseRow);
}

export async function failAnalysisRun(userId: string, runId: string, message: string): Promise<void> {
  await database().query(
    `UPDATE analysis_runs SET status = 'failed', completed_at = NOW(), error = $3
     WHERE id = $1 AND user_id = $2`,
    [runId, userId, message.slice(0, 1000)],
  );
}

export async function insertDiscoveryCandidates(userId: string, candidates: DiscoveryCandidate[]): Promise<DiscoveryCandidate[]> {
  if (candidates.length === 0) return [];
  const sql = database();
  const rowsByCandidate = await sql.transaction(candidates.map((candidate) => sql.query(
    `INSERT INTO discovery_candidates (
      id, user_id, kind, subject, relation, object, confidence, status, evidence,
      source_visit_ids, source_domains, analysis_run_id, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14)
    ON CONFLICT (user_id, subject, relation, object) DO NOTHING
    RETURNING *`,
    [
      candidate.id, userId, candidate.kind, candidate.subject, candidate.relation, candidate.object,
      candidate.confidence, candidate.status, JSON.stringify(candidate.evidence), JSON.stringify(candidate.sourceVisitIds),
      JSON.stringify(candidate.sourceDomains), candidate.analysisRunId, candidate.createdAt, candidate.updatedAt,
    ],
  )));
  return rowsByCandidate.flat().map((row) => toCandidate(row as DatabaseRow));
}

export async function listCandidates(userId: string, status?: CandidateStatus, limit = 50): Promise<DiscoveryCandidate[]> {
  const sql = database();
  const rows = status
    ? await sql.query('SELECT * FROM discovery_candidates WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3', [userId, status, limit])
    : await sql.query('SELECT * FROM discovery_candidates WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
  return rows.map((row) => toCandidate(row as DatabaseRow));
}

export async function listRecentAnalysisRuns(userId: string, limit = 10): Promise<AnalysisRun[]> {
  const rows = await database().query(
    'SELECT * FROM analysis_runs WHERE user_id = $1 ORDER BY started_at DESC LIMIT $2',
    [userId, limit],
  );
  return rows.map((row) => toRun(row as DatabaseRow));
}

export async function updateCandidateStatus(userId: string, candidateId: string, status: CandidateStatus): Promise<DiscoveryCandidate | null> {
  const rows = await database().query(
    `UPDATE discovery_candidates SET status = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [candidateId, userId, status],
  );
  return rows[0] ? toCandidate(rows[0] as DatabaseRow) : null;
}

export async function setCandidatePromotedDocument(userId: string, candidateId: string, documentId: string): Promise<void> {
  await database().query(
    `UPDATE discovery_candidates SET promoted_document_id = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [candidateId, userId, documentId],
  );
}

export function normalizeEncryptionKey(configured: string): Buffer {
  if (configured.length < 32) throw new Error('HISTORY_BACKUP_ENCRYPTION_KEY must be at least 32 characters long.');
  if (/^[a-fA-F0-9]{64}$/.test(configured)) return Buffer.from(configured, 'hex');
  return crypto.createHash('sha256').update(configured, 'utf8').digest();
}

export function normalizeUrl(rawUrl: string): { normalizedUrl: string; domain: string } | null {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_[ce]id$|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') parsed.pathname = parsed.pathname.slice(0, -1);
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return { normalizedUrl: parsed.toString(), domain };
  } catch {
    return null;
  }
}

export function isDomainBlocked(domain: string, policies: DomainPolicy[]): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return policies.some((policy) => {
    const target = policy.domain.toLowerCase().replace(/^www\./, '');
    return policy.mode === 'block' && (normalized === target || normalized.endsWith(`.${target}`) || normalized.includes(target));
  });
}

export function canCollectContent(domain: string, policies: DomainPolicy[]): boolean {
  if (isDomainBlocked(domain, policies)) return false;
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return policies.some((policy) => {
    const target = policy.domain.toLowerCase().replace(/^www\./, '');
    return policy.mode === 'allow' && policy.collectContent && (normalized === target || normalized.endsWith(`.${target}`));
  });
}

export function safeVisitView(visit: BrowserVisit) {
  return {
    id: visit.id,
    domain: visit.domain,
    title: visit.title,
    lastVisitTime: visit.lastVisitTime,
    visitCount: visit.visitCount,
    contentStatus: visit.contentStatus,
  };
}

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
