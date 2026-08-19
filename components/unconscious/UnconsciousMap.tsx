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
type EdgeKind = 'related';

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

interface ClusterColor {
  stroke: string;
  glow: string;
}

interface TopicCluster {
  id: string;
  rootId: string;
  rootLabel: string;
  memberIds: Set<string>;
  color: ClusterColor;
}

interface ClusterMindMapLayout {
  positions: Map<string, MapPoint>;
  clusterByNode: Map<string, TopicCluster>;
  clusters: TopicCluster[];
}

const CLUSTER_PALETTE: ClusterColor[] = [
  { stroke: '#38bdf8', glow: '#0ea5e9' },
  { stroke: '#a78bfa', glow: '#8b5cf6' },
  { stroke: '#fbbf24', glow: '#f59e0b' },
  { stroke: '#fb7185', glow: '#f43f5e' },
  { stroke: '#34d399', glow: '#10b981' },
  { stroke: '#fb923c', glow: '#f97316' },
];

const STATUS_STYLE: Record<CandidateStatus, { label: string; color: string }> = {
  pending: { label: '연결 검토 대상', color: '#9db5ff' },
  approved: { label: '지도에 반영됨', color: '#ffffff' },
  auto_applied: { label: '자동 반영', color: '#8f6bd1' },
  rejected: { label: '제외됨', color: '#65718a' },
};

const EDGE_STYLE: Record<EdgeKind, { label: string }> = {
  related: { label: '함께 살펴본 관심' },
};

function nodeRadius(node: MapNode, degree = 0) {
  const connectionBoost = Math.min(13, degree * 2.15);
  return Math.min(46, 16 + node.count * 3 + node.confidence * 10 + connectionBoost);
}

function nodeImportance(node: MapNode, degree: number) {
  return degree * 5 + node.count * 2.5 + node.confidence * 8;
}

