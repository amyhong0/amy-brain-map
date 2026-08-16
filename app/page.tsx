'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Bot, BrainCircuit, Check, ChevronRight, Copy, ExternalLink, KeyRound,
  LogIn, LogOut, Network, Play, RefreshCw, Search, Send, ShieldCheck, Sparkles, UserRound, X,
} from 'lucide-react';
import UnconsciousMap from '@/components/unconscious/UnconsciousMap';
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
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[tone]}`}>{children}</span>;
}

function Metric({ value, label, tone = 'blue' }: { value: number | string; label: string; tone?: 'blue' | 'violet' | 'amber' | 'green' }) {
  const colors = {
    blue: 'from-blue-50 to-cyan-50 text-blue-700 ring-blue-100',
    violet: 'from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 ring-amber-100',
    green: 'from-emerald-50 to-teal-50 text-emerald-700 ring-emerald-100',
  };
  return <div className={`rounded-2xl bg-gradient-to-br p-3.5 ring-1 ${colors[tone]}`}><p className="text-2xl font-extrabold tracking-tight">{value}</p><p className="mt-1 text-[11px] font-medium text-slate-600">{label}</p></div>;
}

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [connectCode, setConnectCode] = useState('');
  const [connectCodeExpiresAt, setConnectCodeExpiresAt] = useState<string | null>(null);
  const [isIssuingConnectCode, setIsIssuingConnectCode] = useState(false);
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
    setConnectCode('');
    setConnectCodeExpiresAt(null);
  };

  const issueConnectCode = async () => {
    if (!user || isIssuingConnectCode) return;
    setIsIssuingConnectCode(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/extension/connect-code', { method: 'POST', headers: requestHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '연결 코드를 발급하지 못했습니다.');
      setConnectCode(data.code);
      setConnectCodeExpiresAt(data.expiresAt);
    } catch (issueError) {
      setError(visitorFacingError(issueError, '연결 코드를 발급하지 못했습니다.'));
    } finally {
      setIsIssuingConnectCode(false);
    }
  };

  const copyConnectCode = async () => {
    if (!connectCode) return;
    try {
      await navigator.clipboard.writeText(connectCode);
      setHistorySyncMessage('연결 코드를 복사했습니다. 확장 프로그램 설정에 붙여넣으세요.');
    } catch {
      setError('연결 코드 복사에 실패했습니다. 코드를 직접 선택해 복사해 주세요.');
    }
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
    setHistorySyncMessage('Chrome 확장 프로그램에 현재 남아 있는 방문 기록을 요청하는 중…');
    setError('');
    try {
      const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const result = await new Promise<{ queuedFromHistory?: number; synced?: number; error?: string }>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          window.removeEventListener('message', handleMessage);
          reject(new Error('Chrome 확장 프로그램으로부터 응답이 없습니다. 확장 프로그램 설정에서 이 앱 주소와 대시보드 연결 코드를 다시 저장한 뒤 페이지를 새로고침하세요.'));
        }, 20 * 60 * 1_000);
        function handleMessage(event: MessageEvent) {
          if (event.source !== window || event.origin !== window.location.origin) return;
          const response = event.data;
          if (response?.source !== 'amy-brain-map-extension' || response?.requestId !== requestId) return;
          if (response.type === 'initial-history-sync-started') {
            setHistorySyncMessage('Chrome 기록을 찾았습니다. 안전하게 동기화를 시작합니다…');
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
          window.clearTimeout(timeoutId);
          window.removeEventListener('message', handleMessage);
          resolve(response.result || {});
        }
        window.addEventListener('message', handleMessage);
        window.postMessage({ source: 'amy-brain-map-dashboard', type: 'initial-history-sync', requestId }, window.location.origin);
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
      setHistorySyncMessage('Chrome 확장 프로그램의 연결 상태를 확인한 뒤 다시 시도하세요.');
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
      setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedCandidate(updated);
    } catch (updateError) {
      setError(visitorFacingError(updateError, '연결 상태를 변경하지 못했습니다.'));
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
    } catch (policyError) {
      setError(visitorFacingError(policyError, '제외 규칙을 저장하지 못했습니다.'));
    }
  };

  const summary = useMemo(() => ({
    pending: candidates.filter((item) => item.status === 'pending').length,
    confirmed: candidates.filter((item) => item.status === 'approved' || item.status === 'auto_applied').length,
    latestRun: runs[0],
  }), [candidates, runs]);
  const highlightedIds = queryResult?.highlightedCandidateIds || [];
  const visibleVisits = queryResult?.matchedVisits || visits;
  const needsConnection = user && visits.length === 0;

  return (
    <main className="brain-canvas min-h-screen text-slate-900">
      <div className="neural-grid pointer-events-none fixed inset-0" />
      <div className="relative mx-auto max-w-[1680px] px-4 pb-10 md:px-8 lg:px-10">
        <header className="sticky top-0 z-30 -mx-4 flex min-h-[76px] items-center justify-between gap-4 border-b border-blue-100/90 bg-[#f8fbff]/90 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
          <div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 shadow-lg shadow-blue-500/25"><BrainCircuit className="h-5 w-5 text-white" aria-hidden="true" /></div><div className="min-w-0"><p className="text-[10px] font-extrabold tracking-[0.22em] text-blue-600">PERSONAL COGNITIVE ATLAS</p><h1 className="truncate text-xl font-extrabold tracking-tight text-slate-950">Amy Brain Map</h1></div></div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={user ? 'green' : 'amber'}><span className={`h-1.5 w-1.5 rounded-full ${user ? 'bg-emerald-500' : 'bg-amber-500'}`} />{authLoading ? '확인 중' : user ? '나만의 지도' : '로그인 필요'}</StatusPill>
            {user && <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="hidden rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 sm:inline-flex">개인정보 설정</button>}
            {user && <button type="button" onClick={logout} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"><LogOut className="h-3.5 w-3.5" />로그아웃</button>}
          </div>
        </header>

        {!authLoading && !user && <section className="brain-card mt-6 overflow-hidden rounded-3xl border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 md:p-6"><div className="flex flex-col gap-6"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-bold text-amber-900"><UserRound className="h-4 w-4" aria-hidden="true" />처음 오셨나요?</div><h2 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">나의 탐색 지도를 시작하는 3단계</h2><p className="mt-2 text-sm leading-6 text-slate-600">아래 순서로 한 번만 연결하면, 이후에는 Chrome에서 쌓인 탐색 흔적을 지도로 읽어볼 수 있습니다.</p></div><ol className="grid gap-3 md:grid-cols-3"><li className="rounded-2xl border border-amber-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-extrabold text-amber-900">1</span><div><p className="text-sm font-extrabold text-slate-900">Google 계정으로 시작</p><p className="mt-1 text-xs leading-5 text-slate-600">아래 버튼을 눌러 나만의 지도에 로그인합니다.</p></div></div></li><li className="rounded-2xl border border-blue-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-extrabold text-blue-800">2</span><div><p className="text-sm font-extrabold text-slate-900">Chrome 확장 프로그램 설치</p><p className="mt-1 text-xs leading-5 text-slate-600">Chrome에서 Amy Brain Map 확장 프로그램을 설치하고 연결 설정을 엽니다.</p></div></div></li><li className="rounded-2xl border border-violet-100 bg-white/80 p-4"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-800">3</span><div><p className="text-sm font-extrabold text-slate-900">연결 코드 입력 후 기록 동기화</p><p className="mt-1 text-xs leading-5 text-slate-600">로그인 뒤 발급되는 코드를 확장 프로그램에 넣고 기록을 가져옵니다.</p></div></div></li></ol><div className="flex flex-col gap-3 border-t border-amber-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">연결 코드는 로그인 뒤에 발급되며, 처음 연결할 때만 사용합니다.</p><button type="button" onClick={startGoogleLogin} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><LogIn className="h-4 w-4" aria-hidden="true" />Google로 시작하기</button></div></div></section>}

        {user && <section className="brain-card mt-5 grid gap-4 rounded-3xl p-5 md:p-6 lg:grid-cols-[1fr_auto]"><div><p className="text-base font-bold text-slate-900">{user.name || user.email}님의 개인 지도</p><p className="mt-1 text-sm leading-6 text-slate-600">방문 메타데이터와 지도 연결은 이 Google 계정의 PostgreSQL 공간에만 저장됩니다. 페이지 본문은 수집하지 않습니다.</p></div><div className="flex flex-wrap items-center gap-2"><StatusPill tone="green"><ShieldCheck className="h-3.5 w-3.5" />계정별 격리</StatusPill><button type="button" onClick={exportMyData} disabled={isExporting} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55">{isExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}{isExporting ? '내보내기 준비 중' : '내 기록 내보내기'}</button></div></section>}

        {needsConnection && <section className="brain-card mt-5 rounded-3xl border-[#d9b987] bg-[#fffaf0] p-5 md:p-6"><div className="grid gap-5 lg:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2 text-sm font-extrabold text-[#553b20]"><KeyRound className="h-4 w-4" />Chrome 기록 연결</div><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d573f]">확장 프로그램의 <strong>연결 설정</strong>에서 앱 주소와 아래 연결 코드를 입력하세요. 코드는 한 번만 사용할 수 있고 10분 뒤 만료됩니다. 운영자 비밀키를 입력하거나 공유할 필요가 없습니다.</p>{connectCode && <div className="mt-4 flex flex-wrap items-center gap-2"><code className="rounded-xl border border-[#d9b987] bg-white px-3 py-2 font-mono text-sm font-bold tracking-[0.12em] text-[#553b20]">{connectCode}</code><button type="button" onClick={copyConnectCode} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d9b987] bg-white px-3 text-xs font-bold text-[#553b20] transition hover:bg-[#fff3dc]"><Copy className="h-3.5 w-3.5" />복사</button><span className="text-xs text-[#80684b]">{connectCodeExpiresAt ? `${formatDate(connectCodeExpiresAt)}까지 사용 가능` : ''}</span></div>}</div><button type="button" onClick={issueConnectCode} disabled={isIssuingConnectCode} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#d46845] px-4 py-2.5 text-sm font-extrabold text-[#fffaf0] shadow-lg shadow-[#7d3a29]/15 transition hover:bg-[#be5438] disabled:cursor-not-allowed disabled:opacity-55">{isIssuingConnectCode ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{connectCode ? '새 연결 코드 발급' : '연결 코드 발급'}</button></div></section>}

        {settingsOpen && <section className="brain-card mt-5 grid gap-4 rounded-3xl p-5 md:p-6 lg:grid-cols-[1fr_1fr_auto]"><div><p className="text-base font-bold text-slate-900">탐색 경계 설정</p><p className="mt-2 text-sm leading-6 text-slate-600">수집 범위는 URL·제목·방문 시각·방문 횟수로 제한됩니다. 페이지 본문은 읽거나 저장하지 않습니다.</p></div><form onSubmit={addBlockedDomain} className="flex items-end gap-2"><label className="block flex-1 text-xs font-semibold text-slate-600">수집에서 제외할 도메인<input value={policyDomain} onChange={(event) => setPolicyDomain(event.target.value)} placeholder="예: bank.example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><button className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100">차단</button></form><div className="flex items-start justify-end"><button type="button" aria-label="개인정보 설정 닫기" onClick={() => setSettingsOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button></div>{privacy?.policies?.length ? <div className="lg:col-span-3 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{privacy.policies.filter((policy) => policy.mode === 'block').slice(0, 12).map((policy) => <StatusPill key={policy.domain} tone="slate">차단 · {policy.domain}</StatusPill>)}</div> : null}</section>}

        {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}

        <section className="mt-6 grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_360px] xl:items-start">
          <aside className="brain-card order-2 rounded-3xl p-4 xl:order-1 xl:sticky xl:top-24"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Network className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Map lens</p><p className="text-sm font-bold text-slate-900">한눈에 보는 흐름</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><Metric value={privacy?.totalVisits ?? '—'} label="보호된 신호" /><Metric value={candidates.length} label="관심 축" tone="violet" /><Metric value={summary.pending} label="검토할 연결" tone="amber" /><Metric value={summary.confirmed} label="정착한 연결" tone="green" /></div><div className="mt-5 rounded-2xl bg-slate-50 p-3"><div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><p className="text-[11px] leading-5 text-slate-600">{summary.latestRun ? `${summary.latestRun.visitCount}개의 새로운 신호에서 ${summary.latestRun.candidateCount}개의 연결 가설을 만들었습니다.` : 'Chrome 확장 프로그램을 연결하면 탐색의 흔적이 차곡차곡 쌓입니다.'}</p></div></div></aside>

          <div className="order-1 min-w-0 space-y-5 xl:order-2"><section className="relative isolate overflow-hidden rounded-3xl border border-[#3b5449] bg-[#26352f] p-6 text-[#fffaf0] shadow-[0_24px_55px_rgba(38,53,47,.24)] md:p-8"><div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full border border-[#e8c894]/20" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-[18%] h-64 w-64 rounded-full bg-[#d46845]/[.10] blur-3xl" /><div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><p className="text-xs font-extrabold tracking-[0.24em] text-[#e8c894]">THOUGHTS, MADE VISIBLE</p><h2 className="display-serif break-keep mt-4 text-[27px] font-semibold leading-[1.55] tracking-[0.032em] sm:text-5xl sm:leading-[1.38] sm:tracking-[0.04em]">매일의 탐색에 쌓인 관심의 패턴을 자동으로 분석하고,<br />나의 무의식을 발견하세요.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-[#e8e4d7]">반복 관심, 시간의 흐름, 잠재적 연결을 엮어 기억보다 먼저 움직이는 사고의 궤적을 보여 줍니다.</p></div><div className="flex shrink-0 flex-col gap-2 lg:items-end"><button type="button" disabled={!user || isHistorySyncing || isAnalyzing} onClick={requestHistoryFromChrome} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d46845] px-4 py-2.5 text-sm font-extrabold text-[#fffaf0] shadow-lg shadow-[#17201c]/25 transition hover:bg-[#be5438] disabled:cursor-not-allowed disabled:opacity-55">{isHistorySyncing || isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isHistorySyncing ? 'Chrome 기록을 읽는 중…' : isAnalyzing ? '패턴을 분석하는 중…' : 'Chrome 기록 가져오기'}</button><div className="max-w-[260px] lg:text-right"><p aria-live="polite" className="text-[11px] leading-5 text-[#e8e4d7]">{historySyncMessage || (user ? 'Chrome에 현재 남아 있는 방문 기록을 읽어와 지도에 반영합니다.' : 'Google 로그인 뒤 본인의 Chrome 프로필을 연결하세요.')}</p>{isHistorySyncing && historySyncProgress !== null && <div className="mt-2 flex items-center gap-2 lg:justify-end"><div role="progressbar" aria-label="Chrome 기록 동기화 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={historySyncProgress} className="h-1.5 w-36 overflow-hidden rounded-full bg-[#fffaf0]/20"><div className="h-full rounded-full bg-[#e8c894] transition-[width] duration-300" style={{ width: `${historySyncProgress}%` }} /></div><span className="min-w-8 text-right text-[11px] font-bold text-[#e8c894]">{historySyncProgress}%</span></div>}</div></div></div></section><UnconsciousMap candidates={candidates} selectedId={selectedCandidate?.id} highlightedIds={highlightedIds} onSelect={setSelectedCandidate} /></div>

          <aside className="order-3 space-y-5 xl:sticky xl:top-24"><section className="brain-card overflow-hidden rounded-3xl"><div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-violet-50 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Sparkles className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Ask your map</p><h2 className="text-base font-bold text-slate-950">기억 탐색</h2></div></div><StatusPill tone="slate">A2A</StatusPill></div><p className="mt-3 text-xs leading-5 text-slate-600">질문하면 탐색·시간·관계 검증 에이전트가 근거를 고르고, 지도 위 연결을 실시간으로 밝힙니다.</p></div><div className="p-4"><form onSubmit={ask} className="space-y-3"><label className="sr-only" htmlFor="map-question">브레인 맵에 질문하기</label><textarea id="map-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!user || isLoading} rows={4} placeholder={EXAMPLE_QUESTION} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed" /><div className="flex items-center justify-between gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-xs font-bold text-slate-700"><span>웹 검색</span><span className={`relative h-7 w-12 rounded-full transition ${webSearchEnabled ? 'bg-blue-600' : 'bg-slate-200'} ${!user || isLoading ? 'opacity-50' : ''}`}><input checked={webSearchEnabled} onChange={(event) => setWebSearchEnabled(event.target.checked)} disabled={!user || isLoading} type="checkbox" role="switch" aria-label="웹 검색" className="peer sr-only" /><span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-focus-visible:ring-4 peer-focus-visible:ring-blue-200 ${webSearchEnabled ? 'translate-x-6' : 'translate-x-1'}`} /></span></label><button disabled={!user || isLoading || !question.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isLoading ? '탐색 중' : '지도에서 찾기'}</button></div></form><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setQuestion(EXAMPLE_QUESTION)} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">어제 본 AI 제작 자료</button><button type="button" onClick={() => setQuestion('최근 일주일 동안 반복해서 본 주제는 뭐야?')} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">최근 반복 관심</button></div></div></section>
          <section aria-live="polite" className="brain-card rounded-3xl p-4">{queryResult ? <><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-600" /><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-700">Map response</p>{queryResult.webSearchUsed && <StatusPill tone="violet">웹 검색</StatusPill>}</div><p className="mt-3 text-sm font-medium leading-6 text-slate-800">{queryResult.answer}</p><div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{queryResult.trace.map((item) => <div className="flex gap-2 text-[11px]" key={item.agent}><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} /><div><span className="font-bold text-slate-700">{item.agent}</span><p className="mt-0.5 leading-4 text-slate-500">{item.summary}</p></div></div>)}</div>{queryResult.webSearchUsed && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[11px] font-bold text-blue-700">웹 검색 출처</p><div className="mt-2 space-y-2">{(queryResult.webSources || []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="brain-card-interactive block rounded-xl border border-slate-100 bg-slate-50 p-2.5" key={source.url}><div className="flex items-center gap-1"><p className="truncate text-[11px] font-bold text-slate-800">{source.title}</p><ExternalLink className="ml-auto h-3 w-3 shrink-0 text-blue-500" /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{source.snippet}</p></a>)}</div></div>}{webSearchEnabled && !queryResult.webSearchConfigured && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">웹 검색에는 서버의 TAVILY_API_KEY가 필요합니다. 개인 방문 이력은 외부 검색으로 전송되지 않습니다.</p>}</> : <div className="py-5 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Search className="h-5 w-5" /></div><p className="mt-3 text-sm font-bold text-slate-800">무엇이 마음에 남았나요?</p><p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-slate-500">질문을 남기면 관련 노드와 연결이 지도에서 강조됩니다.</p></div>}</section></aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><section className="brain-card rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Memory traces</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{queryResult ? '이번 질문에 반응한 흔적' : '최근 동기화된 탐색 흔적'}</h2></div>{queryResult && <StatusPill tone="violet">지도 강조 중</StatusPill>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{visibleVisits.slice(0, 8).map((visit) => { const score = typeof (visit as unknown as { score?: unknown }).score === 'number' ? (visit as unknown as { score: number }).score : null; return <article key={visit.id} className="brain-card-interactive rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{visit.title || visit.domain}</p>{score !== null && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">{Math.round(score * 100)}%</span>}</div><p className="mt-2 truncate text-xs font-semibold text-blue-600">{visit.domain}</p><p className="mt-2 text-[11px] text-slate-500">{formatDate(visit.lastVisitTime)} · {visit.visitCount}회 방문</p></article>; })}{!visibleVisits.length && <p className="col-span-2 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">{user ? '아직 동기화된 탐색 흔적이 없습니다. Chrome 확장 프로그램을 연결해 보세요.' : 'Google 로그인 뒤 나만의 탐색 지도를 시작할 수 있습니다.'}</p>}</div></section>
          <section className="brain-card rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-600">Connection detail</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">선택한 연결의 맥락</h2></div><ChevronRight className="h-5 w-5 text-slate-300" /></div>{selectedCandidate ? <div className="mt-5"><div className="flex items-start justify-between gap-3"><p className="text-base font-extrabold leading-6 text-slate-900">{selectedCandidate.subject} <span className="font-medium text-slate-400">{selectedCandidate.relation}</span> {selectedCandidate.object}</p><StatusPill tone={selectedCandidate.status === 'approved' || selectedCandidate.status === 'auto_applied' ? 'green' : selectedCandidate.status === 'pending' ? 'amber' : 'slate'}>{selectedCandidate.status === 'approved' ? '반영됨' : selectedCandidate.status === 'pending' ? '검토 중' : selectedCandidate.status === 'rejected' ? '제외됨' : '자동 반영'}</StatusPill></div><p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{selectedCandidate.evidence.join(' ')}</p><p className="mt-3 text-xs text-slate-500">근거 도메인 · {selectedCandidate.sourceDomains.join(', ')}</p><div className="mt-5 flex flex-wrap gap-2">{selectedCandidate.status !== 'approved' && <button type="button" onClick={() => updateCandidate(selectedCandidate, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-700"><Check className="h-3.5 w-3.5" />이 연결을 지도에 남기기</button>}{selectedCandidate.status !== 'rejected' && <button type="button" onClick={() => updateCandidate(selectedCandidate, 'rejected')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">이 연결 제외</button>}</div></div> : <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-10 text-center"><Network className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-700">지도에서 관심 축을 선택하세요.</p><p className="mt-1 text-xs leading-5 text-slate-500">선택한 노드의 근거와 연결 가설을 이곳에서 검토할 수 있습니다.</p></div>}</section>
        </section>
        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-500 md:flex-row md:items-center md:justify-between"><p>탐색 흔적은 계정별 기록 금고에 보관되며, 원문은 별도 허용 없이 수집하지 않습니다.</p><p className="flex items-center gap-1.5 font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" />수집 범위·보존·차단 규칙은 언제나 사용자가 결정합니다.</p></footer>
      </div>
    </main>
  );
}
