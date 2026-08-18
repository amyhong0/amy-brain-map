import { Check, ChevronRight, ListChecks, RefreshCw } from 'lucide-react';
import { DiscoveryCandidate } from './types';

export interface CandidateReviewCopy {
  category: string;
  title: string;
  question: string;
  mapEffect: string;
}

export function candidateReviewCopy(candidate: DiscoveryCandidate): CandidateReviewCopy {
  const subject = candidate.subject || '이 주제';
  const object = candidate.object || '관련 탐색 기록';

  if (candidate.kind === 'interest') {
    return {
      category: '반복 관심 제안',
      title: `“${subject}” 관련 탐색이 ${object}에서 반복된 것으로 감지되었습니다.`,
      question: `“${subject}”을(를) 내 지도에 반복 관심으로 남길까요?`,
      mapEffect: `지도에서 “${subject}” 관심 노드가 확인된 패턴으로 확정됩니다. “${object}”는 이 노드를 뒷받침하는 탐색 도메인이며, 새 연결선은 추가되지 않습니다.`,
    };
  }

  if (candidate.kind === 'bridge') {
    return {
      category: '탐색 흐름 연결 제안',
      title: `“${subject}”와 “${object}”가 가까운 시간대의 같은 탐색 흐름에서 함께 나타났습니다.`,
      question: '두 주제를 내 지도에서 하나의 연결로 남길까요?',
      mapEffect: `지도에서 “${subject}” 노드와 “${object}” 노드 사이에 같은 탐색 흐름을 뜻하는 연결선이 확정됩니다.`,
    };
  }

  return {
    category: '재방문 패턴 제안',
    title: `“${subject}” 관련 탐색에서 “${object}” 패턴이 감지되었습니다.`,
    question: '이 패턴을 내 지도에 남길까요?',
    mapEffect: `지도에서 “${subject}” 관심 노드가 확인된 재방문 패턴으로 확정됩니다. “${object}”은(는) 이 판단을 뒷받침하는 탐색 맥락입니다.`,
  };
}

interface ReviewQueueProps {
  candidates: DiscoveryCandidate[];
  isApprovingAll: boolean;
  notice?: string;
  onReview: (candidate: DiscoveryCandidate) => void;
  onApproveAll: () => void;
}

export default function ReviewQueue({ candidates, isApprovingAll, notice, onReview, onApproveAll }: ReviewQueueProps) {
  if (candidates.length === 0) return null;

  return (
    <section id="review-queue" className="brain-card mt-5 scroll-mt-24 overflow-hidden rounded-3xl border-amber-200 bg-gradient-to-br from-amber-50 via-white to-[#fff8ec] p-5 md:p-6" aria-labelledby="review-queue-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-amber-800"><ListChecks className="h-4 w-4" aria-hidden="true" /><p className="text-xs font-extrabold uppercase tracking-[0.16em]">Review next</p></div>
          <h2 id="review-queue-title" className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">지금 연결 검토 대상이 {candidates.length}개 있습니다</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">연결 검토 대상은 방문 기록을 바탕으로 만든 개인 지도용 해석입니다. 하나씩 확인하거나, 모두 적절하다면 한 번에 지도에 반영할 수 있습니다.</p>
        </div>
        <button type="button" onClick={onApproveAll} disabled={isApprovingAll} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-emerald-700/15 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55">
          {isApprovingAll ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {isApprovingAll ? '모두 반영하는 중…' : `연결 ${candidates.length}개 모두 반영`}
        </button>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {candidates.slice(0, 3).map((candidate) => {
          const copy = candidateReviewCopy(candidate);
          return <article key={candidate.id} className="rounded-2xl border border-amber-100 bg-white/85 p-4 shadow-sm"><p className="text-[11px] font-extrabold tracking-[0.12em] text-amber-700">{copy.category}</p><p className="mt-2 text-sm font-bold leading-6 text-slate-900">{copy.title}</p><p className="mt-2 text-xs leading-5 text-slate-600">{copy.question}</p><button type="button" onClick={() => onReview(candidate)} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900 transition hover:bg-amber-100">자세히 검토하기 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button></article>;
        })}
      </div>
      {candidates.length > 3 && <p className="mt-3 text-xs leading-5 text-slate-500">먼저 확인할 연결 검토 대상 3개를 표시하고 있습니다. 모두 반영하면 남은 {candidates.length - 3}개도 함께 반영됩니다.</p>}
      {notice && <p aria-live="polite" className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">{notice}</p>}
    </section>
  );
}
