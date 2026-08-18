'use client';

import React, { useMemo, useState } from 'react';
import { CircleDot, Focus, Network } from 'lucide-react';
import { DiscoveryCandidate } from './types';

interface HighlightedVisit {
  id: string;
  title: string;
  domain: string;
  visitCount: number;
}

interface UnconsciousMapProps {
  candidates: DiscoveryCandidate[];
  selectedId?: string;
  highlightedIds?: string[];
  highlightedVisits?: HighlightedVisit[];
  onSelect: (candidate: DiscoveryCandidate) => void;
  onClearHighlights?: () => void;
}

type CandidateStatus = DiscoveryCandidate['status'];
type EdgeKind = 'journey' | 'cooccurrence' | 'shared-domain';

interface MapNode {
  id: string;
  label: string;
  confidence: number;
  count: number;
  candidates: DiscoveryCandidate[];
}

interface MapEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  score: number;
  candidateIds: string[];
}

interface MapPoint {
  x: number;
  y: number;
}

const STATUS_STYLE: Record<CandidateStatus, { label: string; color: string }> = {
  pending: { label: '연결 검토 대상', color: '#9db5ff' },
  approved: { label: '지도에 반영됨', color: '#ffffff' },
  auto_applied: { label: '자동 반영', color: '#8f6bd1' },
  rejected: { label: '제외됨', color: '#65718a' },
};

const EDGE_STYLE: Record<EdgeKind, { label: string; color: string; dash?: string }> = {
  journey: { label: '같은 탐색 흐름', color: '#9db5ff' },
  cooccurrence: { label: '같은 페이지에서 함께 나타남', color: '#8f6bd1', dash: '4 5' },
  'shared-domain': { label: '같은 도메인에서 반복 탐색', color: '#65718a', dash: '2 7' },
};

function positionFor(index: number, total: number, degree: number, maxDegree: number, width: number, height: number): MapPoint {
  if (total <= 1) return { x: width / 2, y: height / 2 };
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const normalizedDegree = maxDegree > 0 ? degree / maxDegree : 0;
  const radiusX = Math.min(width * (0.39 - normalizedDegree * 0.12), 330);
  const radiusY = Math.min(height * (0.35 - normalizedDegree * 0.1), 185);
  return { x: width / 2 + Math.cos(angle) * radiusX, y: height / 2 + Math.sin(angle) * radiusY };
}

function nodeRadius(node: MapNode, degree = 0) {
  const connectionBoost = Math.min(13, degree * 2.15);
  return Math.min(46, 16 + node.count * 3 + node.confidence * 10 + connectionBoost);
}

function resolveNodePositions(nodes: MapNode[], degrees: Map<string, number>, maxDegree: number, width: number, height: number) {
  const points = nodes.map((node, index) => ({ ...positionFor(index, nodes.length, degrees.get(node.id) || 0, maxDegree, width, height) }));
  const minX = 64;
  const maxX = width - 64;
  const minY = 58;
  const maxY = height - 66;

  for (let iteration = 0; iteration < 220; iteration += 1) {
    let moved = 0;
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        const left = points[leftIndex];
        const right = points[rightIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);
        const requiredDistance = nodeRadius(nodes[leftIndex], degrees.get(nodes[leftIndex].id) || 0) + nodeRadius(nodes[rightIndex], degrees.get(nodes[rightIndex].id) || 0) + 28;
        if (distance >= requiredDistance) continue;
        const angle = distance > 0.01 ? Math.atan2(dy, dx) : ((leftIndex + 1) * 1.618);
        const push = Math.min(9, (requiredDistance - distance) / 2 + 0.3);
        const offsetX = Math.cos(angle) * push;
        const offsetY = Math.sin(angle) * push;
        left.x -= offsetX;
        left.y -= offsetY;
        right.x += offsetX;
        right.y += offsetY;
        moved += push;
      }
    }

    for (const point of points) {
      point.x = Math.max(minX, Math.min(maxX, point.x));
      point.y = Math.max(minY, Math.min(maxY, point.y));
    }
    if (moved < 0.08) break;
  }

  return new Map(nodes.map((node, index) => [node.id, points[index]]));
}

