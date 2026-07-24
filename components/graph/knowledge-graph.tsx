'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeProps,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface KnowledgeGraphProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
}

const PALETTE = ['#f87171', '#60a5fa', '#a78bfa', '#fb923c', '#34d399', '#facc15', '#f472b6', '#22d3ee'];

function topicHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function resolveColor(type?: string, title = '', index = 0): string {
  if (type === 'pdf') return '#60a5fa';
  if (type === 'image') return '#fb923c';
  if (type) return PALETTE[topicHash(type) % PALETTE.length];
  return PALETTE[topicHash(title) % PALETTE.length];
}

// ── Entity Node ───────────────────────────────────────────────────
function EntityNode({ data, selected }: NodeProps) {
  const title = ((data?.metadata as any)?.title || data?.label || 'Untitled') + '';
  const summary = ((data?.metadata as any)?.summary || '') + '';
  const createdAt = ((data?.metadata as any)?.createdAt || '') + '';
  const color = resolveColor(((data?.metadata as any)?.topic || data?.type || 'default') + '', title, 0);
  const tags = ((data?.metadata as any)?.tags || []) as string[];
  const keyword = tags.find(k => k && k !== 'web') || title.split(' ')[0];
  const shortLabel = keyword.length > 10 ? keyword.slice(0, 10) + '…' : keyword;

  return (
    <div className="relative flex items-center justify-center">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div
        className="absolute whitespace-nowrap text-[8px] font-semibold tracking-wide pointer-events-none"
        style={{
          bottom: 'calc(100% + 3px)',
          left: '50%',
          transform: 'translateX(-50%)',
          color: selected ? '#f1f5f9' : '#cbd5e1',
          textShadow: '0 0 6px rgba(0,0,0,0.95)',
        }}
      >
        {shortLabel}
      </div>

      <motion.div
        className="rounded-full flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}66)`,
          boxShadow: `0 0 8px ${color}88`,
          cursor: 'pointer',
        }}
        animate={selected ? { scale: [1, 1.06, 1] } : {}}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        title={`${title} | ${createdAt}`.trim()}
      />
    </div>
  );
}

