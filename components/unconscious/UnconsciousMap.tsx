'use client';

import React, { useMemo, useRef, useState } from 'react';
import { CircleDot, Minus, Network, Plus, RotateCcw, Settings2, X } from 'lucide-react';
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

function nodeRadius(node: MapNode, degree = 0) {
  const connectionBoost = Math.min(10, degree * 1.7);
  return Math.min(40, 14 + node.count * 2.2 + node.confidence * 8 + connectionBoost);
}

function nodeImportance(node: MapNode, degree: number) {
  return degree * 5 + node.count * 2.5 + node.confidence * 8;
}

function resolveClusterMindMapLayout(nodes: MapNode[], edges: MapEdge[], degrees: Map<string, number>, width: number, height: number): ClusterMindMapLayout {
  if (nodes.length === 0) return { positions: new Map(), clusterByNode: new Map(), clusters: [] };
  const center = { x: width / 2, y: height / 2 };
  const adjacency = new Map(nodes.map((node) => [node.id, new Map<string, number>()]));
  for (const edge of edges) {
    adjacency.get(edge.source)?.set(edge.target, Math.max(adjacency.get(edge.source)?.get(edge.target) || 0, edge.score));
    adjacency.get(edge.target)?.set(edge.source, Math.max(adjacency.get(edge.target)?.get(edge.source) || 0, edge.score));
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(nodes.map((node) => node.id));
  const clusters: TopicCluster[] = [];
  const maxMembersPerCluster = nodes.length > 12 ? 5 : 6;
  while (remaining.size > 0) {
    const seed = [...remaining]
      .map((id) => nodesById.get(id)!)
      .sort((left, right) => nodeImportance(right, degrees.get(right.id) || 0) - nodeImportance(left, degrees.get(left.id) || 0) || left.label.localeCompare(right.label, 'ko-KR'))[0];
    const memberIds = new Set<string>([seed.id]);
    const queue = [seed.id];
    remaining.delete(seed.id);
    while (queue.length > 0 && memberIds.size < maxMembersPerCluster) {
      const currentId = queue.shift()!;
      const neighbors = [...(adjacency.get(currentId)?.entries() || [])]
        .filter(([neighborId]) => remaining.has(neighborId))
        .sort(([leftId, leftScore], [rightId, rightScore]) => rightScore - leftScore || leftId.localeCompare(rightId));
      for (const [neighborId] of neighbors) {
        if (memberIds.size >= maxMembersPerCluster) break;
        remaining.delete(neighborId);
        memberIds.add(neighborId);
        queue.push(neighborId);
      }
    }
    const root = [...memberIds]
      .map((id) => nodesById.get(id)!)
      .sort((left, right) => nodeImportance(right, degrees.get(right.id) || 0) - nodeImportance(left, degrees.get(left.id) || 0) || left.label.localeCompare(right.label, 'ko-KR'))[0];
    clusters.push({ id: `cluster:${root.id}`, rootId: root.id, rootLabel: root.label, memberIds, color: CLUSTER_PALETTE[0] });
  }

  clusters.sort((left, right) => right.memberIds.size - left.memberIds.size || left.rootLabel.localeCompare(right.rootLabel, 'ko-KR'));
  clusters.forEach((cluster, index) => { cluster.color = CLUSTER_PALETTE[index % CLUSTER_PALETTE.length]; });
  const clusterByNode = new Map<string, TopicCluster>();
  for (const cluster of clusters) for (const nodeId of cluster.memberIds) clusterByNode.set(nodeId, cluster);

  const positions = new Map<string, MapPoint>();
  const fixedRootIds = new Set<string>();
  const clusterCenterById = new Map<string, MapPoint>();
  const clusterRadiusById = new Map<string, number>();
  const clusterGeometry = clusters.map((cluster) => {
    const rootNode = nodesById.get(cluster.rootId)!;
    const weight = Math.max(1, cluster.memberIds.size);
    const radius = weight === 1
      ? nodeRadius(rootNode, degrees.get(rootNode.id) || 0) + 14
      : Math.max(94, Math.min(112, 56 + Math.sqrt(weight) * 23));
    return { cluster, radius };
  });
  const columnCount = clusterGeometry.length <= 2 ? clusterGeometry.length : Math.ceil(Math.sqrt(clusterGeometry.length * 1.5));
  const rowCount = Math.ceil(clusterGeometry.length / Math.max(1, columnCount));
  const insetX = 76;
  const insetY = 32;

  clusterGeometry.forEach(({ cluster, radius: desiredRadius }, clusterIndex) => {
    const row = Math.floor(clusterIndex / Math.max(1, columnCount));
    const rowStart = row * columnCount;
    const membersInRow = Math.min(columnCount, clusterGeometry.length - rowStart);
    const column = clusterIndex - rowStart;
    const clusterCenter = {
      x: membersInRow === 1 ? center.x : insetX + ((width - insetX * 2) * (column + 0.5)) / membersInRow,
      y: rowCount === 1 ? center.y : insetY + ((height - insetY * 2) * (row + 0.5)) / rowCount,
    };
    const angle = row % 2 === 0 ? -Math.PI / 2 : Math.PI / 2;
    clusterCenterById.set(cluster.id, clusterCenter);
    clusterRadiusById.set(cluster.id, desiredRadius);
    positions.set(cluster.rootId, clusterCenter);
    fixedRootIds.add(cluster.rootId);

    const placed = new Set<string>([cluster.rootId]);
    const queue: Array<{ id: string; depth: number; angle: number; span: number }> = [{ id: cluster.rootId, depth: 0, angle, span: Math.PI * 1.16 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = [...(adjacency.get(current.id)?.entries() || [])]
        .filter(([id]) => cluster.memberIds.has(id) && !placed.has(id))
        .sort(([leftId, leftScore], [rightId, rightScore]) => rightScore - leftScore || leftId.localeCompare(rightId));
      if (children.length === 0) continue;
      const currentPoint = positions.get(current.id)!;
      const childSpan = children.length === 1 ? 0 : current.depth === 0 ? Math.min(Math.PI * 1.95, Math.PI + children.length * 0.34) : Math.min(Math.PI * 1.04, Math.max(Math.PI / 7, current.span * 0.76));
      const startAngle = current.angle - childSpan * (children.length - 1) / 2;
      children.forEach(([childId], index) => {
        const childAngle = startAngle + childSpan * index;
        const distance = current.depth === 0 ? Math.min(106, Math.max(76, desiredRadius * 0.76)) : Math.min(76, Math.max(52, desiredRadius * 0.54));
        const rawPoint = { x: currentPoint.x + Math.cos(childAngle) * distance, y: currentPoint.y + Math.sin(childAngle) * distance };
        const dx = rawPoint.x - clusterCenter.x;
        const dy = rawPoint.y - clusterCenter.y;
        const localDistance = Math.hypot(dx, dy);
        const localLimit = Math.max(20, desiredRadius - nodeRadius(nodesById.get(childId)!, degrees.get(childId) || 0) - 6);
        const point = localDistance > localLimit ? { x: clusterCenter.x + dx * localLimit / localDistance, y: clusterCenter.y + dy * localLimit / localDistance } : rawPoint;
        positions.set(childId, point);
        placed.add(childId);
        queue.push({ id: childId, depth: current.depth + 1, angle: childAngle, span: Math.max(Math.PI / 12, childSpan / Math.max(1, children.length)) });
      });
    }
  });

  const points = nodes.map((node) => ({ ...positions.get(node.id)! }));
  for (let iteration = 0; iteration < 460; iteration += 1) {
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
        const requiredDistance = nodeRadius(leftNode, degrees.get(leftNode.id) || 0) + nodeRadius(rightNode, degrees.get(rightNode.id) || 0) + 20;
        if (distance >= requiredDistance) continue;
        const angle = distance > 0.01 ? Math.atan2(dy, dx) : (leftIndex + 1) * 1.618;
        const push = Math.min(12, (requiredDistance - distance) / 2 + 0.6);
        const leftIsFixed = fixedRootIds.has(leftNode.id);
        const rightIsFixed = fixedRootIds.has(rightNode.id);
        if (!leftIsFixed) { left.x -= Math.cos(angle) * (rightIsFixed ? push * 2 : push); left.y -= Math.sin(angle) * (rightIsFixed ? push * 2 : push); }
        if (!rightIsFixed) { right.x += Math.cos(angle) * (leftIsFixed ? push * 2 : push); right.y += Math.sin(angle) * (leftIsFixed ? push * 2 : push); }
        moved += push;
      }
    }
    for (let index = 0; index < points.length; index += 1) {
      const node = nodes[index];
      const cluster = clusterByNode.get(node.id)!;
      const clusterCenter = clusterCenterById.get(cluster.id)!;
      const clusterRadius = clusterRadiusById.get(cluster.id)!;
      const dx = points[index].x - clusterCenter.x;
      const dy = points[index].y - clusterCenter.y;
      const distance = Math.hypot(dx, dy);
      const localLimit = Math.max(18, clusterRadius - nodeRadius(node, degrees.get(node.id) || 0) - 6);
      if (distance > localLimit && distance > 0) Object.assign(points[index], { x: clusterCenter.x + dx * localLimit / distance, y: clusterCenter.y + dy * localLimit / distance });
      const padding = nodeRadius(node, degrees.get(node.id) || 0) + 12;
      points[index].x = Math.max(padding, Math.min(width - padding, points[index].x));
      points[index].y = Math.max(padding, Math.min(height - padding, points[index].y));
    }
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
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showIsolated, setShowIsolated] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<MapPoint>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ pointerId: number; clientX: number; clientY: number; pan: MapPoint } | null>(null);
  const dragMovedRef = useRef(false);
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

  const width = 980;
  const height = 620;
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
  const hasHighlightedNodes = highlighted.size > 0 || evidenceRelatedNodeIds.size > 0;
  const selectedNodeId = nodes.find((node) => node.candidates.some((candidate) => candidate.id === selectedId))?.id || null;
  const connectionFocusId = hoveredNodeId || selectedNodeId;
  const focusNeighborIds = useMemo(() => {
    if (!connectionFocusId) return new Set<string>();
    const related = new Set<string>([connectionFocusId]);
    for (const edge of edges) {
      if (edge.source === connectionFocusId) related.add(edge.target);
      if (edge.target === connectionFocusId) related.add(edge.source);
    }
    return related;
  }, [connectionFocusId, edges]);
  const visibleNodes = showIsolated ? nodes : nodes.filter((node) => (degrees.get(node.id) || 0) > 0);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): MapPoint | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const screenX = ((event.clientX - rect.left) / rect.width) * width;
    const screenY = ((event.clientY - rect.top) / rect.height) * height;
    return { x: (screenX - width / 2 - pan.x) / zoom + width / 2, y: (screenY - height / 2 - pan.y) / zoom + height / 2 };
  };

  const handleClearClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
    if (!hasHighlightedNodes || !onClearHighlights) return;
    if (event.target === event.currentTarget || event.target instanceof SVGCircleElement) onClearHighlights();
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-graph-node]')) return;
    dragMovedRef.current = false;
    setDragStart({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, pan });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (point) setPointer(point);
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - dragStart.clientX) / rect.width) * width;
    const dy = ((event.clientY - dragStart.clientY) / rect.height) * height;
    if (Math.hypot(dx, dy) > 3) dragMovedRef.current = true;
    setPan({ x: dragStart.pan.x + dx, y: dragStart.pan.y + dy });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragStart?.pointerId === event.pointerId) setDragStart(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleGraphKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const step = event.shiftKey ? 64 : 26;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom((value) => Math.min(2.4, value + 0.15)); return; }
    if (event.key === '-') { event.preventDefault(); setZoom((value) => Math.max(0.62, value - 0.15)); return; }
    const direction = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] } as const;
    if (event.key in direction) {
      event.preventDefault();
      const [x, y] = direction[event.key as keyof typeof direction];
      setPan((current) => ({ x: current.x + x, y: current.y + y }));
    }
  };

  const resetGraphView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowLabels(true);
    setShowIsolated(true);
  };

  return (
    <section className="brain-card overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/5 text-blue-200"><Network className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-200">Cognitive graph</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-950">관심 그래프</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">색상 원은 관심 주제이고, 선은 함께 살펴본 기록에서 확인한 연결입니다.</p>
          </div>
        </div>
        <div className="aether-map-tab-shell inline-flex rounded-xl border p-1" aria-label="지도 보기 범위">
          {([['all', '전체'], ['pending', '연결 검토'], ['confirmed', '지도에 반영됨']] as const).map(([key, label]) => (
            <button type="button" key={key} onClick={() => setView(key)} aria-pressed={view === key} className={`aether-map-tab min-h-9 rounded-lg px-3 text-xs font-bold transition ${view === key ? 'aether-map-tab-active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="aether-map-stage relative min-h-[585px] overflow-hidden p-3 md:p-5">
        {nodes.length === 0 ? (
          <div className="flex min-h-[410px] flex-col items-center justify-center px-5 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-blue-50 text-blue-600"><CircleDot className="h-7 w-7" aria-hidden="true" /></div>
            <h3 className="mt-5 text-base font-extrabold text-slate-800">아직 지도에 놓을 패턴이 없습니다.</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Chrome 기록을 분석하면 반복 관심과 탐색 흐름의 연결이 이곳에 나타납니다.</p>
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute left-6 top-6 z-10 hidden rounded-xl border border-white/10 bg-slate-950/72 px-3 py-2 text-[11px] text-slate-300 backdrop-blur md:block">
              <p className="font-semibold text-slate-100">{visibleNodes.length}개 관심 · {visibleEdges.length}개 연결</p>
              <p className="mt-0.5 text-slate-400">호버하면 연결이 드러납니다.</p>
            </div>
            <div className="absolute right-5 top-5 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1.5 shadow-xl shadow-black/20 backdrop-blur">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.62, value - 0.15))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" aria-label="그래프 축소"><Minus className="h-4 w-4" aria-hidden="true" /></button>
              <span className="min-w-10 text-center text-[11px] font-bold tabular-nums text-slate-300" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(2.4, value + 0.15))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" aria-label="그래프 확대"><Plus className="h-4 w-4" aria-hidden="true" /></button>
              <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden="true" />
              <button type="button" onClick={() => setShowSettings((value) => !value)} className={`grid h-9 w-9 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${showSettings ? 'bg-white/12 text-white' : 'text-slate-200 hover:bg-white/10'}`} aria-label="그래프 표시 설정" aria-expanded={showSettings}><Settings2 className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {showSettings && <aside className="absolute right-5 top-[4.75rem] z-20 w-60 rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-sm shadow-2xl shadow-black/35 backdrop-blur" aria-label="그래프 표시 설정">
              <div className="flex items-center justify-between gap-3"><div><p className="font-bold text-slate-100">표시 설정</p><p className="mt-0.5 text-[11px] leading-4 text-slate-400">보이는 요소만 조절합니다.</p></div><button type="button" onClick={() => setShowSettings(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" aria-label="표시 설정 닫기"><X className="h-4 w-4" aria-hidden="true" /></button></div>
              <div className="mt-4 space-y-3 border-y border-white/10 py-3">
                <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-xs text-slate-200"><span>노드 이름 표시</span><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} className="h-4 w-4 accent-violet-400" /></label>
                <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 text-xs text-slate-200"><span>미연결 관심 표시</span><input type="checkbox" checked={showIsolated} onChange={(event) => setShowIsolated(event.target.checked)} className="h-4 w-4 accent-violet-400" /></label>
              </div>
              <button type="button" onClick={resetGraphView} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />기본 보기로 되돌리기</button>
              <p className="mt-3 text-[10px] leading-4 text-slate-500">휠 또는 +/−로 확대하고, 빈 곳을 드래그하거나 방향키로 이동합니다.</p>
            </aside>}
            <svg viewBox={`0 0 ${width} ${height}`} className={`h-[560px] w-full touch-none outline-none ${dragStart ? 'cursor-grabbing' : 'cursor-grab'}`} role="img" tabIndex={0} aria-labelledby="map-title map-description" onClick={handleClearClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onPointerLeave={() => { setPointer(null); setHoveredNodeId(null); }} onKeyDown={handleGraphKeyDown} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.min(2.4, Math.max(0.62, value + (event.deltaY < 0 ? 0.12 : -0.12)))); }}>
              <title id="map-title">Amy Brain Map 관심과 연결 지도</title>
              <desc id="map-description">같은 주제를 이루는 관심 노드가 서로 이웃하도록 배치된 평면 그래프입니다. 작은 색상 원은 관심 주제이며, 선은 함께 살펴본 기록에서 확인한 연결입니다. 호버하면 해당 노드의 연결이 강조되고, 확대·축소와 이동이 가능합니다.</desc>
              <defs>
                <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#aab8d5" opacity=".16" /></pattern>
              </defs>
              <rect x="0" y="0" width={width} height={height} rx="26" fill="#070c14" />
              <rect x="0" y="0" width={width} height={height} rx="26" fill="url(#dotGrid)" opacity=".18" pointerEvents="none" />
              <g transform={`translate(${pan.x} ${pan.y}) translate(${width / 2} ${height / 2}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}>
                {pointer && !dragStart && <circle cx={pointer.x} cy={pointer.y} r="30" fill="none" stroke="#cbd5e1" strokeOpacity=".14" strokeWidth="1" pointerEvents="none" />}
                {visibleEdges.map((edge) => {
                  const source = positions.get(edge.source);
                  const target = positions.get(edge.target);
                  if (!source || !target) return null;
                  const isEvidenceActive = edge.candidateIds.includes(selectedId || '') || edge.candidateIds.some((id) => highlighted.has(id)) || evidenceRelatedNodeIds.has(edge.source) || evidenceRelatedNodeIds.has(edge.target);
                  const isConnectionActive = connectionFocusId === edge.source || connectionFocusId === edge.target;
                  const sourceCluster = clusterByNode.get(edge.source);
                  const targetCluster = clusterByNode.get(edge.target);
                  const clusterStroke = sourceCluster && sourceCluster === targetCluster ? sourceCluster.color.stroke : '#94a3b8';
                  const sourceSway = reedSway(source, pointer);
                  const targetSway = reedSway(target, pointer);
                  const isDimmed = (hasHighlightedNodes && !isEvidenceActive) || (connectionFocusId !== null && !isConnectionActive);
                  return <line key={edge.id} x1={source.x + sourceSway.x} y1={source.y + sourceSway.y} x2={target.x + targetSway.x} y2={target.y + targetSway.y} stroke={isEvidenceActive ? '#6ee7ff' : isConnectionActive ? '#d8e4ff' : clusterStroke} strokeOpacity={isEvidenceActive ? .95 : isConnectionActive ? .94 : isDimmed ? .07 : .25} strokeWidth={isEvidenceActive ? 2.5 : isConnectionActive ? 1.8 : Math.max(.65, edge.score * .92)} />;
                })}
                {visibleNodes.map((node) => {
                  const point = positions.get(node.id)!;
                  const candidate = node.candidates[0];
                  const isSelected = node.candidates.some((item) => item.id === selectedId);
                  const isHighlighted = evidenceRelatedNodeIds.has(node.id) || node.candidates.some((item) => highlighted.has(item.id));
                  const isConnectionFocused = focusNeighborIds.has(node.id);
                  const isFocused = isSelected || isHighlighted || isConnectionFocused;
                  const isDimmed = (hasHighlightedNodes && !isHighlighted && !isSelected) || (connectionFocusId !== null && !isConnectionFocused);
                  const degree = degrees.get(node.id) || 0;
                  const cluster = clusterByNode.get(node.id);
                  const radius = Math.max(4.5, Math.min(13, nodeRadius(node, degree) * .32)) + (isHighlighted ? 1.7 : 0);
                  const color = isHighlighted ? '#6ee7ff' : cluster?.color.stroke || STATUS_STYLE[statusFor(node)].color;
                  const labelLimit = 18;
                  const label = node.label.length > labelLimit ? `${node.label.slice(0, labelLimit)}…` : node.label;
                  const sway = reedSway(point, pointer);
                  return (
                    <g key={node.id} data-graph-node="true" role="button" tabIndex={0} aria-label={`${node.label}, ${isHighlighted ? '현재 질문 관련 항목, ' : ''}${STATUS_STYLE[statusFor(node)].label}, 연결 ${degree}개. 상세 연결 검토 선택`} onPointerEnter={() => setHoveredNodeId(node.id)} onPointerLeave={() => setHoveredNodeId((current) => current === node.id ? null : current)} onClick={(event) => { event.stopPropagation(); if (isHighlighted && onClearHighlights) onClearHighlights(); else if (candidate) onSelect(candidate); }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); if (isHighlighted && onClearHighlights) onClearHighlights(); else if (candidate) onSelect(candidate); }} className="map-node-reed cursor-pointer outline-none" style={{ opacity: isDimmed ? 0.16 : 1, transformBox: 'fill-box', transformOrigin: 'center', transform: `translate(${sway.x}px, ${sway.y}px) scale(${sway.scale})`, transition: 'transform 190ms cubic-bezier(.2,.75,.25,1), opacity 180ms ease' }}>
                      {(isFocused || isHighlighted) && <circle cx={point.x} cy={point.y} r={radius + 4.5} fill="none" stroke={isHighlighted ? '#6ee7ff' : '#e5edff'} strokeOpacity={isHighlighted ? .9 : .65} strokeWidth="1.15" />}
                      <circle cx={point.x} cy={point.y} r={radius} fill={color} fillOpacity={isHighlighted ? 1 : .88} stroke={isSelected ? '#ffffff' : color} strokeOpacity={isSelected ? .95 : .45} strokeWidth={isSelected ? 1.5 : .7} />
                      {showLabels && <text x={point.x + radius + 6} y={point.y + 3.5} textAnchor="start" fill={isHighlighted ? '#bdf8ff' : isFocused ? '#f8fafc' : '#cbd5e1'} fillOpacity={isDimmed ? .22 : isFocused ? 1 : .76} fontSize="10" fontWeight={isFocused ? "650" : "500"} pointerEvents="none">{label}</text>}
                    </g>
                  );
                })}
              </g>
            </svg>
            {visibleEdges.length === 0 && <p className="pointer-events-none absolute bottom-7 left-1/2 w-full max-w-md -translate-x-1/2 px-6 text-center text-xs leading-5 text-slate-500">아직 함께 살펴본 흔적이 충분하지 않아 독립적으로 보입니다. 같은 페이지를 함께 살펴본 기록이 쌓이면 연결선이 나타납니다.</p>}
          </>
        )}
      </div>
    </section>
  );
}