function canonicalPair(left: string, right: string) {
  return [left, right].sort((a, b) => a.localeCompare(b)).join('::');
}

function topicNodeId(label: string) {
  return `topic:${label.trim().toLocaleLowerCase('en-US')}`;
}

function readableTopicLabel(label: string) {
  const normalized = label.replace(/\s+/g, ' ').trim();
  return normalized.toLocaleLowerCase('en-US') === 'ai' ? 'AI' : normalized;
}

function statusFor(node: MapNode): CandidateStatus {
  if (node.candidates.some((candidate) => candidate.status === 'approved')) return 'approved';
  if (node.candidates.some((candidate) => candidate.status === 'auto_applied')) return 'auto_applied';
  if (node.candidates.some((candidate) => candidate.status === 'pending')) return 'pending';
  return 'rejected';
}

function hasOverlap(left: string[], right: string[]) {
  const set = new Set(left);
  return right.filter((value) => set.has(value));
}

function reedSway(point: MapPoint, pointer: MapPoint | null) {
  if (!pointer) return { x: 0, y: 0, scale: 1, strength: 0 };
  const dx = point.x - pointer.x;
  const dy = point.y - pointer.y;
  const distance = Math.hypot(dx, dy);
  const reach = 172;
  if (distance >= reach) return { x: 0, y: 0, scale: 1, strength: 0 };
  const strength = Math.pow(1 - distance / reach, 1.7);
  const angle = distance > 0.1 ? Math.atan2(dy, dx) : 0;
  return {
    x: Math.cos(angle) * 18 * strength,
    y: Math.sin(angle) * 11 * strength,
    scale: 1 + strength * 0.1,
    strength,
  };
}

