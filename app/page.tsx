'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Bot, BrainCircuit, Check, ChevronRight, Clock3, ExternalLink, Eye, EyeOff, LockKeyhole, Network, Play, RefreshCw, Search, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import UnconsciousMap from '@/components/unconscious/UnconsciousMap';
import { AnalysisRun, DiscoveryCandidate, PrivacySnapshot, RecentVisit } from '@/components/unconscious/types';

interface WebSource { title: string; url: string; snippet: string; }
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

const TOKEN_STORAGE_KEY = 'amy-brain-map-history-token';
const EXAMPLE_QUESTION = '내가 어제 본 것 중에 AI 콘텐츠 제작 관련된 게 뭐더라?';

function formatDate(value?: number | string) {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function requestHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'x-brain-history-token': token };
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
      if (!settingsResponse.ok) throw new Error(settingsData.error || '지도 설정을 불러오지 못했습니다.');
      if (!visitsResponse.ok) throw new Error(visitsData.error || '탐색 흔적을 불러오지 못했습니다.');
      if (!candidatesResponse.ok) throw new Error(candidatesData.error || '연결 가설을 불러오지 못했습니다.');
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
      if (!response.ok) throw new Error(data.error || '새 흔적을 분석하지 못했습니다.');
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
      if (!response.ok) throw new Error(data.error || '연결 상태를 변경하지 못했습니다.');
      const updated = data.candidate as DiscoveryCandidate;
      setCandidates((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedCandidate(updated);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '연결 상태를 변경하지 못했습니다.');
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
  const visibleVisits = queryResult?.matchedVisits || visits;

  return (
    <main className="brain-canvas min-h-screen text-slate-900">
      <div className="neural-grid pointer-events-none fixed inset-0" />
      <div className="relative mx-auto max-w-[1680px] px-4 pb-10 md:px-8 lg:px-10">
        <header className="sticky top-0 z-30 -mx-4 flex min-h-[76px] items-center justify-between gap-4 border-b border-blue-100/90 bg-[#f8fbff]/90 px-4 py-3 backdrop-blur-xl md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 shadow-lg shadow-blue-500/25"><BrainCircuit className="h-5 w-5 text-white" aria-hidden="true" /></div>
            <div className="min-w-0"><p className="text-[10px] font-extrabold tracking-[0.22em] text-blue-600">PERSONAL COGNITIVE ATLAS</p><h1 className="truncate text-xl font-extrabold tracking-tight text-slate-950">Amy Brain Map</h1></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill tone={token ? 'green' : 'amber'}><span className={`h-1.5 w-1.5 rounded-full ${token ? 'bg-emerald-500' : 'bg-amber-500'}`} />{token ? '기록 금고 연결됨' : '연결 설정 필요'}</StatusPill>
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen} className="hidden rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 sm:inline-flex">개인정보 설정</button>
          </div>
        </header>

        {!token && <section className="brain-card mt-6 rounded-3xl border-amber-200 bg-gradient-to-r from-amber-50 via-white to-blue-50 p-5 md:p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-bold text-amber-900"><LockKeyhole className="h-4 w-4" />먼저 나의 기록을 연결하세요</div><p className="mt-2 text-sm leading-6 text-slate-600">처음 한 번, 발급받은 <strong>개인 보호 키</strong>를 입력하세요. 같은 키를 Chrome 확장 프로그램의 <strong>연결·개인정보 설정 → 개인 보호 키</strong>에도 입력하면 방문 기록이 나만의 사고 지도에 안전하게 연결됩니다. 이 키는 다른 사람과 공유하지 마세요.</p></div><div className="flex w-full max-w-md gap-2"><div className="relative flex-1"><label className="sr-only" htmlFor="history-token">개인 보호 키</label><input id="history-token" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} type={showToken ? 'text' : 'password'} placeholder="개인 보호 키 입력" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /><button type="button" aria-label={showToken ? '보호 키 숨기기' : '보호 키 표시'} onClick={() => setShowToken((shown) => !shown)} className="absolute inset-y-0 right-2 grid place-items-center rounded-lg px-1.5 text-slate-500 hover:text-blue-700">{showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div><button type="button" onClick={saveToken} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700">연결</button></div></div></section>}

        {settingsOpen && <section className="brain-card mt-5 grid gap-4 rounded-3xl p-5 md:p-6 lg:grid-cols-[1fr_1fr_auto]"><div><p className="text-base font-bold text-slate-900">탐색 경계 설정</p><p className="mt-2 text-sm leading-6 text-slate-600">확장 프로그램에는 앱 주소와 개인 보호 키만 입력하세요. Amy Brain Map은 URL, 제목, 방문 시각, 방문 횟수만 동기화하며 페이지 본문은 수집하지 않습니다.</p></div><form onSubmit={addBlockedDomain} className="flex items-end gap-2"><label className="block flex-1 text-xs font-semibold text-slate-600">수집에서 제외할 도메인<input value={policyDomain} onChange={(event) => setPolicyDomain(event.target.value)} placeholder="예: bank.example.com" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><button className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100">차단</button></form><div className="flex items-start justify-end"><button type="button" aria-label="개인정보 설정 닫기" onClick={() => setSettingsOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button></div>{privacy?.policies?.length ? <div className="lg:col-span-3 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{privacy.policies.filter((policy) => policy.mode === 'block').slice(0, 12).map((policy) => <StatusPill key={policy.domain} tone="slate">차단 · {policy.domain}</StatusPill>)}</div> : null}</section>}

        {error && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>}

        <section className="mt-6 grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_360px] xl:items-start">
          <aside className="brain-card order-2 rounded-3xl p-4 xl:order-1 xl:sticky xl:top-24"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><Network className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Map lens</p><p className="text-sm font-bold text-slate-900">한눈에 보는 흐름</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><Metric value={privacy?.totalVisits ?? '—'} label="보호된 신호" /><Metric value={candidates.length} label="관심 축" tone="violet" /><Metric value={summary.pending} label="검토할 연결" tone="amber" /><Metric value={summary.confirmed} label="정착한 연결" tone="green" /></div><div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-bold text-slate-800">지도 읽는 법</p><ul className="mt-3 space-y-3 text-xs leading-5 text-slate-600"><li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />큰 원은 자주 돌아본 관심을 뜻합니다.</li><li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-600" />연결선은 같은 탐색 흐름에서 발견된 가설입니다.</li><li className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />질문 결과는 지도에서 즉시 빛납니다.</li></ul></div><div className="mt-5 rounded-2xl bg-slate-50 p-3"><div className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><p className="text-[11px] leading-5 text-slate-600">{summary.latestRun ? `${summary.latestRun.visitCount}개의 새로운 신호에서 ${summary.latestRun.candidateCount}개의 연결 가설을 만들었습니다.` : 'Chrome 확장 프로그램을 연결하면 탐색의 흔적이 차곡차곡 쌓입니다.'}</p></div></div></aside>

          <div className="order-1 min-w-0 space-y-5 xl:order-2"><section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 p-6 text-white shadow-xl shadow-blue-700/20 md:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="max-w-2xl"><p className="text-xs font-extrabold tracking-[0.2em] text-blue-100">THOUGHTS, MADE VISIBLE</p><h2 className="display-serif mt-3 text-[28px] font-semibold leading-[1.12] tracking-tight sm:text-5xl sm:leading-[1.02]">매일의 탐색에 쌓인 관심의 패턴을 자동으로 분석하고,<br />나의 무의식을 발견하세요.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-blue-100">Amy Brain Map은 반복 관심, 시간의 흐름, 잠재적 연결을 엮어 기억보다 먼저 움직이는 사고의 궤적을 보여 줍니다.</p></div><button type="button" disabled={!token || isAnalyzing} onClick={runAnalysis} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-blue-700 shadow-lg transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55">{isAnalyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isAnalyzing ? '새 연결을 읽는 중…' : '새 흔적 읽어오기'}</button></div></section>

            <UnconsciousMap candidates={candidates} selectedId={selectedCandidate?.id} highlightedIds={highlightedIds} onSelect={setSelectedCandidate} />
          </div>

          <aside className="order-3 space-y-5 xl:sticky xl:top-24"><section className="brain-card overflow-hidden rounded-3xl"><div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-violet-50 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Sparkles className="h-4 w-4" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Ask your map</p><h2 className="text-base font-bold text-slate-950">기억의 지름길</h2></div></div><StatusPill tone="slate">A2A</StatusPill></div><p className="mt-3 text-xs leading-5 text-slate-600">질문하면 탐색·시간·관계 검증 에이전트가 근거를 고르고, 지도 위 연결을 실시간으로 밝힙니다.</p></div><div className="p-4"><form onSubmit={ask} className="space-y-3"><label className="sr-only" htmlFor="map-question">브레인 맵에 질문하기</label><textarea id="map-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!token || isLoading} rows={4} placeholder={EXAMPLE_QUESTION} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed" /><div className="flex items-center justify-between gap-2"><label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${webSearchEnabled ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}><input checked={webSearchEnabled} onChange={(event) => setWebSearchEnabled(event.target.checked)} disabled={!token || isLoading} type="checkbox" className="h-4 w-4 accent-blue-600" />웹 검색 보강</label><button disabled={!token || isLoading || !question.trim()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{isLoading ? '탐색 중' : '지도에서 찾기'}</button></div></form><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setQuestion(EXAMPLE_QUESTION)} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">어제 본 AI 제작 자료</button><button type="button" onClick={() => setQuestion('최근 일주일 동안 반복해서 본 주제는 뭐야?')} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">최근 반복 관심</button></div></div></section>

            <section aria-live="polite" className="brain-card rounded-3xl p-4">{queryResult ? <><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-violet-600" /><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-violet-700">Map response</p>{queryResult.webSearchUsed && <StatusPill tone="violet">웹 보강</StatusPill>}</div><p className="mt-3 text-sm font-medium leading-6 text-slate-800">{queryResult.answer}</p><div className="mt-4 space-y-2 border-t border-slate-100 pt-3">{queryResult.trace.map((item) => <div className="flex gap-2 text-[11px]" key={item.agent}><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} /><div><span className="font-bold text-slate-700">{item.agent}</span><p className="mt-0.5 leading-4 text-slate-500">{item.summary}</p></div></div>)}</div>{queryResult.webSearchUsed && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-[11px] font-bold text-blue-700">웹 보강 출처</p><div className="mt-2 space-y-2">{(queryResult.webSources || []).map((source) => <a href={source.url} target="_blank" rel="noreferrer" className="brain-card-interactive block rounded-xl border border-slate-100 bg-slate-50 p-2.5" key={source.url}><div className="flex items-center gap-1"><p className="truncate text-[11px] font-bold text-slate-800">{source.title}</p><ExternalLink className="ml-auto h-3 w-3 shrink-0 text-blue-500" /></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{source.snippet}</p></a>)}</div></div>}{webSearchEnabled && !queryResult.webSearchConfigured && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">웹 검색에는 서버의 TAVILY_API_KEY가 필요합니다. 개인 방문 이력은 외부 검색으로 전송되지 않습니다.</p>}</> : <div className="py-5 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Search className="h-5 w-5" /></div><p className="mt-3 text-sm font-bold text-slate-800">무엇이 마음에 남았나요?</p><p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-slate-500">질문을 남기면 관련 노드와 연결이 지도에서 강조됩니다.</p></div>}</section></aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><section className="brain-card rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-600">Memory traces</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{queryResult ? '이번 질문에 반응한 흔적' : '최근 동기화된 탐색 흔적'}</h2></div>{queryResult && <StatusPill tone="violet">지도 강조 중</StatusPill>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{visibleVisits.slice(0, 8).map((visit) => { const score = typeof (visit as unknown as { score?: unknown }).score === 'number' ? (visit as unknown as { score: number }).score : null; return <article key={visit.id} className="brain-card-interactive rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-bold leading-5 text-slate-800">{visit.title || visit.domain}</p>{score !== null && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">{Math.round(score * 100)}%</span>}</div><p className="mt-2 truncate text-xs font-semibold text-blue-600">{visit.domain}</p><p className="mt-2 text-[11px] text-slate-500">{formatDate(visit.lastVisitTime)} · {visit.visitCount}회 방문</p></article>; })}{!visibleVisits.length && <p className="col-span-2 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">아직 동기화된 탐색 흔적이 없습니다.</p>}</div></section>
          <section className="brain-card rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-600">Connection detail</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">선택한 연결의 맥락</h2></div><ChevronRight className="h-5 w-5 text-slate-300" /></div>{selectedCandidate ? <div className="mt-5"><div className="flex items-start justify-between gap-3"><p className="text-base font-extrabold leading-6 text-slate-900">{selectedCandidate.subject} <span className="font-medium text-slate-400">{selectedCandidate.relation}</span> {selectedCandidate.object}</p><StatusPill tone={selectedCandidate.status === 'approved' || selectedCandidate.status === 'auto_applied' ? 'green' : selectedCandidate.status === 'pending' ? 'amber' : 'slate'}>{selectedCandidate.status === 'approved' ? '반영됨' : selectedCandidate.status === 'pending' ? '검토 중' : selectedCandidate.status === 'rejected' ? '제외됨' : '자동 반영'}</StatusPill></div><p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{selectedCandidate.evidence.join(' ')}</p><p className="mt-3 text-xs text-slate-500">근거 도메인 · {selectedCandidate.sourceDomains.join(', ')}</p><div className="mt-5 flex flex-wrap gap-2">{selectedCandidate.status !== 'approved' && <button type="button" onClick={() => updateCandidate(selectedCandidate, 'approved')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition hover:bg-emerald-700"><Check className="h-3.5 w-3.5" />이 연결을 지도에 남기기</button>}{selectedCandidate.status !== 'rejected' && <button type="button" onClick={() => updateCandidate(selectedCandidate, 'rejected')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">이 연결 제외</button>}</div></div> : <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-10 text-center"><Network className="mx-auto h-5 w-5 text-slate-400" /><p className="mt-3 text-sm font-bold text-slate-700">지도에서 관심 축을 선택하세요.</p><p className="mt-1 text-xs leading-5 text-slate-500">선택한 노드의 근거와 연결 가설을 이곳에서 검토할 수 있습니다.</p></div>}</section>
        </section>

        <footer className="flex flex-col gap-2 py-8 text-xs text-slate-500 md:flex-row md:items-center md:justify-between"><p>탐색 흔적은 개인 기록 금고에 보관되며, 원문은 별도 허용 없이 수집하지 않습니다.</p><p className="flex items-center gap-1.5 font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" />수집 범위·보존·차단 규칙은 언제나 사용자가 결정합니다.</p></footer>
      </div>
    </main>
  );
}