// ── Animated Edge ──────────────────────────────────────────────────
function RelationshipEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  style?: React.CSSProperties;
}) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: sourceX,
        top: sourceY,
        width: length,
        height: 1.2,
        transformOrigin: '0 50%',
        transform: `rotate(${angle}deg)`,
        opacity: 0.4,
        ...style,
      }}
    >
      <motion.div
        className="w-full h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, transparent, ${(style?.stroke as string) || 'rgba(148,163,184,0.4)'}, transparent)`,
          boxShadow: `0 0 6px ${(style?.stroke as string) || 'rgba(148,163,184,0.2)'}`,
        }}
        animate={{
          opacity: [0.15, 0.6, 0.15],
          scaleX: [0.95, 1.05, 0.95],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

// ── Summary Panel ──────────────────────────────────────────────────
function SummaryPanel({ nodes, edges, onClose }: { nodes: Node[]; edges: Edge[]; onClose: () => void }) {
  const typeStats = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n) => {
      const t = (n.data?.metadata as any)?.topic || n.data?.type || 'unknown';
      map.set(t, (map.get(t) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const relationshipStats = useMemo(() => {
    const map = new Map<string, number>();
    edges.forEach((e) => {
      const rel = ((e.data as any)?.relationshipName as string) || 'RELATED_TO';
      map.set(rel, (map.get(rel) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [edges]);

  return (
    <motion.div
      className="absolute right-4 top-4 z-20 w-64 max-h-[520px] overflow-y-auto rounded-xl p-4"
      style={{
        background: 'linear-gradient(180deg, rgba(15,15,25,0.95), rgba(10,10,20,0.95))',
        border: '1px solid rgba(148,163,184,0.1)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-slate-200 text-xs font-bold tracking-wide">ENTITY GRAPH</div>
          <div className="text-[10px] text-slate-500">Knowledge graph summary</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded-md hover:bg-slate-800/50 transition-colors">✕</button>
      </div>

      <div className="mb-3">
        <div className="text-[10px] text-slate-500 mb-1.5">Entity 분포</div>
        <div className="space-y-1.5">
          {typeStats.map(([type, count], i) => {
            const color = resolveColor(type, '', i);
            return (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
                  <div className="text-[10px] text-slate-400 truncate">{type}</div>
                </div>
                <div className="text-[10px] text-slate-500">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[10px] text-slate-500 mb-1.5">주요 관계</div>
        <div className="space-y-1.5">
          {relationshipStats.map(([rel, count], i) => (
            <div key={rel} className="text-[10px] text-slate-500 flex items-center justify-between">
              <span className="text-slate-400">{rel}</span>
              <span className="text-slate-500">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-slate-700/40">
        <div className="text-[10px] text-slate-500 leading-relaxed">
          총 {nodes.length}개 노드, {edges.length}개 연결
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          Entity 간 관계가 시각화되어 있습니다.
        </div>
      </div>
    </motion.div>
  );
}

// ── Knowledge Detail Modal ─────────────────────────────────────────
function KnowledgeDetailModal({ node, onClose }: { node: Node; onClose: () => void }) {
  const metadata = node.data?.metadata as any;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="max-w-md w-full max-h-[80vh] overflow-y-auto rounded-xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(15, 15, 25, 0.98), rgba(10, 10, 20, 0.98))',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${resolveColor(metadata?.topic, metadata?.name, 0)}aa, ${resolveColor(metadata?.topic, metadata?.name, 0)}44)`,
            }}
          >
            📦
          </div>
          <div>
          <h3 className="text-slate-100 font-bold text-sm">{metadata?.title || node.data?.label || 'Untitled'}</h3>
            <span className="text-[10px] text-slate-400">{metadata?.topic || node.data?.type || 'Knowledge'}</span>
          </div>
        </div>

        {metadata?.description && (
          <div className="mb-3">
            <span className="text-[10px] text-slate-500 mb-1 block">설명</span>
            <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">
              {metadata.description}
            </p>
          </div>
        )}

        {metadata?.properties && Object.keys(metadata.properties).length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] text-slate-500 mb-1.5 block">속성</span>
            <div className="space-y-1">
              {Object.entries(metadata.properties).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-20 flex-shrink-0">{key}</span>
                  <span className="text-[10px] text-slate-300">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {metadata?.tags && metadata.tags.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] text-slate-500 mb-1 block">태그</span>
            <div className="flex flex-wrap gap-1">
              {(metadata.tags as string[]).map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-300 border border-slate-600/30">
                  #{String(tag).replace(/^#/, '')}
                </span>
              ))}
            </div>
          </div>
        )}

        {metadata?.createdAt && (
          <div className="text-[10px] text-slate-500 mb-2">
            생성일: {metadata.createdAt}
          </div>
        )}

        {metadata?.url && (
          <div className="text-[10px] text-sky-400/80 mb-2 break-all">
            <a href={metadata.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-300 transition-colors">
              🔗 {metadata.url}
            </a>
          </div>
        )}

        {metadata?.content && (
          <div className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">
            {metadata.content}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 px-4 py-1.5 rounded-full bg-slate-700/40 text-slate-200 text-[11px] hover:bg-slate-600/40 transition-all border border-slate-600/30"
        >
          닫기
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Layout: force-directed ─────────────────────────────────────────
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const positions = new Map<string, { x: number; y: number }>();

  nodes.forEach((node, i) => {
    const angle = (i * Math.PI * 2) / nodes.length;
    positions.set(node.id, {
      x: 300 + Math.cos(angle) * 160,
      y: 220 + Math.sin(angle) * 160,
    });
  });

  for (let iter = 0; iter < 60; iter++) {
    const forces = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => forces.set(n.id, { x: 0, y: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id)!;
        const b = positions.get(nodes[j].id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 2500 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces.set(nodes[i].id, { x: forces.get(nodes[i].id)!.x - fx, y: forces.get(nodes[i].id)!.y - fy });
        forces.set(nodes[j].id, { x: forces.get(nodes[j].id)!.x + fx, y: forces.get(nodes[j].id)!.y + fy });
      }
    }

    edges.forEach((edge) => {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 120) * 0.04;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      forces.set(edge.source, { x: forces.get(edge.source)!.x + fx, y: forces.get(edge.source)!.y + fy });
      forces.set(edge.target, { x: forces.get(edge.target)!.x - fx, y: forces.get(edge.target)!.y - fy });
    });

    positions.forEach((pos, id) => {
      const f = forces.get(id)!;
      pos.x += f.x * 0.08 + (300 - pos.x) * 0.005;
      pos.y += f.y * 0.08 + (220 - pos.y) * 0.005;
    });
  }

  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) || node.position,
  }));
}

// ── Main ──────────────────────────────────────────────────────────
export default function KnowledgeGraph({ nodes: propNodes, edges: propEdges, onNodeClick }: KnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const findKnowledgeContent = async (nodeId: string, docId: string) => {
    try {
      const response = await fetch(`/api/knowledge?id=${docId}`);
      if (response.ok) {
        const data = await response.json();
        return data.documents?.find((d: { id: string }) => d.id === docId);
      }
    } catch (error) {
      console.error('Failed to load knowledge content:', error);
    }
    return null;
  };

  const nodeTypes = useMemo(() => ({ entityNode: EntityNode }), []);
  const edgeTypes = useMemo(() => ({ relationshipEdge: RelationshipEdge as any }), []);

  useEffect(() => {
    const positioned = layoutNodes(propNodes, propEdges);
    const withIdx = positioned.map((node, idx) => ({
      ...node,
      data: { ...node.data, metadata: { ...(node.data?.metadata || {}), idx } },
      type: 'entityNode',
    }));
    setNodes(withIdx);
    setEdges(propEdges);
  }, [propNodes, propEdges, setNodes]);

  const onNodeClickHandler = useCallback(
    async (event: React.MouseEvent, node: Node) => {
      const metadata = node.data?.metadata as { id?: string; content?: string } | undefined;
      let content = metadata?.content;
      if (!content && metadata?.id) {
        const doc = await findKnowledgeContent(node.id, metadata.id);
        if (doc) content = doc.content;
      }
      setSelectedNode({ ...node, data: { ...node.data, metadata: { ...metadata, content } } } as Node);
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  return (
    <div className="relative w-full h-[550px] rounded-xl overflow-hidden bg-[#0a0a0f]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClickHandler}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.5}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'relationshipEdge',
          style: { stroke: 'rgba(148, 163, 184, 0.25)', strokeWidth: 1 },
          animated: true,
        }}
        connectionLineStyle={{ stroke: 'rgba(148, 163, 184, 0.1)', strokeWidth: 1 }}
      >
        <Background color="rgba(148, 163, 184, 0.03)" gap={35} size={0.4} />
        <Controls
          style={{
            backgroundColor: 'rgba(15, 15, 25, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '6px',
            color: '#cbd5e1',
          }}
        />
        <MiniMap
          style={{
            backgroundColor: 'rgba(15, 15, 25, 0.9)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            borderRadius: '6px',
          }}
          maskColor="rgba(0, 0, 0, 0.6)"
          nodeColor={(node) => resolveColor(node.data?.type as string, (node.data?.metadata as { entityType?: string; title?: string })?.entityType || (node.data?.metadata as { title?: string })?.title || '', (node.data?.metadata as { idx?: number })?.idx ?? 0)}
          nodeStrokeWidth={1}
        />
      </ReactFlow>

      <motion.button
        className="absolute right-4 top-4 z-20 px-3 py-1.5 rounded-lg text-[10px] font-semibold tracking-wide bg-slate-900/80 text-slate-300 border border-slate-700/50 hover:bg-slate-800/80 transition-colors"
        onClick={() => setShowSummary((v) => !v)}
      >
        {showSummary ? '요약 닫기' : '요약 열기'}
      </motion.button>

      <AnimatePresence>
        {showSummary && (
          <SummaryPanel nodes={nodes} edges={edges} onClose={() => setShowSummary(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedNode && selectedNode.data?.metadata ? (
          <KnowledgeDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}