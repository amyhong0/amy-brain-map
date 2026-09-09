import { BrowserVisit, DiscoveryCandidate } from '@/lib/utils/unconscious-storage';

export type EntityKind = 'project' | 'tool' | 'learning' | 'domain_concept' | 'concept';

export type RelationType =
  | 'USED_IN'        // 도구/기술 -> 프로젝트/작업 (예: Tableau -> FDA 부작용 분석)
  | 'RESEARCHED'     // 연구/탐색한 대상 (예: NVIDIA API -> AI 에이전트 설계)
  | 'LEARNING'       // 학습 중인 기술/강의 (예: Docker -> 클라우드 인프라)
  | 'DEPLOYED_TO'    // 프로젝트 -> 배포 플랫폼 (예: MindTracker -> Vercel)
  | 'CONNECTED_TO';  // 동일 맥락에서 연관된 개념/프로젝트

export interface BrowsingSession {
  id: string;
  startTime: number;
  endTime: number;
  visits: BrowserVisit[];
  primaryDomains: string[];
  totalVisitCount: number;
  sessionTitleHint: string;
}

export interface ExtractedKnowledgeTriplet {
  subject: string;
  subjectKind: EntityKind;
  relation: RelationType;
  relationLabel: string;
  object: string;
  objectKind: EntityKind;
  confidence: number;
  evidence: string;
  sourceVisitIds: string[];
  sourceDomains: string[];
}

export interface KnowledgeGraphExtractionResult {
  triplets: ExtractedKnowledgeTriplet[];
  candidates: DiscoveryCandidate[];
  usedLLM: boolean;
  sessionCount: number;
}
