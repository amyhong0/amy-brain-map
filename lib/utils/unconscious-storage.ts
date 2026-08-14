import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const USE_VERCEL_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const LOCAL_STORE_PATH = path.join(process.cwd(), 'data', 'unconscious-history.json');
const BLOB_PATH = 'private/unconscious-history.enc';
const STORE_VERSION = 1;

export type PolicyMode = 'allow' | 'block';
export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';
export type CandidateKind = 'interest' | 'revisit' | 'bridge';

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
  contentStatus: 'metadata_only' | 'eligible' | 'extracted' | 'blocked';
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

const DEFAULT_SETTINGS: UnconsciousSettings = {
  analysisRunsPerDay: 1,
  autoApplyThreshold: 0.88,
  maxVisitsPerRun: 500,
  retentionDays: 365,
};

const DEFAULT_BLOCKED_DOMAINS = [
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

function defaultStore(): UnconsciousStore {
  return {
    version: STORE_VERSION,
    visits: [],
    policies: DEFAULT_BLOCKED_DOMAINS.map((domain) => ({
      domain,
      mode: 'block',
      collectContent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    candidates: [],
    analysisRuns: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeStore(value: Partial<UnconsciousStore> | null): UnconsciousStore {
  const base = defaultStore();
  return {
    version: STORE_VERSION,
    visits: Array.isArray(value?.visits) ? value!.visits : base.visits,
    policies: Array.isArray(value?.policies) ? value!.policies : base.policies,
    candidates: Array.isArray(value?.candidates) ? value!.candidates : base.candidates,
    analysisRuns: Array.isArray(value?.analysisRuns) ? value!.analysisRuns : base.analysisRuns,
    settings: { ...base.settings, ...(value?.settings || {}) },
  };
}

function encryptionKey(): Buffer {
  const configured = process.env.BROWSER_HISTORY_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error('BROWSER_HISTORY_ENCRYPTION_KEY is required when Vercel Blob storage is enabled. Use a 32-byte random key encoded as 64 hexadecimal characters.');
  }
  if (!/^[a-fA-F0-9]{64}$/.test(configured)) {
    throw new Error('BROWSER_HISTORY_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  }
  return Buffer.from(configured, 'hex');
}

function encrypt(plainText: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') });
}

function decrypt(payload: string): string {
  const envelope = JSON.parse(payload) as { v: number; iv: string; tag: string; data: string };
  if (envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.data) throw new Error('Invalid encrypted history payload.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
}

async function readRawStore(): Promise<string | null> {
  if (!USE_VERCEL_BLOB) {
    try {
      return await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
  if (!blobs[0]) return null;
  const response = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to read encrypted browsing-history store.');
  return response.text();
}

async function writeRawStore(value: string): Promise<void> {
  if (!USE_VERCEL_BLOB) {
    await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_STORE_PATH, value, 'utf8');
    return;
  }

  const { put } = await import('@vercel/blob');
  await put(BLOB_PATH, encrypt(value), {
    access: 'public',
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function loadUnconsciousStore(): Promise<UnconsciousStore> {
  const raw = await readRawStore();
  if (!raw) return defaultStore();
  const decoded = USE_VERCEL_BLOB ? decrypt(raw) : raw;
  return normalizeStore(JSON.parse(decoded) as Partial<UnconsciousStore>);
}

export async function saveUnconsciousStore(store: UnconsciousStore): Promise<void> {
  const normalized = normalizeStore(store);
  await writeRawStore(JSON.stringify(normalized));
}

export async function updateUnconsciousStore<T>(updater: (store: UnconsciousStore) => T | Promise<T>): Promise<T> {
  const store = await loadUnconsciousStore();
  const result = await updater(store);
  await saveUnconsciousStore(store);
  return result;
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

export function pruneExpiredData(store: UnconsciousStore, now = Date.now()) {
  const cutoff = now - store.settings.retentionDays * 24 * 60 * 60 * 1000;
  const retainedIds = new Set(store.visits.filter((visit) => visit.lastVisitTime >= cutoff).map((visit) => visit.id));
  store.visits = store.visits.filter((visit) => retainedIds.has(visit.id));
  store.candidates = store.candidates.filter((candidate) => candidate.sourceVisitIds.some((id) => retainedIds.has(id)) || candidate.status !== 'pending');
}

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export { DEFAULT_SETTINGS };
