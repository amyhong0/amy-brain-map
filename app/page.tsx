'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Bot, BrainCircuit, Check, ChevronDown, Clock3, Eye, EyeOff, LockKeyhole, Play, RefreshCw, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import UnconsciousMap from '@/components/unconscious/UnconsciousMap';
import { AnalysisRun, DiscoveryCandidate, PrivacySnapshot, RecentVisit } from '@/components/unconscious/types';

interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

interface QueryResult {
  answer: string;
  highlightedCandidateIds: string[];
  highlightedVisitIds: string[];
  matchedVisits: Array<RecentVisit & { score: number }>;
  matchedCandidates: Array<DiscoveryCandidate & { score: number }>;
  trace: Array<{ agent: string; status: 'completed' | 'fallback'; summary: string }>;
  webSearchUsed?: boolean;
  webSearchConfigured?: boolean;
  webSources?: WebSource[];
}

const TOKEN_STORAGE_KEY = 'amy-brain-office-history-token';
const EXAMPLE_QUESTION = '내가 어제 본 것 중에 AI 콘텐츠 제작 관련된 게 뭐더라?';

function formatDate(value?: number | string) {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function requestHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'x-brain-history-token': token };
}

function StatusPill({ children, tone = 'violet' }: { children: React.ReactNode; tone?: 'violet' | 'green' | 'amber' | 'slate' }) {
  const styles = { violet: 'border-violet-400/30 bg-violet-400/10 text-violet-200', green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200', amber: 'border-amber-400/30 bg-amber-400/10 text-amber-200', slate: 'border-slate-500/40 bg-slate-800/70 text-slate-300' };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${styles[tone]}`}>{children}</span>;
}

export default function Home() {
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [showToken, setShowToken] = useState(false);
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
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [policyDomain, setPolicyDomain] = useState('');

  const loadData = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    setIsLoading(true);
    setError('');
    try {
      const [settingsResponse, visitsResponse, candidatesResponse] = await Promise.all([
        fetch('/api/unconscious/settings', { headers: requestHeaders(activeToken) }),
        fetch('/api/unconscious/visits?limit=40', { headers: requestHeaders(activeToken) }),
        fetch('/api/unconscious/analyze?limit=80', { headers: requestHeaders(activeToken) }),
      ]);
      const [settingsData, visitsData, candidatesData] = await Promise.all([settingsResponse.json(), visitsResponse.json(), candidatesResponse.json()]);
      if (!settingsResponse.ok) throw new Error(settingsData.error || '무의식 지도 설정을 불러오지 못했습니다.');
      if (!visitsResponse.ok) throw new Error(visitsData.error || '방문 기록을 불러오지 못했습니다.');
      if (!candidatesResponse.ok) throw new Error(candidatesData.error || '발견 후보를 불러오지 못했습니다.');
      setPrivacy(settingsData);
      setVisits(visitsData.visits || []);
      setCandidates(candidatesData.candidates || []);
      setRuns(candidatesData.recentRuns || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    setToken(stored);
    setTokenDraft(stored);
    if (stored) void loadData(stored);
  }, [loadData]);

  const saveToken = async () => {
    const next = tokenDraft.trim();
    if (!next) return;
    window.localStorage.setItem(TOKEN_STORAGE_KEY, next);
    setToken(next);
    await loadData(next);
  };

  const runAnalysis = async () => {
    if (!token) return;
    setIsAnalyzing(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/analyze', { method: 'POST', headers: requestHeaders(token) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '분석을 실행하지 못했습니다.');
      await loadData(token);
      if (data.candidates?.[0]) setSelectedCandidate(data.candidates[0]);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : '분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = question.trim();
    if (!message || !token) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/unconscious/query', { method: 'POST', headers: requestHeaders(token), body: JSON.stringify({ message, webSearch: webSearchEnabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '질문을 처리하지 못했습니다.');
      setQueryResult(data);
      const first = (data.matchedCandidates || [])[0];
      if (first) setSelectedCandidate(first);
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : '질문 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCandidate = async (candidate: DiscoveryCandidate, status: 'approved' | 'rejected' | 'pending') => {
    if (!token) return;
    try {
      const response = await fetch(`/api/unconscious/candidates/${candidate.id}`, { method: 'PATCH', headers: requestHeaders(token), body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '발견 상태를 변경하지 못했습니다.');
      const updated = data.candidate as DiscoveryCandidate;
      setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedCandidate(updated);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '발견 상태를 변경하지 못했습니다.');
    }
  };

  const addBlockedDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !policyDomain.trim()) return;
    try {
      const response = await fetch('/api/unconscious/settings', { method: 'PATCH', headers: requestHeaders(token), body: JSON.stringify({ policy: { domain: policyDomain, mode: 'block', collectContent: false } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '제외 규칙을 저장하지 못했습니다.');
      setPrivacy(data);
      setPolicyDomain('');
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : '제외 규칙을 저장하지 못했습니다.');
    }
  };

  const summary = useMemo(() => ({
    pending: candidates.filter((item) => item.status === 'pending').length,
    confirmed: candidates.filter((item) => item.status === 'approved' || item.status === 'auto_applied').length,
    latestRun: runs[0],
  }), [candidates, runs]);

  const highlightedIds = queryResult?.highlightedCandidateIds || [];

  return (
    <main className="min-h-screen bg-[#080711] text-slate-100 selection:bg-violet-500/40">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-0 h-[460px] w-[460px] rounded-full bg-violet-700/15 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[380px] w-[380px] rounded-full bg-fuchsia-600/10 blur-[110px]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(148,163,184,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.16)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div className="relative mx-auto max-w-[1540px] px-4 py-5 md:px-7 md:py-7">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-violet-300/30 bg-violet-500/15 shadow-[0_0_30px_rgba(139,92,246,.28)]"><BrainCircuit className="h-5 w-5 text-violet-200" /></div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.24em] text-violet-300">AMY’S BRAIN OFFICE</p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white">무의식 체계 지도</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={token ? 'green' : 'amber'}><span className={`h-1.5 w-1.5 rounded-full ${token ? 'bg-emerald-300' : 'bg-amber-300'}`} />{token ? '개인 기록 금고 연결됨' : '연결 설정 필요'}</StatusPill>
            <StatusPill tone="slate"><Clock3 className="h-3 w-3" />최근 분석 {formatDate(privacy?.settings.lastAnalyzedAt)}</StatusPill>
            <button onClick={() => setSettingsOpen((open) => !open)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-violet-300/40 hover:bg-violet-400/10">개인정보·연결 설정</button>
          </div>
        </header>

        {!token && (
          <section className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-300/[0.06] p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-semibold text-amber-100"><LockKeyhole className="h-4 w-4" />개인 기록 금고를 먼저 연결하세요</div><p className="mt-2 text-xs leading-5 text-slate-300">서버 환경 변수에 설정한 개인 보호 키를 아래에 한 번 입력한 뒤 Chrome 확장 프로그램에도 같은 키와 앱 주소를 등록하세요. 이 키는 이 브라우저의 로컬 저장소에만 저장됩니다.</p></div>
              <div className="flex w-full max-w-md gap-2"><div className="relative flex-1"><input value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} type={showToken ? 'text' : 'password'} placeholder="개인 보호 키" className="w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 pr-10 text-xs text-white outline-none placeholder:text-slate-500 focus:border-violet-300" /><button onClick={() => setShowToken((shown) => !shown)} className="absolute inset-y-0 right-2 grid place-items-center text-slate-400">{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><button onClick={saveToken} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500">연결</button></div>
            </div>
          </section>
        )}

        {settingsOpen && <section className="mt-5 grid gap-4 rounded-2xl border border-violet-400/20 bg-slate-950/80 p-5 lg:grid-cols-[1fr_1fr_auto]">
          <div><p className="text-sm font-semibold text-white">Chrome 확장 프로그램 연결</p><p className="mt-2 text-xs leading-5 text-slate-400">확장 프로그램의 설정 화면에서 이 앱의 주소와 개인 보호 키를 입력하세요. 확장 프로그램은 URL·제목·방문 시각·방문 횟수만 동기화하며, 본문은 수집하지 않습니다.</p></div>
          <form onSubmit={addBlockedDomain} className="flex items-end gap-2"><label className="block flex-1 text-xs text-slate-400">수집에서 제외할 도메인<input value={policyDomain} onChange={(event) => setPolicyDomain(event.target.value)} placeholder="예: bank.example.com" className="mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-violet-300" /></label><button className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200">차단</button></form>
          <div className="flex items-end"><button onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div>
          {privacy?.policies?.length ? <div className="lg:col-span-3 flex flex-wrap gap-2 pt-1">{privacy.policies.filter((policy) => policy.mode === 'block').slice(0, 12).map((policy) => <StatusPill key={policy.domain} tone="slate">차단 · {policy.domain}</StatusPill>)}</div> : null}
        </section>}

        <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-950/55 via-slate-950/80 to-slate-950/80 p-5 shadow-[0_0_60px_rgba(76,29,149,.12)] md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><p className="text-xs font-semibold tracking-[0.18em] text-violet-300">CONVERSATIONAL RECALL</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">기억나지 않는 관심의 흐름을 물어보세요.</h2><p className="mt-2 text-sm leading-6 text-slate-300">질문을 받으면 기억 탐색자, 시간 해석자, 관계 검증자, 지도 항해자가 근거를 교차 확인하고 관련 관심 축을 지도에서 즉시 강조합니다.</p></div><button disabled={!token || isAnalyzing} onClick={runAnalysis} className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300/30 bg-violet-500/15 px-3.5 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50">{isAnalyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{isAnalyzing ? '분석 중…' : '새 기록 분석'}</button></div>
              <form onSubmit={ask} className="mt-5 flex flex-wrap gap-2 rounded-xl border border-white/15 bg-black/25 p-2 shadow-inner"><input value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!token || isLoading} placeholder={EXAMPLE_QUESTION} className="min-w-[220px] flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed" /><label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition ${webSearchEnabled ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}><input checked={webSearchEnabled} onChange={(event) => setWebSearchEnabled(event.target.checked)} disabled={!token || isLoading} type="checkbox" className="h-3.5 w-3.5 accent-cyan-400" />웹 검색</label><button disabled={!token || isLoading || !question.trim()} className="grid h-10 w-10 place-items-center rounded-lg bg-fuchsia-500 text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40">{isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></form>
              <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setQuestion(EXAMPLE_QUESTION)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:border-violet-300/40 hover:text-white">어제 본 AI 콘텐츠 제작 관련 자료</button><button onClick={() => setQuestion('최근 일주일 동안 반복해서 본 주제는 뭐야?')} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:border-violet-300/40 hover:text-white">최근 반복 관심</button></div>
            </section>

            {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-100">{error}</div>}

            <UnconsciousMap candidates={candidates} selectedId={selectedCandidate?.id} highlightedIds={highlightedIds} onSelect={setSelectedCandidate} />
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">SYSTEM PULSE</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><p className="text-2xl font-bold text-white">{privacy?.totalVisits ?? '—'}</p><p className="mt-1 text-[11px] text-slate-400">보호된 방문 신호</p></div><div className="rounded-xl border border-white/8 bg-white/[0.035] p-3"><p className="text-2xl font-bold text-violet-200">{candidates.length}</p><p className="mt-1 text-[11px] text-slate-400">관심·연결 가설</p></div><div className="rounded-xl border border-amber-300/15 bg-amber-400/[0.04] p-3"><p className="text-2xl font-bold text-amber-200">{summary.pending}</p><p className="mt-1 text-[11px] text-slate-400">검토 대기</p></div><div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] p-3"><p className="text-2xl font-bold text-emerald-200">{summary.confirmed}</p><p className="mt-1 text-[11px] text-slate-400">내 지도에 반영</p></div></div><div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><Activity className="h-3.5 w-3.5 text-violet-300" />{summary.latestRun ? `${summary.latestRun.visitCount}개 신호에서 ${summary.latestRun.candidateCount}개 가설 생성` : '확장 프로그램을 연결하면 신호가 쌓입니다.'}</div></section>

            {queryResult && <section className="rounded-2xl border border-fuchsia-300/25 bg-fuchsia-500/[0.055] p-4"><div className="flex items-center gap-2 text-fuchsia-200"><Sparkles className="h-4 w-4" /><p className="text-xs font-bold">에이전트 협업 답변</p>{queryResult.webSearchUsed && <StatusPill tone="violet">웹 보강</StatusPill>}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100">{queryResult.answer}</p><div className="mt-4 space-y-2 border-t border-white/10 pt-3">{queryResult.trace.map((item) => <div className="flex gap-2 text-[11px]" key={item.agent}><Bot className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${item.status === 'completed' ? 'text-violet-300' : 'text-amber-300'}`} /><div><span className="font-semibold text-slate-200">{item.agent}</span><p className="mt-0.5 text-slate-400">{item.summary}</p></div></div>)}</div>{queryResult.webSearchUsed && <div className="mt-4 border-t border-cyan-300/20 pt-3"><p className="text-[11px] font-semibold text-cyan-200">웹 검색 출처</p><div className="mt-2 space-y-2">{(queryResult.webSources || []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 bg-white/[0.03] p-2.5 transition hover:border-cyan-300/40" key={source.url}><p className="truncate text-[11px] font-semibold text-slate-100">{source.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{source.snippet}</p></a>)}</div></div>}{webSearchEnabled && !queryResult.webSearchConfigured && <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/[0.08] px-2.5 py-2 text-[10px] leading-4 text-amber-100">웹 검색을 사용하려면 서버에 TAVILY_API_KEY를 설정하세요. 개인 방문 기록은 외부 검색으로 전송되지 않습니다.</p>}</section>}

            <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">DISCOVERY INBOX</p><p className="mt-1 text-sm font-semibold text-white">검토가 필요한 연결</p></div><StatusPill tone="amber">{summary.pending}</StatusPill></div><div className="mt-3 space-y-2">{candidates.filter((candidate) => candidate.status === 'pending').slice(0, 4).map((candidate) => <button key={candidate.id} onClick={() => setSelectedCandidate(candidate)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCandidate?.id === candidate.id ? 'border-amber-300/50 bg-amber-300/[0.07]' : 'border-white/8 bg-white/[0.025] hover:border-violet-300/35'}`}><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-white">{candidate.subject} <span className="font-normal text-slate-400">{candidate.relation}</span> {candidate.object}</p><span className="shrink-0 text-[10px] text-amber-200">{Math.round(candidate.confidence * 100)}%</span></div><p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{candidate.evidence[0]}</p></button>)}{summary.pending === 0 && <p className="rounded-lg bg-white/[0.025] px-3 py-4 text-center text-xs text-slate-500">현재 검토 대기 중인 연결이 없습니다.</p>}</div></section>
          </aside>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">RETRIEVED MEMORY TRACES</p><p className="mt-1 text-sm font-semibold text-white">{queryResult ? '이번 질문의 근거 방문' : '최근 동기화된 방문 신호'}</p></div>{queryResult && <StatusPill tone="violet">지도에서 강조됨</StatusPill>}</div><div className="mt-3 grid gap-2 md:grid-cols-2">{(queryResult?.matchedVisits || visits).slice(0, 8).map((visit) => { const score = typeof (visit as unknown as { score?: unknown }).score === 'number' ? (visit as unknown as { score: number }).score : null; return <article key={visit.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-100">{visit.title || visit.domain}</p>{score !== null && <span className="text-[10px] text-fuchsia-200">적합도 {Math.round(score * 100)}%</span>}</div><p className="mt-1 truncate text-[11px] text-violet-300">{visit.domain}</p><p className="mt-2 text-[10px] text-slate-500">{formatDate(visit.lastVisitTime)} · {visit.visitCount}회 방문</p></article>; })}{!(queryResult?.matchedVisits || visits).length && <p className="col-span-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">아직 동기화된 방문 신호가 없습니다.</p>}</div></section>

          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">SELECTED CONNECTION</p>{selectedCandidate ? <div className="mt-3"><div className="flex items-start justify-between gap-3"><p className="text-base font-bold text-white">{selectedCandidate.subject} <span className="font-normal text-slate-400">{selectedCandidate.relation}</span> {selectedCandidate.object}</p><StatusPill tone={selectedCandidate.status === 'approved' || selectedCandidate.status === 'auto_applied' ? 'green' : selectedCandidate.status === 'pending' ? 'amber' : 'slate'}>{selectedCandidate.status === 'approved' ? '반영됨' : selectedCandidate.status === 'pending' ? '검토 중' : selectedCandidate.status === 'rejected' ? '제외됨' : '자동 반영'}</StatusPill></div><p className="mt-3 text-xs leading-5 text-slate-300">{selectedCandidate.evidence.join(' ')}</p><p className="mt-3 text-[11px] text-slate-500">근거 도메인: {selectedCandidate.sourceDomains.join(', ')}</p><div className="mt-4 flex gap-2">{selectedCandidate.status !== 'approved' && <button onClick={() => updateCandidate(selectedCandidate, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-400"><Check className="h-3.5 w-3.5" />지도에 반영</button>}{selectedCandidate.status !== 'rejected' && <button onClick={() => updateCandidate(selectedCandidate, 'rejected')} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5">이 연결 제외</button>}</div></div> : <div className="mt-3 rounded-xl bg-white/[0.025] px-4 py-8 text-center text-xs leading-5 text-slate-500">지도에서 관심 축을 선택하거나, 질문을 입력해 관련된 연결을 찾아보세요.</div>}</section>
        </section>

        <footer className="flex flex-col gap-2 py-7 text-[11px] text-slate-500 md:flex-row md:items-center md:justify-between"><p>방문 메타데이터는 개인 기록 금고에 보관됩니다. 원문은 별도 허용 없이 수집하지 않습니다.</p><p className="flex items-center gap-1 text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />수집 범위·보존·차단 규칙은 사용자가 제어합니다.</p></footer>
      </div>
    </main>
  );
}