export default function UnconsciousMap({ candidates, selectedId, highlightedIds = [], highlightedVisits = [], onSelect, onClearHighlights }: UnconsciousMapProps) {
  const [view, setView] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [pointer, setPointer] = useState<MapPoint | null>(null);
  const highlighted = new Set(highlightedIds);
  const highlightedVisitKey = highlightedVisits.map((visit) => `${visit.id}:${visit.domain}`).sort().join('|');

  const { nodes, edges } = useMemo(() => {
    const visible = candidates.filter((candidate) => {
      if (view === 'pending') return candidate.status === 'pending';
      if (view === 'confirmed') return candidate.status === 'approved' || candidate.status === 'auto_applied';
      return candidate.status !== 'rejected';
    });

    const grouped = new Map<string, MapNode>();
    const addNodeCandidate = (label: string, candidate: DiscoveryCandidate) => {
      const id = topicNodeId(label);
      const existing = grouped.get(id);
      if (existing) {
        existing.count += 1;
        existing.confidence = Math.max(existing.confidence, candidate.confidence);
        existing.candidates.push(candidate);
      } else {
        grouped.set(id, { id, label: readableTopicLabel(label), confidence: candidate.confidence, count: 1, candidates: [candidate] });
      }
    };

    for (const candidate of visible) {
      addNodeCandidate(candidate.subject, candidate);
      if (candidate.kind === 'bridge' && candidate.object) addNodeCandidate(candidate.object, candidate);
    }

    const graphNodes = [...grouped.values()]
      .sort((left, right) => right.confidence - left.confidence || right.count - left.count || left.label.localeCompare(right.label, 'ko-KR'))
      .slice(0, 18);
    const nodeIds = new Set(graphNodes.map((node) => node.id));
    const edgesByPair = new Map<string, MapEdge>();

    const addEdge = (edge: MapEdge) => {
      const key = canonicalPair(edge.source, edge.target);
      const existing = edgesByPair.get(key);
      const priority: Record<EdgeKind, number> = { journey: 3, cooccurrence: 2, 'shared-domain': 1 };
      if (!existing || priority[edge.kind] > priority[existing.kind] || edge.score > existing.score) {
        edgesByPair.set(key, edge);
      } else if (existing) {
        existing.candidateIds = [...new Set([...existing.candidateIds, ...edge.candidateIds])];
      }
    };

    for (const candidate of visible) {
      if (candidate.kind !== 'bridge' || !candidate.object) continue;
      const source = topicNodeId(candidate.subject);
      const target = topicNodeId(candidate.object);
      if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) continue;
      addEdge({ id: `journey:${candidate.id}`, source, target, kind: 'journey', score: candidate.confidence, candidateIds: [candidate.id] });
    }

    const interests = visible.filter((candidate) => candidate.kind !== 'bridge' && nodeIds.has(topicNodeId(candidate.subject)));
    for (let index = 0; index < interests.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < interests.length; otherIndex += 1) {
        const left = interests[index];
        const right = interests[otherIndex];
        if (left.subject === right.subject) continue;
        const sharedVisits = hasOverlap(left.sourceVisitIds, right.sourceVisitIds);
        const sharedDomains = hasOverlap(left.sourceDomains, right.sourceDomains);
        if (sharedVisits.length === 0 && sharedDomains.length === 0) continue;
        const source = topicNodeId(left.subject);
        const target = topicNodeId(right.subject);
        const kind: EdgeKind = sharedVisits.length > 0 ? 'cooccurrence' : 'shared-domain';
        const score = Math.min(0.78, Math.max(left.confidence, right.confidence) * 0.8 + (sharedVisits.length > 0 ? 0.14 : 0.06));
        addEdge({ id: `${kind}:${left.id}:${right.id}`, source, target, kind, score, candidateIds: [left.id, right.id] });
      }
    }

    return { nodes: graphNodes, edges: [...edgesByPair.values()].sort((left, right) => right.score - left.score).slice(0, 28) };
  }, [candidates, view]);

  const evidenceRelatedNodeIds = useMemo(() => {
    if (highlightedVisits.length === 0) return new Set<string>();
    const evidenceVisitIds = new Set(highlightedVisits.map((visit) => visit.id));
    const evidenceDomains = new Set(highlightedVisits.map((visit) => visit.domain));
    return new Set(nodes
      .filter((node) => node.candidates.some((candidate) => candidate.sourceVisitIds.some((id) => evidenceVisitIds.has(id)) || candidate.sourceDomains.some((domain) => evidenceDomains.has(domain))))
      .map((node) => node.id));
  }, [nodes, highlightedVisitKey]);

  const width = 920;
  const height = 535;
  const degrees = useMemo(() => {
    const next = new Map(nodes.map((node) => [node.id, 0]));
    for (const edge of edges) {
      next.set(edge.source, (next.get(edge.source) || 0) + 1);
      next.set(edge.target, (next.get(edge.target) || 0) + 1);
    }
    return next;
  }, [nodes, edges]);
  const maxDegree = Math.max(0, ...degrees.values());
  const positions = useMemo(() => resolveNodePositions(nodes, degrees, maxDegree, width, height), [nodes, degrees, maxDegree]);
  const hasHighlightedNodes = highlighted.size > 0 || evidenceRelatedNodeIds.size > 0;

  const handleClearClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!hasHighlightedNodes || !onClearHighlights) return;
    if (event.target === event.currentTarget || event.target instanceof SVGRectElement) onClearHighlights();
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setPointer({
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    });
  };

  return (
    <section className="brain-card overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/5 text-blue-200"><Network className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">Cognitive graph</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-950">반복 관심과 연결의 지도</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">실선은 같은 탐색 흐름, 점선은 같은 페이지 또는 도메인에서 함께 나타난 관심입니다.</p>
          </div>
        </div>
        <div className="aether-map-tab-shell inline-flex rounded-xl border p-1" aria-label="지도 보기 범위">
          {([['all', '전체'], ['pending', '연결 검토'], ['confirmed', '지도에 반영됨']] as const).map(([key, label]) => (
            <button type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`aether-map-tab min-h-9 rounded-lg px-3 text-xs font-bold transition ${view === key ? 'aether-map-tab-active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="aether-map-stage relative min-h-[445px] p-3 md:p-5">
        {nodes.length === 0 ? (
          <div className="flex min-h-[410px] flex-col items-center justify-center px-5 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-blue-600"><CircleDot className="h-7 w-7" aria-hidden="true" /></div>
            <h3 className="mt-5 text-base font-extrabold text-slate-800">아직 지도에 놓을 패턴이 없습니다.</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Chrome 기록을 분석하면 반복 관심과 탐색 흐름의 연결이 이곳에 나타납니다.</p>
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-[430px] w-full touch-none" role="img" aria-labelledby="map-title map-description" onClick={handleClearClick} onPointerMove={handlePointerMove} onPointerLeave={() => setPointer(null)}>
              <title id="map-title">Amy Brain Map 관심과 연결 지도</title>
              <desc id="map-description">노드는 반복 탐색에서 발견한 기존 관심 축을 나타냅니다. 청록색 테두리의 노드는 현재 질문의 방문 근거와 연결된 기존 관심 축입니다. 선은 같은 탐색 흐름 또는 공통 탐색 근거로 확인된 관계를 나타냅니다.</desc>
              <defs>
                <pattern id="dotGrid" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#9db5ff" opacity=".24" /></pattern>
                <radialGradient id="mapCenter" cx="50%" cy="46%" r="52%"><stop offset="0%" stopColor="#4b67a0" stopOpacity=".34" /><stop offset="65%" stopColor="#101114" stopOpacity=".2" /><stop offset="100%" stopColor="#050506" stopOpacity="0" /></radialGradient>
                <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              <rect width={width} height={height} fill="url(#dotGrid)" opacity=".52" />
              <rect width={width} height={height} fill="url(#mapCenter)" />
              {pointer && <circle cx={pointer.x} cy={pointer.y} r="38" fill="none" stroke="#6ee7ff" strokeOpacity=".18" strokeWidth="1.5" pointerEvents="none" />}
              {edges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) return null;
                const isActive = edge.candidateIds.includes(selectedId || '') || edge.candidateIds.some((id) => highlighted.has(id)) || evidenceRelatedNodeIds.has(edge.source) || evidenceRelatedNodeIds.has(edge.target);
                const style = EDGE_STYLE[edge.kind];
                const sourceSway = reedSway(source, pointer);
                const targetSway = reedSway(target, pointer);
                return <line key={edge.id} x1={source.x + sourceSway.x} y1={source.y + sourceSway.y} x2={target.x + targetSway.x} y2={target.y + targetSway.y} stroke={isActive ? '#6ee7ff' : style.color} strokeOpacity={isActive ? .98 : hasHighlightedNodes ? .18 : .62} strokeWidth={isActive ? 4 : Math.max(1.15, edge.score * 2.2)} strokeDasharray={isActive ? undefined : style.dash} />;
              })}
              {nodes.map((node) => {
                const point = positions.get(node.id)!;
                const candidate = node.candidates[0];
                const isSelected = node.candidates.some((item) => item.id === selectedId);
                const isHighlighted = evidenceRelatedNodeIds.has(node.id) || node.candidates.some((item) => highlighted.has(item.id));
                const isFocused = isSelected || isHighlighted;
                const isDimmed = hasHighlightedNodes && !isFocused;
                const degree = degrees.get(node.id) || 0;
                const baseRadius = nodeRadius(node, degree);
                const radius = baseRadius + (isHighlighted ? 5 : 0);
                const status = statusFor(node);
                const color = isHighlighted ? '#6ee7ff' : isSelected ? '#ffffff' : STATUS_STYLE[status].color;
                const labelLimit = 12;
                const label = node.label.length > labelLimit ? `${node.label.slice(0, labelLimit)}…` : node.label;
                const sway = reedSway(point, pointer);
                return (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}, ${isHighlighted ? '현재 질문 관련 항목, ' : ''}${STATUS_STYLE[status].label}, 연결 ${degree}개. 상세 연결 검토 선택`}
                    onClick={(event) => { event.stopPropagation(); if (isHighlighted && onClearHighlights) onClearHighlights(); else if (candidate) onSelect(candidate); }}
                    onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); if (isHighlighted && onClearHighlights) onClearHighlights(); else if (candidate) onSelect(candidate); }}
                    className="map-node-reed cursor-pointer outline-none"
                    style={{
                      opacity: isDimmed ? 0.3 : 1,
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      transform: `translate(${sway.x}px, ${sway.y}px) scale(${sway.scale})`,
                      transition: 'transform 190ms cubic-bezier(.2,.75,.25,1), opacity 180ms ease',
                    }}
                  >
                    {isHighlighted && <circle cx={point.x} cy={point.y} r={radius + 17} fill="none" stroke="#6ee7ff" strokeOpacity=".72" strokeWidth="1.5" strokeDasharray="3 5" />}
                    <circle cx={point.x} cy={point.y} r={radius + 12 + sway.strength * 5} fill={color} opacity={isFocused ? .3 : .07} filter="url(#nodeGlow)" />
                    <circle cx={point.x} cy={point.y} r={radius} fill={isHighlighted ? '#102c42' : '#111319'} stroke={color} strokeWidth={isFocused ? 3.6 : 1.7} />
                    <text x={point.x} y={point.y + 4} textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700" pointerEvents="none">{label}</text>
                    <text x={point.x} y={point.y + radius + 17} textAnchor="middle" fill={isHighlighted ? '#9ff3ff' : '#a9b0bf'} fontSize="9" fontWeight="600" pointerEvents="none">{isHighlighted ? '질문 관련' : degree > 0 ? `연결 ${degree}개` : '단서 수집 중'}</text>
                  </g>
                );
              })}
            </svg>
            {edges.length === 0 && <p className="pointer-events-none absolute bottom-7 left-1/2 w-full max-w-md -translate-x-1/2 px-6 text-center text-xs leading-5 text-slate-500">현재는 노드 사이의 공통 탐색 근거가 충분하지 않아 독립적으로 보입니다. 같은 페이지·도메인·탐색 흐름이 더 쌓이면 관계선이 나타납니다.</p>}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-600 md:px-6">
        {hasHighlightedNodes && <div className="flex items-center gap-2 text-cyan-700"><span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.9)]" /><span>현재 질문 관련 항목 · 빈 곳 또는 강조된 노드를 다시 클릭하면 해제</span></div>}
        {evidenceRelatedNodeIds.size > 0 && <div className="flex items-center gap-2 text-cyan-700"><span className="h-2.5 w-2.5 rounded-full border border-cyan-200 bg-cyan-950 shadow-[0_0_10px_rgba(103,232,249,.9)]" /><span>질문 근거와 이어진 관심 축</span></div>}
        {Object.entries(STATUS_STYLE).slice(0, 3).map(([key, style]) => <div className="flex items-center gap-2" key={key}><span className="h-2.5 w-2.5 rounded-full" style={{ background: style.color }} /><span>{style.label}</span></div>)}
        {Object.entries(EDGE_STYLE).map(([key, style]) => <div className="flex items-center gap-2" key={key}><span className="h-0 w-4 border-t-2" style={{ borderColor: style.color, borderStyle: style.dash ? 'dashed' : 'solid' }} /><span>{style.label}</span></div>)}
        <div className="ml-auto flex items-center gap-1.5 text-blue-700"><Focus className="h-3.5 w-3.5" aria-hidden="true" />관심 축 {nodes.length}개 · 관계선 {edges.length}개</div>
      </div>
    </section>
  );
}
