'use client';

import React, { useMemo, useState } from 'react';
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
  pending: { label: '검토 대기', color: '#fbbf24' },
  approved: { label: '반영됨', color: '#34d399' },
  auto_applied: { label: '자동 반영', color: '#a78bfa' },
  rejected: { label: '제외됨', color: '#64748b' },
};

function positionFor(index: number, total: number, width: number, height: number) {
  if (total <= 1) return { x: width / 2, y: height / 2 };
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const radiusX = Math.min(width * 0.36, 290);
  const radiusY = Math.min(height * 0.32, 175);
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
        grouped.set(candidate.subject, {
          id: `topic:${candidate.subject}`,
          label: candidate.subject,
          kind: candidate.kind === 'bridge' ? 'bridge' : 'interest',
          confidence: candidate.confidence,
          count: 1,
          candidates: [candidate],
        });
      }
      if (candidate.kind === 'bridge' && candidate.object) {
        const right = grouped.get(candidate.object);
        if (!right) {
          grouped.set(candidate.object, {
            id: `topic:${candidate.object}`,
            label: candidate.object,
            kind: 'bridge',
            confidence: candidate.confidence,
            count: 1,
            candidates: [candidate],
          });
        } else {
          right.candidates.push(candidate);
          right.count += 1;
          right.confidence = Math.max(right.confidence, candidate.confidence);
        }
      }
    }
    const graphNodes = [...grouped.values()].sort((a, b) => b.confidence - a.confidence || b.count - a.count).slice(0, 18);
    const acceptedIds = new Set(graphNodes.map((node) => node.id));
    const graphEdges = visible
      .filter((candidate) => candidate.kind === 'bridge' && acceptedIds.has(`topic:${candidate.subject}`) && acceptedIds.has(`topic:${candidate.object}`))
      .map((candidate) => ({ ...candidate, source: `topic:${candidate.subject}`, target: `topic:${candidate.object}` }));
    return { nodes: graphNodes, edges: graphEdges };
  }, [candidates, view]);

  const width = 880;
  const height = 520;
  const positions = useMemo(() => new Map(nodes.map((node, index) => [node.id, positionFor(index, nodes.length, width, height)])), [nodes]);
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId);
  const highlighted = new Set(highlightedIds);

  return (
    <section className="rounded-2xl border border-violet-400/20 bg-slate-950/70 overflow-hidden shadow-[0_0_50px_rgba(109,40,217,0.10)]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-violet-300">UNCONSCIOUS SYSTEM MAP</p>
          <h2 className="mt-1 text-lg font-bold text-white">반복 관심과 연결 가설</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">원 크기는 반복된 관심의 밀도, 선은 같은 탐색 흐름에서 감지된 연결입니다.</p>
        </div>
        <div className="flex rounded-lg bg-white/5 p-1 text-xs">
          {([['all', '전체'], ['pending', '검토 대기'], ['confirmed', '확정됨']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} className={`rounded-md px-3 py-1.5 transition ${view === key ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[430px] p-3">
        {nodes.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border border-violet-400/30 bg-violet-500/10 text-2xl">◌</div>
            <h3 className="text-sm font-semibold text-white">아직 지도에 놓을 패턴이 없습니다.</h3>
            <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">Chrome 확장 프로그램을 연결하고 방문 기록을 동기화한 뒤 분석을 실행하면 반복 관심과 잠재적 연결이 이곳에 나타납니다.</p>
          </div>
        ) : (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[430px] w-full" role="img" aria-label="무의식 체계 지도">
            <defs>
              <radialGradient id="mapGlow"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.23" /><stop offset="100%" stopColor="#020617" stopOpacity="0" /></radialGradient>
              <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <rect width={width} height={height} fill="url(#mapGlow)" />
            <circle cx={width / 2} cy={height / 2} r="100" fill="none" stroke="#8b5cf6" strokeOpacity="0.12" strokeDasharray="3 9" />
            <circle cx={width / 2} cy={height / 2} r="190" fill="none" stroke="#8b5cf6" strokeOpacity="0.09" strokeDasharray="3 9" />
            {edges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              const isSelected = selectedCandidate?.id === edge.id || highlighted.has(edge.id);
              return <g key={edge.id}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={isSelected ? '#fbbf24' : '#a78bfa'} strokeOpacity={isSelected ? 0.85 : 0.34} strokeWidth={isSelected ? 2.2 : 1.2} />
                <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} textAnchor="middle" fill="#c4b5fd" fontSize="10">연결</text>
              </g>;
            })}
            {nodes.map((node) => {
              const point = positions.get(node.id)!;
              const candidate = node.candidates[0];
              const isSelected = candidate.id === selectedId;
              const isHighlighted = node.candidates.some((item) => highlighted.has(item.id));
              const radius = Math.min(37, 15 + node.count * 3 + node.confidence * 10) + (isHighlighted ? 5 : 0);
              const color = isHighlighted ? '#f472b6' : candidate.status === 'pending' ? '#fbbf24' : candidate.status === 'approved' ? '#34d399' : '#a78bfa';
              return <g key={node.id} className="cursor-pointer" onClick={() => onSelect(candidate)}>
                <circle cx={point.x} cy={point.y} r={radius + 10} fill={color} opacity={isSelected || isHighlighted ? 0.28 : 0.08} filter="url(#nodeGlow)" />
                <circle cx={point.x} cy={point.y} r={radius} fill="#131127" stroke={color} strokeWidth={isSelected || isHighlighted ? 2.8 : 1.4} />
                <circle cx={point.x - radius * 0.28} cy={point.y - radius * 0.28} r={Math.max(3, radius * 0.15)} fill={color} opacity="0.88" />
                <text x={point.x} y={point.y + 4} textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700">{node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label}</text>
                <text x={point.x} y={point.y + radius + 16} textAnchor="middle" fill="#94a3b8" fontSize="9">{Math.round(node.confidence * 100)}% · {node.count}개 신호</text>
              </g>;
            })}
          </svg>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 px-5 py-3 text-[11px] text-slate-400 md:grid-cols-4">
        {Object.entries(STATUS_STYLE).slice(0, 3).map(([key, style]) => <div className="flex items-center gap-2" key={key}><span className="h-2 w-2 rounded-full" style={{ background: style.color }} />{style.label}</div>)}
        <div className="text-right text-violet-300">표시 중인 관심 축 {nodes.length}개</div>
      </div>
    </section>
  );
}