function resolveClusterMindMapLayout(nodes: MapNode[], edges: MapEdge[], degrees: Map<string, number>, width: number, height: number): ClusterMindMapLayout {
  if (nodes.length === 0) return { positions: new Map(), clusterByNode: new Map(), clusters: [] };
  const minX = 64;
  const maxX = width - 64;
  const minY = 58;
  const maxY = height - 66;
  const clamp = (point: MapPoint): MapPoint => ({ x: Math.max(minX, Math.min(maxX, point.x)), y: Math.max(minY, Math.min(maxY, point.y)) });
  const adjacency = new Map(nodes.map((node) => [node.id, new Map<string, number>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.set(edge.target, Math.max(adjacency.get(edge.source)?.get(edge.target) || 0, edge.score));
    adjacency.get(edge.target)?.set(edge.source, Math.max(adjacency.get(edge.target)?.get(edge.source) || 0, edge.score));
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(nodes.map((node) => node.id));
  const clusters: TopicCluster[] = [];
  while (remaining.size > 0) {
    const seed = [...remaining]
      .map((id) => nodesById.get(id)!)
      .sort((left, right) => nodeImportance(right, degrees.get(right.id) || 0) - nodeImportance(left, degrees.get(left.id) || 0) || left.label.localeCompare(right.label, 'ko-KR'))[0];
    const memberIds = new Set<string>();
    const queue = [seed.id];
    remaining.delete(seed.id);
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      memberIds.add(currentId);
      for (const neighborId of adjacency.get(currentId)?.keys() || []) {
        if (!remaining.has(neighborId)) continue;
        remaining.delete(neighborId);
        queue.push(neighborId);
      }
    }
    const root = [...memberIds]
      .map((id) => nodesById.get(id)!)
      .sort((left, right) => nodeImportance(right, degrees.get(right.id) || 0) - nodeImportance(left, degrees.get(left.id) || 0) || left.label.localeCompare(right.label, 'ko-KR'))[0];
    const color = CLUSTER_PALETTE[clusters.length % CLUSTER_PALETTE.length];
    clusters.push({ id: `cluster:${root.id}`, rootId: root.id, rootLabel: root.label, memberIds, color });
  }

  clusters.sort((left, right) => right.memberIds.size - left.memberIds.size || left.rootLabel.localeCompare(right.rootLabel, 'ko-KR'));
  const clusterByNode = new Map<string, TopicCluster>();
  for (const cluster of clusters) for (const nodeId of cluster.memberIds) clusterByNode.set(nodeId, cluster);

  const positions = new Map<string, MapPoint>();
  const fixedRootIds = new Set<string>();
  const orderedNodes = clusters.flatMap((cluster) => {
    const members = [...cluster.memberIds]
      .map((id) => nodesById.get(id)!)
      .filter((node) => node.id !== cluster.rootId)
      .sort((left, right) => nodeImportance(right, degrees.get(right.id) || 0) - nodeImportance(left, degrees.get(left.id) || 0) || left.label.localeCompare(right.label, 'ko-KR'));
    return [nodesById.get(cluster.rootId)!, ...members];
  });
  const center = { x: width / 2, y: height / 2 };
  const ringRadius = Math.min(height * 0.38, width * 0.28, 205);
  orderedNodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, orderedNodes.length);
    positions.set(node.id, clamp({ x: center.x + Math.cos(angle) * ringRadius, y: center.y + Math.sin(angle) * ringRadius }));
  });

  const points = nodes.map((node) => ({ ...positions.get(node.id)! }));
  for (let iteration = 0; iteration < 150; iteration += 1) {
    let moved = 0;
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        const leftNode = nodes[leftIndex];
        const rightNode = nodes[rightIndex];
        const left = points[leftIndex];
        const right = points[rightIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);
        const requiredDistance = nodeRadius(leftNode, degrees.get(leftNode.id) || 0) + nodeRadius(rightNode, degrees.get(rightNode.id) || 0) + 26;
        if (distance >= requiredDistance) continue;
        const angle = distance > 0.01 ? Math.atan2(dy, dx) : (leftIndex + 1) * 1.618;
        const push = Math.min(8, (requiredDistance - distance) / 2 + 0.25);
        const leftIsFixed = fixedRootIds.has(leftNode.id);
        const rightIsFixed = fixedRootIds.has(rightNode.id);
        if (!leftIsFixed) { left.x -= Math.cos(angle) * (rightIsFixed ? push * 2 : push); left.y -= Math.sin(angle) * (rightIsFixed ? push * 2 : push); }
        if (!rightIsFixed) { right.x += Math.cos(angle) * (leftIsFixed ? push * 2 : push); right.y += Math.sin(angle) * (leftIsFixed ? push * 2 : push); }
        moved += push;
      }
    }
    for (const point of points) Object.assign(point, clamp(point));
    if (moved < 0.08) break;
  }

  return { positions: new Map(nodes.map((node, index) => [node.id, points[index]])), clusterByNode, clusters };
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
      if (!existing || edge.score > existing.score) {
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
      addEdge({ id: `related:${candidate.id}`, source, target, kind: 'related', score: candidate.confidence, candidateIds: [candidate.id] });
    }

    const interests = visible.filter((candidate) => candidate.kind !== 'bridge' && nodeIds.has(topicNodeId(candidate.subject)));
    for (let index = 0; index < interests.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < interests.length; otherIndex += 1) {
        const left = interests[index];
        const right = interests[otherIndex];
        if (left.subject === right.subject) continue;
        const sharedVisits = hasOverlap(left.sourceVisitIds, right.sourceVisitIds);
        if (sharedVisits.length === 0) continue;
        const source = topicNodeId(left.subject);
        const target = topicNodeId(right.subject);
        const score = Math.min(0.82, Math.max(left.confidence, right.confidence) * 0.8 + Math.min(0.18, sharedVisits.length * 0.06));
        addEdge({ id: `related:${left.id}:${right.id}`, source, target, kind: 'related', score, candidateIds: [left.id, right.id] });
      }
    }

    return { nodes: graphNodes, edges: [...edgesByPair.values()].sort((left, right) => right.score - left.score).slice(0, 20) };
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
  const clusterMindMapLayout = useMemo(() => resolveClusterMindMapLayout(nodes, edges, degrees, width, height), [nodes, edges, degrees]);
  const positions = clusterMindMapLayout.positions;
  const clusterByNode = clusterMindMapLayout.clusterByNode;
  const clusters = clusterMindMapLayout.clusters;
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
            <h2 className="mt-1 text-lg font-extrabold text-slate-950">관심 군집 마인드맵</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">같은 색의 원은 하나의 관심 군집이며, 선은 실제로 함께 살펴본 관심 사이의 연결입니다.</p>
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
              <desc id="map-description">같은 색의 원은 하나의 관심 군집을 나타냅니다. 선은 실제로 함께 살펴본 관심 사이의 연결이며, 청록색 테두리는 현재 질문과 관련된 기존 관심 축입니다.</desc>
              <defs>
                <pattern id="dotGrid" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#9db5ff" opacity=".24" /></pattern>
                <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              <rect width={width} height={height} fill="url(#dotGrid)" opacity=".52" />
              {pointer && <circle cx={pointer.x} cy={pointer.y} r="38" fill="none" stroke="#6ee7ff" strokeOpacity=".18" strokeWidth="1.5" pointerEvents="none" />}
              {edges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) return null;
                const isActive = edge.candidateIds.includes(selectedId || '') || edge.candidateIds.some((id) => highlighted.has(id)) || evidenceRelatedNodeIds.has(edge.source) || evidenceRelatedNodeIds.has(edge.target);
                const sourceCluster = clusterByNode.get(edge.source);
                const targetCluster = clusterByNode.get(edge.target);
                const clusterStroke = sourceCluster && sourceCluster === targetCluster ? sourceCluster.color.stroke : '#9db5ff';
                const sourceSway = reedSway(source, pointer);
                const targetSway = reedSway(target, pointer);
                return <line key={edge.id} x1={source.x + sourceSway.x} y1={source.y + sourceSway.y} x2={target.x + targetSway.x} y2={target.y + targetSway.y} stroke={isActive ? '#6ee7ff' : clusterStroke} strokeOpacity={isActive ? .98 : hasHighlightedNodes ? .18 : .62} strokeWidth={isActive ? 4 : Math.max(1.35, edge.score * 2.45)} />;
              })}
              {nodes.map((node) => {
                const point = positions.get(node.id)!;
                const candidate = node.candidates[0];
                const isSelected = node.candidates.some((item) => item.id === selectedId);
                const isHighlighted = evidenceRelatedNodeIds.has(node.id) || node.candidates.some((item) => highlighted.has(item.id));
                const isFocused = isSelected || isHighlighted;
                const isDimmed = hasHighlightedNodes && !isFocused;
                const degree = degrees.get(node.id) || 0;
                const cluster = clusterByNode.get(node.id);
                const baseRadius = nodeRadius(node, degree);
                const radius = baseRadius + (isHighlighted ? 5 : 0);
                const status = statusFor(node);
                const color = isHighlighted ? '#6ee7ff' : isSelected ? '#ffffff' : cluster?.color.stroke || STATUS_STYLE[status].color;
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
                    <circle cx={point.x} cy={point.y} r={radius + 12 + sway.strength * 5} fill="#ffffff" opacity={isFocused ? .2 : .05} filter="url(#nodeGlow)" />
                    <circle cx={point.x} cy={point.y} r={radius} fill={isHighlighted ? '#102c42' : cluster?.color.glow || '#111319'} fillOpacity={isHighlighted ? 1 : .27} stroke={color} strokeWidth={isFocused ? 3.6 : 1.9} />
                    <text x={point.x} y={point.y + 4} textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700" pointerEvents="none">{label}</text>
                    <text x={point.x} y={point.y + radius + 17} textAnchor="middle" fill={isHighlighted ? '#9ff3ff' : cluster?.color.stroke || '#a9b0bf'} fontSize="9" fontWeight="600" pointerEvents="none">{isHighlighted ? '질문 관련' : degree > 0 ? `연결 ${degree}개` : '새 관심'}</text>
                  </g>
                );
              })}
            </svg>
            {edges.length === 0 && <p className="pointer-events-none absolute bottom-7 left-1/2 w-full max-w-md -translate-x-1/2 px-6 text-center text-xs leading-5 text-slate-500">아직 함께 살펴본 흔적이 충분하지 않아 독립적으로 보입니다. 같은 페이지를 함께 살펴본 기록이 쌓이면 연결선이 나타납니다.</p>}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-600 md:px-6">
        {hasHighlightedNodes && <div className="flex items-center gap-2 text-cyan-700"><span className="h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.9)]" /><span>현재 질문 관련 항목 · 빈 곳 또는 강조된 노드를 다시 클릭하면 해제</span></div>}
        {evidenceRelatedNodeIds.size > 0 && <div className="flex items-center gap-2 text-cyan-700"><span className="h-2.5 w-2.5 rounded-full border border-cyan-200 bg-cyan-950 shadow-[0_0_10px_rgba(103,232,249,.9)]" /><span>질문 근거와 이어진 관심 축</span></div>}
        {clusters.slice(0, 6).map((cluster) => <div className="flex items-center gap-2" key={cluster.id}><span className="h-2.5 w-2.5 rounded-full" style={{ background: cluster.color.stroke }} /><span>{cluster.rootLabel} 군집</span></div>)}
        <div className="flex items-center gap-2"><span className="h-0 w-4 border-t-2 border-slate-400" /><span>{EDGE_STYLE.related.label}</span></div>
        <div className="ml-auto flex items-center gap-1.5 text-blue-700"><Focus className="h-3.5 w-3.5" aria-hidden="true" />관심 축 {nodes.length}개 · 주제 군집 {clusters.length}개 · 관계선 {edges.length}개</div>
      </div>
    </section>
  );
}
