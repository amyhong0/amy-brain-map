import {
  sessionizeVisits,
  cleanTitleText,
  extractMeaningfulTerms,
  extractTripletsFallback,
  extractTripletsWithLLM,
  relationLabel,
} from '@/lib/unconscious-kg-engine';
import { BrowserVisit } from '@/lib/utils/unconscious-storage';

describe('unconscious-kg-engine', () => {
  const baseTime = Date.parse('2026-08-15T10:00:00Z');

  function makeVisit(id: string, domain: string, title: string, minuteOffset: number, visitCount = 1): BrowserVisit {
    return {
      id,
      userId: 'test-user',
      installationId: 'inst-1',
      normalizedUrl: `https://${domain}/p/${id}`,
      url: `https://${domain}/p/${id}`,
      title,
      domain,
      lastVisitTime: baseTime + minuteOffset * 60 * 1000,
      visitCount,
      receivedAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
      contentStatus: 'metadata_only',
    };
  }

  describe('cleanTitleText and extractMeaningfulTerms', () => {
    it('strips email sender noise and UI suffixes', () => {
      const dirty = '김연준님이 방금 메시지를 보냈습니다. - heywon16@gmail.com - Gmail';
      const cleaned = cleanTitleText(dirty);
      expect(cleaned).not.toContain('Gmail');
      expect(cleaned).not.toContain('heywon16@gmail.com');
    });

    it('filters out generic UI terms, dates, and numbers', () => {
      const terms = extractMeaningfulTerms('2026 해커톤 대시보드 편집 수강신청내역 마이페이지 Tableau 분석');
      expect(terms).not.toContain('2026');
      expect(terms).not.toContain('편집');
      expect(terms).not.toContain('수강신청내역');
      expect(terms).not.toContain('마이페이지');
      expect(terms).toContain('해커톤');
      expect(terms).toContain('대시보드');
      expect(terms).toContain('tableau');
      expect(terms).toContain('분석');
    });
  });

  describe('sessionizeVisits', () => {
    it('splits visits into distinct sessions when gap exceeds threshold', () => {
      const visits: BrowserVisit[] = [
        makeVisit('1', 'tableau.com', 'FDA 분석 대시보드', 0),
        makeVisit('2', 'tableau.com', 'FDA 지표 확인', 10),
        // 40 min gap -> new session
        makeVisit('3', 'vercel.com', 'MindTracker 프로젝트 배포', 50),
        makeVisit('4', 'github.com', 'MindTracker 저장소 커밋', 60),
      ];

      const sessions = sessionizeVisits(visits, 25 * 60 * 1000);
      expect(sessions.length).toBe(2);
      expect(sessions[0].visits.length).toBe(2);
      expect(sessions[0].primaryDomains).toContain('tableau.com');
      expect(sessions[1].visits.length).toBe(2);
      expect(sessions[1].primaryDomains).toContain('vercel.com');
    });
  });

  describe('extractTripletsFallback', () => {
    it('generates co-occurring bridges and interest candidates from sessions', () => {
      const visits: BrowserVisit[] = [
        makeVisit('1', 'tableau.com', 'FDA 부작용 분석', 0, 5),
        makeVisit('2', 'jupyter.org', 'FDA 데이터 전처리', 5, 3),
        makeVisit('3', 'tableau.com', 'FDA 시각화 차트', 12, 4),
      ];
      const sessions = sessionizeVisits(visits);
      const result = extractTripletsFallback(sessions, 0.88, 'run-1', '2026-08-15T12:00:00Z');

      expect(result.usedLLM).toBe(false);
      expect(result.candidates.length).toBeGreaterThan(0);
      const bridge = result.candidates.find((c) => c.kind === 'bridge');
      expect(bridge).toBeDefined();
    });
  });

  describe('extractTripletsWithLLM', () => {
    it('falls back when apiKey is missing', async () => {
      const visits = [makeVisit('1', 'test.com', 'Test Title', 0)];
      const sessions = sessionizeVisits(visits);
      const result = await extractTripletsWithLLM(sessions, '', 0.88, 'run-1', '2026-08-15T12:00:00Z');
      expect(result.usedLLM).toBe(false);
    });

    it('parses valid LLM response into rich triplets and candidates', async () => {
      const visits = [
        makeVisit('1', 'tableau.com', 'FDA 부작용 분석', 0),
        makeVisit('2', 'vercel.com', 'MindTracker 배포', 5),
      ];
      const sessions = sessionizeVisits(visits);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  triplets: [
                    {
                      subject: 'Tableau',
                      subjectKind: 'tool',
                      relation: 'USED_IN',
                      relationLabel: '분석 시각화 도구로 활용됨',
                      object: 'FDA 부작용 분석',
                      objectKind: 'project',
                      confidence: 0.9,
                      evidence: 'Tableau를 사용해 FDA 데이터 시각화 작업을 진행함.',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await extractTripletsWithLLM(sessions, 'nvapi-dummy', 0.88, 'run-1', '2026-08-15T12:00:00Z');
      expect(result.usedLLM).toBe(true);
      expect(result.triplets.length).toBe(1);
      expect(result.triplets[0].subject).toBe('Tableau');
      expect(result.triplets[0].relation).toBe('USED_IN');
      expect(result.triplets[0].object).toBe('FDA 부작용 분석');

      const bridgeCandidate = result.candidates.find((c) => c.kind === 'bridge');
      expect(bridgeCandidate).toBeDefined();
      expect(bridgeCandidate?.subject).toBe('Tableau');
      expect(bridgeCandidate?.object).toBe('FDA 부작용 분석');
    });
  });

  describe('real visits simulation', () => {
    it('successfully processes real browsing history into clean sessions and candidates', () => {
      const simVisitsPath = 'C:/Users/heywo/.gemini/antigravity-ide/brain/9ad0ace2-7c83-44fb-ae8c-19c3a5731b86/scratch/sim_visits.json';
      let realVisits: BrowserVisit[] = [];
      try {
        const fs = require('fs');
        if (fs.existsSync(simVisitsPath)) {
          realVisits = JSON.parse(fs.readFileSync(simVisitsPath, 'utf8'));
        }
      } catch {
        // fallback to empty if scratch not accessible
      }

      if (realVisits.length === 0) return; // skip if scratch not available

      const sessions = sessionizeVisits(realVisits);
      expect(sessions.length).toBeGreaterThan(0);

      const result = extractTripletsFallback(sessions, 0.88, 'sim-run', '2026-09-09T00:00:00Z');
      expect(result.candidates.length).toBeGreaterThan(0);

      // Verify noise like '2026', '내역', '수강신청' are NOT subjects
      const subjects = result.candidates.map((c) => c.subject.toLowerCase());
      expect(subjects).not.toContain('2026');
      expect(subjects).not.toContain('내역');
      expect(subjects).not.toContain('수강신청내역');
      expect(subjects).not.toContain('마이페이지');
    });
  });
});

