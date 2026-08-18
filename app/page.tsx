'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, BrainCircuit, Check, Copy, ExternalLink,
  ListChecks, LogIn, LogOut, Network, Play, RefreshCw, Search, Send, ShieldCheck, Sparkles, Trash2, UserRound, X,
} from 'lucide-react';
import UnconsciousMap from '@/components/unconscious/UnconsciousMap';
import { candidateReviewCopy } from '@/components/unconscious/ReviewQueue';
import { AnalysisRun, DiscoveryCandidate, PrivacySnapshot, RecentVisit } from '@/components/unconscious/types';

interface WebSource { title: string; url: string; snippet: string; }
interface SessionUser { id: string; email: string; name: string | null; picture: string | null; }
interface QueryResult {
  answer: string;
  highlightedCandidateIds: string[];
  matchedVisits: Array<RecentVisit & { score: number }>;
  matchedCandidates: Array<DiscoveryCandidate & { score: number }>;
  trace: Array<{ agent: string; status: 'completed' | 'fallback'; summary: string }>;
  webSearchUsed?: boolean;
  webSearchConfigured?: boolean;
  webSources?: WebSource[];
}

const EXAMPLE_QUESTION = '내가 어제 본 것 중에 AI 콘텐츠 제작 관련된 게 뭐더라?';

function formatDate(value?: number | string) {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function requestHeaders() { return { 'Content-Type': 'application/json' }; }

function visitorFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes('DATABASE_URL') || message.includes('GCS_')) {
    return '개인 기록 저장소가 아직 준비되지 않았습니다. 잠시 후 다시 시도하거나 서비스 관리자에게 문의하세요.';
  }
  return message || fallback;
}

