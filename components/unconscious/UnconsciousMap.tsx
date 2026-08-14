import React, { useMemo, useState } from 'react';
import { CircleDot, Focus, Network } from 'lucide-react';
import { DiscoveryCandidate } from './types';

interface UnconsciousMapProps {
  candidates: DiscoveryCandidate[];
  selectedId?: string;
  highlightedIds?: string[];
  onSelect: (candidate: DiscoveryCandidate) => void;
}

interface MapNode {
  id: string;
  label: string;
  kind: 'interest' | 'bridge';
  confidence: number;
  count: number;
  candidates: DiscoveryCandidate[];
}

const STATUS_STYLE = {
  pending: { label: '검토 대기', color: '#f59e0b' },
  approved: { label: '지도에 반영됨', color: '#059669' },
  auto_applied: { label: '자동 반영', color: '#7c3aed' },
  rejected: { label: '제외됨', color: '#94a3b8' },
};

function positionFor(index: number, total: number, width: number, height: number) {
  if (total <= 1) return { x: width / 2, y: height / 2 };
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radiusX = Math.min(width * 0.355, 305);
  const radiusY = Math.min(height * 0.32, 172);
  return { x: width / 2 + Math.cos(angle) * radiusX, y: height / 2 + Math.sin(angle) * radiusY };
}

