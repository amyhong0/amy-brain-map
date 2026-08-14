export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';
export type CandidateKind = 'interest' | 'revisit' | 'bridge';

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

export interface RecentVisit {
  id: string;
  domain: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
  contentStatus: 'metadata_only' | 'eligible' | 'extracted' | 'blocked';
}

export interface DomainPolicy {
  domain: string;
  mode: 'allow' | 'block';
  collectContent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnconsciousSettings {
  analysisRunsPerDay: 1 | 2;
  autoApplyThreshold: number;
  maxVisitsPerRun: number;
  retentionDays: number;
  lastAnalyzedAt?: string;
  lastSyncedAt?: string;
}

export interface PrivacySnapshot {
  settings: UnconsciousSettings;
  policies: DomainPolicy[];
  totalVisits: number;
  pendingCandidates: number;
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