function StatusPill({ children, tone = 'violet' }: { children: React.ReactNode; tone?: 'violet' | 'green' | 'amber' | 'slate' }) {
  const styles = {
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return <span data-tone={tone} className={`aether-status inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[tone]}`}>{children}</span>;
}

function Metric({ value, label, tone = 'blue' }: { value: number | string; label: string; tone?: 'blue' | 'violet' | 'amber' | 'green' }) {
  const colors = {
    blue: 'from-blue-50 to-cyan-50 text-blue-700 ring-blue-100',
    violet: 'from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 ring-amber-100',
    green: 'from-emerald-50 to-teal-50 text-emerald-700 ring-emerald-100',
  };
  return <div className={`aether-metric rounded-2xl p-3.5 ${colors[tone]}`}><p className="text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-1 text-[11px] font-medium text-slate-600">{label}</p></div>;
}

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySnapshot | null>(null);
  const [visits, setVisits] = useState<RecentVisit[]>([]);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [question, setQuestion] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<DiscoveryCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);
  const [historySyncProgress, setHistorySyncProgress] = useState<number | null>(null);
  const [historySyncMessage, setHistorySyncMessage] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [policyDomain, setPolicyDomain] = useState('');
  const [pendingPolicyRemoval, setPendingPolicyRemoval] = useState<string | null>(null);
  const [isRemovingPolicy, setIsRemovingPolicy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [settingsResponse, visitsResponse, candidatesResponse] = await Promise.all([
        fetch('/api/unconscious/settings', { cache: 'no-store' }),
        fetch('/api/unconscious/visits?limit=40', { cache: 'no-store' }),
        fetch('/api/unconscious/analyze?limit=80', { cache: 'no-store' }),
      ]);
      const [settingsData, visitsData, candidatesData] = await Promise.all([settingsResponse.json(), visitsResponse.json(), candidatesResponse.json()]);
      if (!settingsResponse.ok) throw new Error(settingsData.error || '지도 설정을 불러오지 못했습니다.');
      if (!visitsResponse.ok) throw new Error(visitsData.error || '탐색 흔적을 불러오지 못했습니다.');
      if (!candidatesResponse.ok) throw new Error(candidatesData.error || '연결 가설을 불러오지 못했습니다.');
      setPrivacy(settingsData);
      setVisits(visitsData.visits || []);
      setCandidates(candidatesData.candidates || []);
      setRuns(candidatesData.recentRuns || []);
    } catch (loadError) {
      setError(visitorFacingError(loadError, '데이터를 불러오는 중 오류가 발생했습니다.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get('authError');
    if (!authError) return;
    const messages: Record<string, string> = {
      configuration: 'Google 로그인 설정이 아직 완료되지 않았습니다. 서비스 운영자가 배포 URL, Google OAuth 키, 세션 비밀값을 확인해야 합니다.',
      state: '로그인 요청이 만료되었거나 브라우저 보안 확인에 실패했습니다. 다시 시작해 주세요.',
      oauth: 'Google 로그인 처리 중 오류가 발생했습니다. OAuth Redirect URI와 배포 환경 변수를 확인해 주세요.',
    };
    setError(messages[authError] || 'Google 로그인 중 오류가 발생했습니다. 다시 시도해 주세요.');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const response = await fetch('/api/auth', { cache: 'no-store' });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(data.error || '로그인 상태를 확인하지 못했습니다.');
        if (data.authenticated && data.user) {
          setUser(data.user);
          await loadData();
        }
      } catch {
        if (active) setError('로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도하세요.');
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [loadData]);

  const startGoogleLogin = () => { window.location.assign('/api/auth/login'); };

  const logout = async () => {
    await fetch('/api/auth', { method: 'POST' });
    setUser(null);
    setPrivacy(null);
    setVisits([]);
    setCandidates([]);
    setRuns([]);
    setQueryResult(null);
    setSelectedCandidate(null);
  };

  const exportMyData = async () => {
    if (!user || isExporting) return;
    setIsExporting(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/archives', { method: 'POST', headers: requestHeaders(), body: JSON.stringify({ kind: 'export' }) });
      const data = await response.json();
      if (!response.ok || !data.archive?.id) throw new Error(data.error || '내보내기 파일을 만들 수 없습니다.');
      window.location.assign(`/api/unconscious/archives/${encodeURIComponent(data.archive.id)}`);
      setHistorySyncMessage('암호화된 내보내기를 준비했습니다. 다운로드가 곧 시작됩니다.');
    } catch (exportError) {
      setError(visitorFacingError(exportError, '내보내기 파일을 만들 수 없습니다.'));
    } finally {
      setIsExporting(false);
    }
  };

  const requestHistoryFromChrome = async () => {
    if (!user || isHistorySyncing) return;
    setIsHistorySyncing(true);
    setHistorySyncProgress(0);
    setHistorySyncMessage('Chrome 확장 프로그램을 자동으로 연결하고 방문 기록을 준비하는 중…');
    setError('');
    try {
      const connectionResponse = await fetch('/api/unconscious/extension/connect-code', { method: 'POST', headers: requestHeaders() });
      const connectionData = await connectionResponse.json();
      if (!connectionResponse.ok || !connectionData.code) throw new Error(connectionData.error || 'Chrome 확장 프로그램 연결을 준비하지 못했습니다.');

      const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const result = await new Promise<{ queuedFromHistory?: number; synced?: number; error?: string }>((resolve, reject) => {
        let bridgeTimeoutId: number | null = null;
        let syncTimeoutId: number | null = null;
        const cleanUp = () => {
          if (bridgeTimeoutId !== null) window.clearTimeout(bridgeTimeoutId);
          if (syncTimeoutId !== null) window.clearTimeout(syncTimeoutId);
          window.removeEventListener('message', handleMessage);
        };
        bridgeTimeoutId = window.setTimeout(() => {
          cleanUp();
          reject(new Error('자동 연결을 시작하지 못했습니다. Chrome 확장 프로그램을 v0.6.0 이상으로 새로고침한 뒤 이 웹 페이지도 새로고침하고 다시 시도하세요.'));
        }, 15_000);
        function handleMessage(event: MessageEvent) {
          if (event.source !== window || event.origin !== window.location.origin) return;
          const response = event.data;
          if (response?.source !== 'amy-brain-map-extension' || response?.requestId !== requestId) return;
          if (response.type === 'initial-history-sync-started') {
            if (bridgeTimeoutId !== null) window.clearTimeout(bridgeTimeoutId);
            syncTimeoutId = window.setTimeout(() => {
              cleanUp();
              reject(new Error('Chrome 기록 동기화가 너무 오래 걸리고 있습니다. 확장 프로그램 팝업의 오류 메시지를 확인한 뒤 다시 시도하세요.'));
            }, 20 * 60 * 1_000);
            setHistorySyncMessage('Chrome 프로필이 자동으로 연결되었습니다. 기록을 찾아 동기화를 시작합니다…');
            return;
          }
          if (response.type === 'initial-history-sync-progress') {
            const state = response.state || {};
            const total = Number(state.totalCount || 0);
            const synced = Number(state.syncedCount || 0);
            if (total > 0) {
              const percentage = Math.min(100, Math.round((synced / total) * 100));
              setHistorySyncProgress(percentage);
              setHistorySyncMessage(`Chrome 기록 동기화 중… ${percentage}% · ${synced.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}개`);
            }
            return;
          }
          if (response.type !== 'initial-history-sync-result') return;
          cleanUp();
          resolve(response.result || {});
        }
        window.addEventListener('message', handleMessage);
        window.postMessage({ source: 'amy-brain-map-dashboard', type: 'auto-connect-and-initial-history-sync', requestId, connectCode: connectionData.code }, window.location.origin);
      });
      if (result.error) throw new Error(result.error);
      setIsAnalyzing(true);
      const analysisResponse = await fetch('/api/unconscious/analyze', { method: 'POST', headers: requestHeaders() });
      const analysisData = await analysisResponse.json();
      if (!analysisResponse.ok) throw new Error(analysisData.error || '동기화된 흔적을 분석하지 못했습니다.');
      await loadData();
      if (analysisData.candidates?.[0]) setSelectedCandidate(analysisData.candidates[0]);
      const total = Number(result.queuedFromHistory || 0);
      if (total > 0) setHistorySyncProgress(100);
      setHistorySyncMessage(total > 0 ? `${total.toLocaleString('ko-KR')}개의 Chrome 기록을 읽어 지도에 반영했습니다.` : '새로 가져올 Chrome 기록이 없습니다. 확장 프로그램은 이후 방문을 자동으로 동기화합니다.');
    } catch (syncError) {
      setError(visitorFacingError(syncError, 'Chrome 기록을 가져오지 못했습니다.'));
      setHistorySyncProgress(null);
      setHistorySyncMessage('Chrome 확장 프로그램이 설치·활성화되어 있는지 확인한 뒤 다시 시도하세요.');
    } finally {
      setIsAnalyzing(false);
      setIsHistorySyncing(false);
    }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = question.trim();
    if (!message || !user) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/query', { method: 'POST', headers: requestHeaders(), body: JSON.stringify({ message, webSearch: webSearchEnabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '질문을 처리하지 못했습니다.');
      setQueryResult(data);
      if (data.matchedCandidates?.[0]) setSelectedCandidate(data.matchedCandidates[0]);
    } catch (queryError) {
      setError(visitorFacingError(queryError, '질문 중 오류가 발생했습니다.'));
    } finally {
      setIsLoading(false);
    }
  };

  const updateCandidate = async (candidate: DiscoveryCandidate, status: 'approved' | 'rejected' | 'pending') => {
    if (!user) return;
    try {
      const response = await fetch(`/api/unconscious/candidates/${candidate.id}`, { method: 'PATCH', headers: requestHeaders(), body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '연결 상태를 변경하지 못했습니다.');
      const updated = data.candidate as DiscoveryCandidate;
      const nextCandidates = candidates.map((item) => item.id === updated.id ? updated : item);
      const nextPending = status === 'pending' ? undefined : nextCandidates.find((item) => item.status === 'pending');
      setCandidates(nextCandidates);
      setSelectedCandidate(nextPending || updated);
      if (status === 'approved') setApprovalNotice(nextPending ? '이 연결 검토 대상을 지도에 반영했습니다. 아래에서 다음 대상을 계속 검토하세요.' : '이 연결 검토 대상을 내 지도에 반영했습니다.');
      if (status === 'rejected') setApprovalNotice(nextPending ? '이 연결 검토 대상을 제외했습니다. 아래에서 다음 대상을 계속 검토하세요.' : '이 연결 검토 대상을 제외했습니다. 원래 방문 기록은 그대로 유지됩니다.');
    } catch (updateError) {
      setError(visitorFacingError(updateError, '연결 상태를 변경하지 못했습니다.'));
    }
  };

  const approveAllPending = async () => {
    if (!user || isApprovingAll || summary.pending === 0) return;
    setIsApprovingAll(true);
    setError('');
    setApprovalNotice('');
    try {
      const response = await fetch('/api/unconscious/candidates', { method: 'PATCH', headers: requestHeaders(), body: JSON.stringify({ action: 'approve_all_pending' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '검토 대기 제안을 한 번에 반영하지 못했습니다.');
      const approved = (data.candidates || []) as DiscoveryCandidate[];
      const byId = new Map(approved.map((candidate) => [candidate.id, candidate]));
      setCandidates((current) => current.map((candidate) => byId.get(candidate.id) || candidate));
      setSelectedCandidate((current) => current ? byId.get(current.id) || current : current);
      setApprovalNotice(`${Number(data.approvedCount || approved.length).toLocaleString('ko-KR')}개의 제안을 내 지도에 반영했습니다.`);
    } catch (approvalError) {
      setError(visitorFacingError(approvalError, '검토 대기 제안을 한 번에 반영하지 못했습니다.'));
    } finally {
      setIsApprovingAll(false);
    }
  };

  const addBlockedDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !policyDomain.trim()) return;
    try {
      const response = await fetch('/api/unconscious/settings', { method: 'PATCH', headers: requestHeaders(), body: JSON.stringify({ policy: { domain: policyDomain, mode: 'block', collectContent: false } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '제외 규칙을 저장하지 못했습니다.');
      setPrivacy(data);
      setPolicyDomain('');
      setSettingsNotice(`“${policyDomain.trim()}”을(를) 수집 제외 목록에 추가했습니다.`);
    } catch (policyError) {
      setError(visitorFacingError(policyError, '제외 규칙을 저장하지 못했습니다.'));
    }
  };

  const removeBlockedDomain = async () => {
    const domain = pendingPolicyRemoval;
    if (!user || !domain || isRemovingPolicy) return;
    setIsRemovingPolicy(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/settings', { method: 'PATCH', headers: requestHeaders(), body: JSON.stringify({ removePolicyDomain: domain }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '수집 제외 목록에서 도메인을 삭제하지 못했습니다.');
      setPrivacy(data);
      setPendingPolicyRemoval(null);
      setSettingsNotice(`“${domain}”을(를) 수집 제외 목록에서 삭제했습니다.`);
    } catch (policyError) {
      setError(visitorFacingError(policyError, '수집 제외 목록에서 도메인을 삭제하지 못했습니다.'));
    } finally {
      setIsRemovingPolicy(false);
    }
  };

  const summary = useMemo(() => ({
    pending: candidates.filter((item) => item.status === 'pending').length,
    confirmed: candidates.filter((item) => item.status === 'approved' || item.status === 'auto_applied').length,
    latestRun: runs.find((run) => run.status === 'completed'),
  }), [candidates, runs]);
  const highlightedIds = queryResult?.highlightedCandidateIds || [];
  const visibleVisits = queryResult?.matchedVisits || visits;
  const pendingCandidates = useMemo(() => candidates.filter((candidate) => candidate.status === 'pending'), [candidates]);
  const blockedPolicies = useMemo(() => (privacy?.policies || []).filter((policy) => policy.mode === 'block'), [privacy]);
  const needsConnection = user && visits.length === 0;

  return (
    <main className="aether-dashboard brain-canvas min-h-screen text-slate-900">
      <div className="neural-grid pointer-events-none fixed inset-0" />
      <div className="relative w-full px-4 pb-10 md:px-8 lg:px-10">
        <header className="aether-header sticky top-0 z-30 -mx-4 flex min-h-[76px] items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
          <div className="flex min-w-0 items-center gap-3"><div className="aether-logo grid h-11 w-11 shrink-0 place-items-center rounded-2xl"><BrainCircuit className="h-5 w-5 text-white" aria-hidden="true" /></div><div className="min-w-0"><p className="text-[10px] font-extrabold tracking-[0.22em] text-blue-600">PERSONAL COGNITIVE ATLAS</p><h1 className="truncate text-xl font-extrabold tracking-tight text-slate-950">Amy Brain Map</h1></div></div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={user ? 'green' : 'amber'}><span className={`h-1.5 w-1.5 rounded-full ${user ? 'bg-emerald-500' : 'bg-amber-500'}`} />{authLoading ? '확인 중' : user ? '계정 보안' : '로그인 필요'}</StatusPill>
            {user && <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="hidden rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 sm:inline-flex">탐색 기록 설정</button>}
            {user && <button type="button" onClick={logout} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"><LogOut className="h-3.5 w-3.5" />로그아웃</button>}
          </div>
        </header>

        {!authLoading && !user && <section className="brain-card mt-6 overflow-hidden rounded-3xl border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 md:p-6"><div className="flex flex-col gap-6"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-bold text-amber-900"><UserRound className="h-4 w-4" aria-hidden="true" />처음 오셨나요?</div><h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">나의 탐색 지도를 시작하는 3단계</h2><p className="mt-2 text-sm leading-6 text-slate-600">아래 순서로 한 번만 연결하면, 이후에는 Chrome에서 쌓인 탐색 흔적을 지도로 읽어볼 수 있습니다.</p></div><ol className="grid gap-3 md:grid-cols-3"><li className="rounded-2xl border border-amber-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-900">1</span><div><p className="text-sm font-extrabold text-slate-900">Google 계정으로 시작</p><p className="mt-1 text-xs leading-5 text-slate-600">아래 버튼을 눌러 나만의 지도에 로그인합니다.</p></div></div></li><li className="rounded-2xl border border-blue-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-800">2</span><div><p className="text-sm font-extrabold text-slate-900">Chrome 확장 프로그램 설치</p><p className="mt-1 text-xs leading-5 text-slate-600">Chrome에서 Amy Brain Map 확장 프로그램을 설치합니다.</p></div></div></li><li className="rounded-2xl border border-violet-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-800">3</span><div><p className="text-sm font-extrabold text-slate-900">Chrome 기록 가져오기</p><p className="mt-1 text-xs leading-5 text-slate-600">로그인 뒤 Chrome 기록 가져오기 버튼을 누르면 자동으로 연결하고 기록을 가져옵니다.</p></div></div></li></ol><div className="flex flex-col gap-3 border-t border-amber-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">별도의 연결 코드 입력 없이 버튼 한 번으로 현재 Chrome 프로필을 연결합니다.</p><button type="button" onClick={startGoogleLogin} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><LogIn className="h-4 w-4" aria-hidden="true" />Google로 시작하기</button></div></div></section>}

        {needsConnection && <section className="aether-panel-grid brain-card mt-5 rounded-3xl p-5 md:p-6"><div className="grid gap-5 lg:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2 text-sm font-extrabold text-slate-950"><Network className="h-4 w-4" aria-hidden="true" />Chrome 기록 가져오기</div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Amy Brain Map 확장 프로그램이 설치되어 있다면, 아래 버튼을 한 번만 누르세요. 현재 로그인한 계정과 이 Chrome 프로필을 자동으로 연결한 뒤 방문 기록을 가져옵니다.</p></div><button type="button" onClick={requestHistoryFromChrome} disabled={isHistorySyncing || isAnalyzing} className="aether-action-primary inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55">{isHistorySyncing || isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isHistorySyncing ? 'Chrome 기록을 읽는 중…' : isAnalyzing ? '패턴을 분석하는 중…' : 'Chrome 기록 가져오기'}</button></div></section>}

        {settingsOpen && <section className="brain-card mt-5 grid gap-4 rounded-3xl p-5 md:p-6 lg:grid-cols-[1fr_1fr_auto]"><div><p className="text-base font-bold text-slate-900">탐색 기록 설정</p><p className="mt-2 text-sm leading-6 text-slate-600">수집 범위와 수집 제외 도메인을 관리합니다. URL·제목·방문 시각·방문 횟수만 기록하며, 페이지 본문은 읽거나 저장하지 않습니다.</p><button type="button" onClick={exportMyData} disabled={isExporting} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55">{isExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{isExporting ? '내보내기 준비 중' : '내 기록 내보내기'}</button></div><form onSubmit={addBlockedDomain} className="flex items-end gap-2"><label className="block flex-1 text-xs font-semibold text-slate-600">수집에서 제외할 도메인<input value={policyDomain} onChange={(event) => setPolicyDomain(event.target.value)} placeholder="예: bank.example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><button className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100">차단</button></form><div className="flex items-start justify-end"><button type="button" aria-label="탐색 기록 설정 닫기" onClick={() => setSettingsOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" aria-hidden="true" /></button></div><div className="lg:col-span-3 border-t border-slate-100 pt-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold tracking-[0.12em] text-slate-700">수집 제외 목록</p><StatusPill tone="slate">{blockedPolicies.length}개</StatusPill></div>{blockedPolicies.length ? <div role="list" aria-label="수집 제외 도메인" className="mt-3 flex max-h-40 flex-wrap content-start gap-2 overflow-y-auto pr-1">{blockedPolicies.map((policy) => <div role="listitem" key={policy.domain} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 pl-3 text-xs font-semibold text-slate-700"><span className="truncate">{policy.domain}</span><button type="button" onClick={() => setPendingPolicyRemoval(policy.domain)} aria-label={`수집 제외 목록에서 ${policy.domain} 삭제`} className="ml-1 grid h-10 w-10 place-items-center rounded-r-xl text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button></div>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">아직 수집에서 제외한 도메인이 없습니다.</p>}</div>{settingsNotice && <p role="status" aria-live="polite" className="lg:col-span-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs font-semibold leading-5 text-emerald-800">{settingsNotice}</p>}</section>}

        {pendingPolicyRemoval && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="remove-domain-title" aria-describedby="remove-domain-description" className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold tracking-[0.14em] text-rose-700">수집 제외 목록 변경</p><h2 id="remove-domain-title" className="mt-2 text-lg font-extrabold text-slate-950">이 도메인을 삭제할까요?</h2></div><button type="button" onClick={() => setPendingPolicyRemoval(null)} disabled={isRemovingPolicy} aria-label="삭제 확인 닫기" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" /></button></div><p id="remove-domain-description" className="mt-3 text-sm leading-6 text-slate-600">“{pendingPolicyRemoval}”은(는) 이후 Chrome 기록 수집에서 다시 제외되지 않습니다. 이미 저장된 기록은 삭제되지 않습니다.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPendingPolicyRemoval(null)} disabled={isRemovingPolicy} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">취소</button><button type="button" onClick={removeBlockedDomain} disabled={isRemovingPolicy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-55">{isRemovingPolicy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}{isRemovingPolicy ? '삭제 중' : '목록에서 삭제'}</button></div></div></div>}

        {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}
        {approvalNotice && <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{approvalNotice}</div>}

        <section className="mt-6 grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_360px] xl:items-start">
          <aside className="brain-card order-2 rounded-3xl p-4 xl:order-1 xl:sticky xl:top-24"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Network className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Map lens</p><p className="text-sm font-bold text-slate-900">한눈에 보는 흐름</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><Metric value={privacy?.totalVisits ?? '—'} label="기록된 탐색" /><Metric value={candidates.length} label="발견한 패턴" tone="violet" /><Metric value={summary.pending} label="연결 검토 대상" tone="amber" /><Metric value={summary.confirmed} label="지도에 반영됨" tone="green" /></div><div className="mt-5 rounded-2xl bg-slate-50 p-3"><div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><p className="text-[11px] leading-5 text-slate-600">{summary.latestRun ? `최근 분석에서 ${summary.latestRun.visitCount}개의 새 기록을 읽고 ${summary.latestRun.candidateCount}개의 지도 패턴을 만들었습니다.` : 'Chrome 기록을 가져오면 반복 관심과 주제 사이의 연결을 찾아 제안합니다.'}</p></div></div></aside>

          <div className="order-1 min-w-0 space-y-5 xl:order-2"><section className="aether-hero relative isolate overflow-hidden rounded-3xl border p-6 text-white md:p-8"><div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full border border-white/15" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-[18%] h-64 w-64 rounded-full bg-violet-500/[.14] blur-3xl" /><div className="relative flex flex-col gap-6"><div className="max-w-none"><p className="text-xs font-extrabold tracking-[0.24em] text-blue-200">THOUGHTS, MADE VISIBLE</p><h2 className="display-serif break-keep mt-4 text-[30px] font-medium leading-[1.22] tracking-[-0.035em] sm:text-[42px] sm:leading-[1.12] lg:text-[50px] lg:leading-[1.06] lg:tracking-[-0.05em]"><span className="block lg:whitespace-nowrap">스쳐 지나간 웹페이지 속에서,</span><span className="block lg:whitespace-nowrap">내 사고의 흐름을 발견하세요.</span></h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">반복 관심, 시간의 흐름, 잠재적 연결을 엮어 기억보다 먼저 움직이는 사고의 궤적을 보여 줍니다.</p></div><div className="flex shrink-0 flex-col gap-2 lg:self-end lg:items-end"><button type="button" disabled={!user || isHistorySyncing || isAnalyzing} onClick={requestHistoryFromChrome} className="aether-action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55">{isHistorySyncing || isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isHistorySyncing ? 'Chrome 기록을 읽는 중…' : isAnalyzing ? '패턴을 분석하는 중…' : 'Chrome 기록 가져오기'}</button><div className="max-w-[260px] lg:text-right"><p aria-live="polite" className="text-[11px] leading-5 text-slate-300">{historySyncMessage || (user ? 'Chrome에 현재 남아 있는 방문 기록을 읽어와 지도에 반영합니다.' : 'Google 로그인 뒤 본인의 Chrome 프로필을 연결하세요.')}</p>{isHistorySyncing && historySyncProgress !== null && <div className="mt-2 flex items-center gap-2 lg:justify-end"><div role="progressbar" aria-label="Chrome 기록 동기화 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={historySyncProgress} className="h-1.5 w-36 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-blue-300 transition-[width] duration-300" style={{ width: `${historySyncProgress}%` }} /></div><span className="min-w-8 text-right text-[11px] font-bold text-blue-200">{historySyncProgress}%</span></div>}</div></div></div></section><UnconsciousMap candidates={candidates} selectedId={selectedCandidate?.id} highlightedIds={highlightedIds} onSelect={setSelectedCandidate} /></div>

          <aside className="order-3 space-y-5 xl:sticky xl:top-24"><section className="brain-card overflow-hidden rounded-3xl"><div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-violet-50 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Sparkles className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Ask your map</p><h2 className="text-base font-bold text-slate-950">기억 탐색</h2></div></div><StatusPill tone="slate">A2A</StatusPill></div><p className="mt-3 text-xs leading-5 text-slate-600">질문하면 탐색·시간·관계 검증 에이전트가 근거를 고르고, 지도 위 연결을 실시간으로 밝힙니다.</p></div><div className="p-4"><form onSubmit={ask} className="space-y-3"><label className="sr-only" htmlFor="map-question">브레인 맵에 질문하기</label><textarea id="map-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!user || isLoading} rows={4} placeholder={EXAMPLE_QUESTION} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed" /><div className="flex items-center justify-between gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-xs font-bold text-slate-700"><span>웹 검색</span><span className={`relative h-7 w-12 rounded-full transition ${webSearchEnabled ? 'bg-blue-600' : 'bg-slate-200'} ${!user || isLoading ? 'opacity-50' : ''}`}><input checked={webSearchEnabled} onChange={(event) => setWebSearchEnabled(event.target.checked)} disabled={!user || isLoading} type="checkbox" role="switch" aria-label="웹 검색" className="peer sr-only" /><span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-focus-visible:ring-4 peer-focus-visible:ring-blue-200 ${webSearchEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></span></label><button disabled={!user || isLoading || !question.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isLoading ? '탐색 중' : '지도에서 찾기'}</button></div></form><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setQuestion(EXAMPLE_QUESTION)} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">어제 본 AI 제작 자료</button><button type="button" onClick={() => setQuestion('최근 일주일 동안 반복해서 본 주제는 뭐야?')} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">최근 반복 관심</button></div></div></section>
          <section aria-live="polite" className="brain-card rounded-3xl p-4">{queryResult ? <><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-600" /><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-700">Map response</p>{queryResult.webSearchUsed && <StatusPill tone="violet">웹 검색</StatusPill>}</div><p className="mt-3 text-sm font-medium leading-6 text-slate-800">{queryResult.answer}</p><div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{queryResult.trace.map((item) => <div className="flex gap-2 text-[11px]" key={item.agent}><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} /><div><span className="font-bold text-slate-700">{item.agent}</span><p className="mt-0.5 leading-4 text-slate-500">{item.summary}</p></div></div>)}</div>{queryResult.webSearchUsed && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[11px] font-bold text-blue-700">웹 검색 출처</p><div className="mt-2 space-y-2">{(queryResult.webSources || []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="brain-card-interactive block rounded-xl border border-slate-100 bg-slate-50 p-2.5" key={source.url}><div className="flex items-center gap-1"><p className="truncate text-[11px] font-bold text-slate-800">{source.title}</p><ExternalLink className="ml-auto h-3 w-3 shrink-0 text-blue-500" /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{source.snippet}</p></a>)}</div></div>}{webSearchEnabled && !queryResult.webSearchConfigured && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">웹 검색에는 서버의 TAVILY_API_KEY가 필요합니다. 개인 방문 이력은 외부 검색으로 전송되지 않습니다.</p>}</> : <div className="py-5 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Search className="h-5 w-5" /></div><p className="mt-3 text-sm font-bold text-slate-800">무엇이 마음에 남았나요?</p><p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-slate-500">질문을 남기면 관련 노드와 연결이 지도에서 강조됩니다.</p></div>}</section></aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,.58fr)_minmax(0,1.42fr)]">
          <section className="brain-card rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Memory traces</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{queryResult ? '이번 질문에 반응한 흔적' : '최근 탐색 흔적'}</h2></div><div className="flex items-center gap-2">{queryResult && <StatusPill tone="violet">지도 강조 중</StatusPill>}<StatusPill tone="slate">최근 {Math.min(visibleVisits.length, 10)}개</StatusPill></div></div><div role="list" aria-label={queryResult ? '이번 질문에 반응한 탐색 흔적' : '최근 탐색 흔적'} className="mt-4 grid max-h-[720px] gap-3 overflow-y-auto pr-1">{visibleVisits.slice(0, 10).map((visit) => { const score = typeof (visit as unknown as { score?: unknown }).score === 'number' ? (visit as unknown as { score: number }).score : null; return <article role="listitem" key={visit.id} className="brain-card-interactive rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{visit.title || visit.domain}</p>{score !== null && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">{Math.round(score * 100)}%</span>}</div><p className="mt-2 truncate text-xs font-semibold text-blue-600">{visit.domain}</p><p className="mt-2 text-[11px] text-slate-500">{formatDate(visit.lastVisitTime)} · {visit.visitCount}회 방문</p></article>; })}{!visibleVisits.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">{user ? '아직 동기화된 탐색 흔적이 없습니다. Chrome 확장 프로그램을 연결해 보세요.' : 'Google 로그인 뒤 나만의 탐색 지도를 시작할 수 있습니다.'}</p>}</div></section>
          <section id="connection-review" className="brain-card scroll-mt-24 rounded-3xl p-5 md:p-6"><div className="flex flex-col gap-4 border-b border-violet-100 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-600">Connection review</p><h2 className="mt-1 text-xl font-extrabold text-slate-950">연결 검토 대상</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">각 카드는 탐색 기록에서 찾은 관심 또는 연결입니다. 의미와 지도 반영 결과를 확인한 뒤 바로 결정할 수 있습니다.</p></div><div className="flex shrink-0 items-center gap-2"><StatusPill tone="violet">{pendingCandidates.length}개</StatusPill><button type="button" onClick={approveAllPending} disabled={isApprovingAll || pendingCandidates.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55">{isApprovingAll ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}{isApprovingAll ? '모두 반영 중' : '모두 반영'}</button></div></div>{pendingCandidates.length ? <div role="list" aria-label="전체 연결 검토 대상" className="mt-5 max-h-[65vh] space-y-3 overflow-y-auto pr-1 lg:max-h-[680px]">{pendingCandidates.map((candidate) => { const copy = candidateReviewCopy(candidate); return <article role="listitem" key={candidate.id} className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-violet-700">{copy.category}</p><h3 className="mt-1.5 text-sm font-extrabold leading-6 text-slate-950">{copy.title}</h3></div><StatusPill tone="violet">{Math.round(candidate.confidence * 100)}% 신호</StatusPill></div><p className="mt-3 rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-xs leading-5 text-slate-700"><span className="font-extrabold text-violet-800">지도 반영</span> · {copy.mapEffect}</p><p className="mt-2 text-xs leading-5 text-slate-500">근거 · {candidate.evidence[0] || '반복 탐색 기록이 감지되었습니다.'}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => updateCandidate(candidate, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" />승인하고 지도에 반영</button><button type="button" onClick={() => updateCandidate(candidate, 'rejected')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">제외</button></div></article>; })}</div> : <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-12 text-center"><ListChecks className="mx-auto h-5 w-5 text-slate-400" aria-hidden="true" /><p className="mt-3 text-sm font-bold text-slate-700">현재 검토할 연결 대상이 없습니다.</p><p className="mt-1 text-xs leading-5 text-slate-500">새 탐색 기록을 분석하면 이곳에 검토 카드가 표시됩니다.</p></div>}</section>
        </section>
        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-500 md:flex-row md:items-center md:justify-between"><p>탐색 흔적은 계정별 기록 저장소에 보관되며, 원문은 별도 허용 없이 수집하지 않습니다.</p><p className="flex items-center gap-1.5 font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" />수집 범위·보존·차단 규칙은 언제나 사용자가 결정합니다.</p></footer>
      </div>
    </main>
  );
}
