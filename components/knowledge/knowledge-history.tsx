'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Node, Edge } from 'reactflow';

interface KnowledgeDoc {
  id: string;
  title: string;
  type: 'pdf' | 'web' | 'image';
  tags: string[];
  createdAt: string;
  summary?: string;
  content?: string;
  url?: string;
}

interface KnowledgeHistoryProps {
  documents?: KnowledgeDoc[];
  onChange?: (docs: KnowledgeDoc[]) => void;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  pdf: { icon: '📄', label: 'PDF' },
  web: { icon: '🌐', label: '웹' },
  image: { icon: '🖼️', label: '이미지' },
};

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function KnowledgeModal({ doc, onClose }: { doc: KnowledgeDoc; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="bg-slate-900 rounded-xl border border-purple-500/30 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">{doc.title}</h2>
              <div className="text-gray-400 text-sm mt-1">{formatDate(doc.createdAt)} • {TYPE_CONFIG[doc.type]?.label || '웹'}</div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">✕</button>
          </div>
          <div className="flex flex-wrap gap-1 mb-4">
            {doc.tags.map(tag => (<span key={tag} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{tag}</span>))}
          </div>
          {doc.url && (<div className="mb-3"><a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline break-all">🔗 {doc.url}</a></div>)}
          <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm leading-relaxed bg-white/5 p-4 rounded-lg overflow-x-auto">{doc.content || doc.summary || '내용 없음'}</pre>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function KnowledgeHistory({ documents, onChange }: KnowledgeHistoryProps) {
  const [activeTab, setActiveTab] = useState<'date' | 'topic'>('date');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);

  const loadKnowledgeDocsAPI = useCallback(async () => {
    try {
      const response = await fetch('/api/knowledge');
      if (response.ok) {
        const data = await response.json();
        const sorted = (data.documents || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setKnowledgeDocs(sorted);
      }
    } catch (error) {
      console.error('Failed to load knowledge docs:', error);
    }
  }, []);

  const saveKnowledgeDocAPI = useCallback(async (doc: KnowledgeDoc) => {
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
      if (response.ok) {
        const data = await response.json();
        const updated = [data.document, ...knowledgeDocs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setKnowledgeDocs(updated);
        onChange?.(updated);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save knowledge doc:', error);
      return false;
    }
  }, [knowledgeDocs, onChange]);

  const deleteKnowledgeDocAPI = useCallback(async (docId: string) => {
    try {
      const response = await fetch(`/api/knowledge?id=${docId}`, { method: 'DELETE' });
      if (response.ok) {
        const updated = knowledgeDocs.filter(doc => doc.id !== docId);
        setKnowledgeDocs(updated);
        onChange?.(updated);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete knowledge doc:', error);
      return false;
    }
  }, [knowledgeDocs, onChange]);

  useEffect(() => { loadKnowledgeDocsAPI(); }, [loadKnowledgeDocsAPI]);

  const docs = useMemo(() => {
    if (documents && documents.length > 0) return documents;
    return [...knowledgeDocs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [documents, knowledgeDocs]);

  const byDate = useMemo(() => {
    const grouped = new Map<string, KnowledgeDoc[]>();
    docs.forEach(doc => {
      const key = formatDate(doc.createdAt);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(doc);
    });
    return grouped;
  }, [docs]);

  const byTopic = useMemo(() => {
    return selectedTag ? docs.filter(doc => doc.tags.includes(selectedTag)) : docs;
  }, [docs, selectedTag]);

  const handleAddKnowledge = async () => {
    if (!urlInput.trim()) return;
    setIsProcessing(true);
    const newDoc: KnowledgeDoc = {
      id: `doc-${Date.now()}`, title: '', type: 'web', tags: [],
      createdAt: new Date().toISOString(), url: urlInput,
    };
    try {
      const success = await saveKnowledgeDocAPI(newDoc);
      if (success) { setUrlInput(''); setIsAdding(false); }
      else { alert('지식 저장에 실패했습니다.'); }
    } finally { setIsProcessing(false); }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (confirm('정말 삭제하시겠습니까?')) { await deleteKnowledgeDocAPI(docId); }
  };

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    docs.forEach(doc => {
      doc.tags.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; });
    });
    return counts;
  }, [docs]);

  return (
    <>
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-purple-500/20 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <span className="text-lg">🗄️</span>
            <span className="text-white font-bold text-sm">지식 보관소</span>
            <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">{docs.length}개</span>
          </div>
          <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
            {(['date', 'topic'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${activeTab === tab ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>
                {tab === 'date' ? '📅 날짜별' : '🏷️ 주제별'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-purple-500/20">
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 mb-2 text-purple-400 text-xs animate-pulse">
              <span>⏳</span>
              <span>LLM 처리 중...</span>
            </div>
          )}

          <button onClick={() => setIsAdding(!isAdding)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 rounded-lg text-purple-200 text-xs font-medium transition-all">
            <span>➕</span><span>{isAdding ? '취소' : '지식 추가'}</span>
          </button>

          {isAdding && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 space-y-2">
              <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                placeholder="URL을 입력하세요"
                className="w-full px-3 py-2 bg-white/5 border border-purple-500/30 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-all" />
              <div className="flex gap-2">
                <button onClick={handleAddKnowledge} disabled={isProcessing}
                  className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {isProcessing ? '처리 중...' : '추가하기'}
                </button>
                <button onClick={() => { setUrlInput(''); setIsAdding(false); }}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-all">취소</button>
              </div>
            </motion.div>
          )}
        </div>

        <div className="p-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          {activeTab === 'date' && (
            <div className="space-y-3">
              {Array.from(byDate.entries()).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <div className="h-px bg-gray-700 flex-1" /><span>{dateLabel}</span><div className="h-px bg-gray-700 flex-1" />
                  </div>
                  {items.map(doc => (
                    <DocItem key={doc.id} doc={doc} onSelect={() => setSelectedDoc(doc)} onDelete={() => handleDeleteDoc(doc.id)} />
                  ))}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'topic' && (
            <div>
              <div className="flex flex-wrap gap-1 mb-3">
                <button onClick={() => setSelectedTag(null)}
                  className={`px-2 py-0.5 rounded-full text-[10px] transition-all border ${!selectedTag ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>전체</button>
                {Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                  <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`px-2 py-0.5 rounded-full text-[10px] transition-all border ${selectedTag === tag ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                    {tag} <span className="opacity-60">{count}</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {byTopic.map(doc => (
                  <DocItem key={doc.id} doc={doc} onSelect={() => setSelectedDoc(doc)} onDelete={() => handleDeleteDoc(doc.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>{selectedDoc && <KnowledgeModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}</AnimatePresence>
    </>
  );
}

function DocItem({ doc, onSelect, onDelete }: { doc: KnowledgeDoc; onSelect: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-lg border transition-all cursor-pointer bg-green-500/20 border-green-500/40 text-green-300 hover:brightness-125 hover:bg-white/10 group mb-1" onClick={onSelect}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className="text-sm">🌐</span>
        <div className="flex-1 min-w-0">
          <div className="text-white text-xs font-medium truncate">{doc.title}</div>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {doc.tags.map(tag => (<span key={tag} className="text-[9px] bg-white/10 rounded px-1 text-gray-300">{tag}</span>))}
          </div>
        </div>
        <span className="text-gray-500 text-[9px] whitespace-nowrap">{formatDate(doc.createdAt)}</span>
        <span className="text-purple-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}>🗑️</span>
      </div>
    </div>
  );
}

// 노드를 지식 그래프 형태로 변환하는 헬퍼 함수
export function docsToGraph(docs: KnowledgeDoc[]) {
  return docs.map((doc, idx) => ({
    id: doc.id,
    position: { x: (idx % 5) * 180 - 360, y: Math.floor(idx / 5) * 120 - 120 },
    data: {
      label: doc.title || 'Untitled',
      type: doc.type,
      metadata: {
        title: doc.title,
        type: doc.type,
        tags: doc.tags,
        createdAt: doc.createdAt,
        url: doc.url,
      },
    },
    style: {
      width: 10,
      height: 10,
      background: doc.type === 'pdf' ? 'radial-gradient(circle, #60a5fadd, #60a5fa99)' :
                  doc.type === 'image' ? 'radial-gradient(circle, #fbbf24dd, #fbbf2499)' :
                  'radial-gradient(circle, #34d399dd, #34d39999)',
      border: 'none',
      borderRadius: '50%',
      boxShadow: doc.type === 'pdf' ? '0 0 10px #60a5fa88' :
                 doc.type === 'image' ? '0 0 10px #fbbf2488' :
                 '0 0 10px #34d39988',
    },
  })) as Node[];
}

export function buildEdges(nodes: Node[]): Edge[] {
  const edges: Edge[] = [];
  let edgeId = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const tagsA = (nodes[i].data?.metadata as { tags?: string[] })?.tags || [];
      const tagsB = (nodes[j].data?.metadata as { tags?: string[] })?.tags || [];
      const sharedTags = tagsA.filter(tag => tagsB.includes(tag));
      const typeMatch = (nodes[i].data?.metadata as { type?: string })?.type === (nodes[j].data?.metadata as { type?: string })?.type ? 1 : 0;
      const strength = sharedTags.length + typeMatch;
      if (strength > 0) {
        edges.push({
          id: `edge-${edgeId++}`,
          source: nodes[i].id,
          target: nodes[j].id,
          data: { strength },
          style: {
            stroke: `rgba(139, 92, 246, ${0.3 + strength * 0.1})`,
            strokeWidth: 0.5 + strength * 0.2,
          },
          type: 'straight',
        });
      }
    }
  }
  return edges;
}