export default function UnconsciousMap({ candidates, selectedId, highlightedIds = [], onSelect }: UnconsciousMapProps) {
  const [view, setView] = useState<'all' | 'pending' | 'confirmed'>('all');
  const { nodes, edges } = useMemo(() => {
    const visible = candidates.filter((candidate) => {
      if (view === 'pending') return candidate.status === 'pending';
      if (view === 'confirmed') return candidate.status === 'approved' || candidate.status === 'auto_applied';
      return candidate.status !== 'rejected';
    });
    const grouped = new Map<string, MapNode>();
    for (const candidate of visible) {
      const existing = grouped.get(candidate.subject);
      if (existing) {
        existing.count += 1;
        existing.confidence = Math.max(existing.confidence, candidate.confidence);
        existing.candidates.push(candidate);
      } else {
        grouped.set(candidate.subject, { id: `topic:${candidate.subject}`, label: candidate.subject, kind: candidate.kind === 'bridge' ? 'bridge' : 'interest', confidence: candidate.confidence, count: 1, candidates: [candidate] });
      }
      if (candidate.kind === 'bridge' && candidate.object) {
        const right = grouped.get(candidate.object);
        if (!right) grouped.set(candidate.object, { id: `topic:${candidate.object}`, label: candidate.object, kind: 'bridge', confidence: candidate.confidence, count: 1, candidates: [candidate] });
        else {
          right.candidates.push(candidate);
          right.count += 1;
          right.confidence = Math.max(right.confidence, candidate.confidence);
        }
      }
    }
    const graphNodes = [...grouped.values()].sort((a, b) => b.confidence - a.confidence || b.count - a.count).slice(0, 18);
    const acceptedIds = new Set(graphNodes.map((node) => node.id));
    const graphEdges = visible.filter((candidate) => candidate.kind === 'bridge' && acceptedIds.has(`topic:${candidate.subject}`) && acceptedIds.has(`topic:${candidate.object}`)).map((candidate) => ({ ...candidate, source: `topic:${candidate.subject}`, target: `topic:${candidate.object}` }));
    return { nodes: graphNodes, edges: graphEdges };
  }, [candidates, view]);

  const width = 920;
  const height = 535;
  const positions = useMemo(() => new Map(nodes.map((node, index) => [node.id, positionFor(index, nodes.length, width, height)])), [nodes]);
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId);
  const highlighted = new Set(highlightedIds);

  return (
    <section className="brain-card overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><Network className="h-5 w-5" /></div><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-600">Your thought landscape</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">반복 관심과 연결의 지도</h2><p className="mt-1 text-xs leading-5 text-slate-500">큰 노드는 더 자주 돌아본 관심, 선은 같은 탐색 흐름에서 발견된 연결입니다.</p></div></div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="지도 보기 범위">{([['all', '전체'], ['pending', '검토 중'], ['confirmed', '정착한 연결']] as const).map(([key, label]) => <button type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`min-h-9 rounded-lg px-3 text-xs font-bold transition ${view === key ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>{label}</button>)}</div>
      </div>

      <div className="relative min-h-[445px] bg-[radial-gradient(circle_at_50%_44%,rgba(219,234,254,.94),rgba(255,255,255,.82)_33%,rgba(248,250,252,.96)_75%)] p-3 md:p-5">
        {nodes.length === 0 ? <div className="flex min-h-[410px] flex-col items-center justify-center px-5 text-center"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-blue-600"><CircleDot className="h-7 w-7" /></div><h3 className="mt-5 text-base font-extrabold text-slate-800">아직 지도에 놓을 패턴이 없습니다.</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Chrome 확장 프로그램을 연결하고 새 흔적을 읽어오면 반복 관심과 잠재적 연결이 이곳에 나타납니다.</p></div> : <svg viewBox={`0 0 ${width} ${height}`} className="h-[430px] w-full" role="img" aria-labelledby="map-title map-description"><title id="map-title">Amy Brain Map 관심과 연결 지도</title><desc id="map-description">노드는 탐색 관심을, 선은 함께 나타난 탐색 흐름을 나타냅니다. 각 노드는 키보드로 선택할 수 있습니다.</desc><defs><pattern id="dotGrid" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#93c5fd" opacity=".32" /></pattern><radialGradient id="mapCenter" cx="50%" cy="46%" r="52%"><stop offset="0%" stopColor="#dbeafe" stopOpacity=".85" /><stop offset="65%" stopColor="#f8fbff" stopOpacity=".35" /><stop offset="100%" stopColor="#ffffff" stopOpacity="0" /></radialGradient><filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><rect width={width} height={height} fill="url(#dotGrid)" opacity=".52" /><rect width={width} height={height} fill="url(#mapCenter)" /><circle cx={width / 2} cy={height / 2} r="76" fill="none" stroke="#60a5fa" strokeOpacity=".32" strokeDasharray="3 10" /><circle cx={width / 2} cy={height / 2} r="162" fill="none" stroke="#a78bfa" strokeOpacity=".2" strokeDasharray="3 12" /><circle cx={width / 2} cy={height / 2} r="236" fill="none" stroke="#bfdbfe" strokeOpacity=".55" strokeDasharray="2 14" />
          <g aria-hidden="true"><circle cx={width / 2} cy={height / 2} r="35" fill="#ffffff" stroke="#2563eb" strokeWidth="1.5" /><path d={`M ${width / 2 - 11} ${height / 2} h22 M ${width / 2} ${height / 2 - 11} v22`} stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" /><text x={width / 2} y={height / 2 + 54} textAnchor="middle" fill="#475569" fontSize="10" fontWeight="700">YOUR MAP</text></g>
          {edges.map((edge) => { const source = positions.get(edge.source); const target = positions.get(edge.target); if (!source || !target) return null; const isSelected = selectedCandidate?.id === edge.id || highlighted.has(edge.id); return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={isSelected ? '#f59e0b' : '#93c5fd'} strokeOpacity={isSelected ? .95 : .56} strokeWidth={isSelected ? 3 : 1.35} strokeDasharray={isSelected ? undefined : '4 5'} /></g>; })}
          {nodes.map((node) => { const point = positions.get(node.id)!; const candidate = node.candidates[0]; const isSelected = candidate.id === selectedId; const isHighlighted = node.candidates.some((item) => highlighted.has(item.id)); const radius = Math.min(39, 16 + node.count * 3 + node.confidence * 10) + (isHighlighted ? 5 : 0); const color = isHighlighted ? '#f59e0b' : candidate.status === 'pending' ? '#7c3aed' : candidate.status === 'approved' ? '#059669' : '#2563eb'; const label = node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label; return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.label}, 신뢰도 ${Math.round(node.confidence * 100)}%, ${node.count}개 신호. 상세 연결 선택`} onClick={() => onSelect(candidate)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(candidate); } }} className="cursor-pointer outline-none"><circle cx={point.x} cy={point.y} r={radius + 12} fill={color} opacity={isSelected || isHighlighted ? .23 : .07} filter="url(#nodeGlow)" /><circle cx={point.x} cy={point.y} r={radius} fill="#ffffff" stroke={color} strokeWidth={isSelected || isHighlighted ? 3.2 : 1.7} /><circle cx={point.x - radius * .3} cy={point.y - radius * .3} r={Math.max(3, radius * .15)} fill={color} opacity=".9" /><text x={point.x} y={point.y + 4} textAnchor="middle" fill="#1e293b" fontSize="11" fontWeight="700" pointerEvents="none">{label}</text><text x={point.x} y={point.y + radius + 17} textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600" pointerEvents="none">{Math.round(node.confidence * 100)}% · {node.count}개 신호</text></g>; })}</svg>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-600 md:grid-cols-4 md:px-6">{Object.entries(STATUS_STYLE).slice(0, 3).map(([key, style]) => <div className="flex items-center gap-2" key={key}><span className="h-2.5 w-2.5 rounded-full" style={{ background: style.color }} /><span>{style.label}</span></div>)}<div className="flex items-center justify-start gap-1.5 text-blue-700 md:justify-end"><Focus className="h-3.5 w-3.5" />표시 중인 관심 축 {nodes.length}개</div></div>
    </section>
  );
}
