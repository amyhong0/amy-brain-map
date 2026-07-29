'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import WizardTower from '@/components/agents/wizard-tower';
import KnowledgeGraph from '@/components/graph/knowledge-graph';
import ChatInterface, { Message } from '@/components/chat/chat-interface';
import KnowledgeHistory from '@/components/knowledge/knowledge-history';
import { AgentState } from '@/lib/agents/types';
import { Node, Edge } from 'reactflow';
import { Link, LayoutDashboard, Share2, Archive } from 'lucide-react';
import { ThinkingOrb } from '@/components/ThinkingOrb';

type Tab = 'dashboard' | 'graph' | 'history';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard size={14}/> },
  { id: 'graph',     label: '지식 그래프', icon: <Share2 size={14}/> },
  { id: 'history',   label: '지식 보관소', icon: <Archive size={14}/> },
];

const BASE_AGENTS: AgentState[] = [
  { id: 'orchestrator',  name: '대마법사',  role: 'Central Control',   emoji: '🧙‍♂️', status: 'idle', position: { x: 50, y: 10 }, floor: 5 },
  { id: 'text_agent',      name: '룬 마스터',       role: 'Knowledge Analysis', emoji: '🔮',  status: 'idle', position: { x: 50, y: 20 }, floor: 4 },
  { id: 'vision_agent',   name: '일루셔니스트',      role: 'Data Discovery',    emoji: '⚗️',  status: 'idle', position: { x: 50, y: 30 }, floor: 3 },
  { id: 'debug',     name: '정령사',      role: 'Bug Hunter',        emoji: '🦹',  status: 'idle', position: { x: 50, y: 80 }, floor: 0 },
  { id: 'storage_agent',   name: '기록가',     role: 'Data Storage',      emoji: '📚',  status: 'idle', position: { x: 50, y: 90 }, floor: 1 },
];

interface SpellLog {
  id: number;
  time: string;
  spell: string;
  type: 'success' | 'warning';
  zoneId: string;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'system',
  content: '안녕하세요! Amy\'s Brain Office에 오신 것을 환영합니다. 🧙‍♂️\n저장된 지식을 검색하거나 문서를 추가해보세요!',
  timestamp: new Date('2024-01-01T00:00:00'),
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [agents, setAgents] = useState<AgentState[]>(BASE_AGENTS);
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  const [graphEdges, setGraphEdges] = useState<Edge[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDoc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState('');
  const [error, setError] = useState('');
  const [spellLogs, setSpellLogs] = useState<SpellLog[]>([]);
  const spellLogIdRef = useRef(0);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedLogs = localStorage.getItem('spellLogs');
    if (savedLogs) {
      try { setSpellLogs(JSON.parse(savedLogs)); } catch (e) {}
    }
    const savedLogId = localStorage.getItem('spellLogId');
    if (savedLogId) {
      try { spellLogIdRef.current = parseInt(savedLogId, 10); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('spellLogs', JSON.stringify(spellLogs));
    localStorage.setItem('spellLogId', spellLogIdRef.current.toString());
  }, [spellLogs]);

  type KnowledgeDoc = {
    id: string;
    title: string;
    type: 'pdf' | 'web' | 'image';
    tags: string[];
    createdAt: string;
    summary?: string;
    content?: string;
    url?: string;
  };

  const toTopic = (doc: KnowledgeDoc) => {
    const raw = (doc as any).metadata?.topic;
    if (raw && raw !== 'web') return raw;
    const fromTags = Array.isArray(doc.tags) ? doc.tags.find((t) => t && t !== 'web') : undefined;
    if (fromTags) return fromTags;
    const token = (doc.title || '').split(' ')[0];
    return token || 'topic';
  };

  const toLabel = (doc: KnowledgeDoc) => {
    const kw = Array.isArray(doc.tags) ? doc.tags.find((t) => t && t !== 'web') : undefined;
    if (kw) return kw;
    const token = (doc.title || '').split(' ')[0];
    return token || 'Untitled';
  };

  // 임베딩 코사인 유사도 계산 함수
  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  function parseEmbeddings(meta: any): number[][] {
    try {
      const raw = meta?.kwEmbeddings;
      if (!raw || typeof raw !== 'string') return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((e: any) => Array.isArray(e) && e.length > 0)) return parsed;
      return [];
    } catch { return []; }
  }

  const rebuildGraph = useCallback((docs: KnowledgeDoc[]) => {
    const nodes = docs.map((doc, idx) => ({
      id: doc.id,
      position: { x: (idx % 5) * 180 - 360, y: Math.floor(idx / 5) * 120 - 120 },
      data: {
        label: toLabel(doc),
        type: doc.type,
        metadata: {
          title: doc.title,
          summary: doc.summary || doc.content,
          topic: toTopic(doc),
          tags: doc.tags,
          createdAt: doc.createdAt,
          url: doc.url,
          content: doc.content,
          kwEmbeddings: (doc as any).metadata?.kwEmbeddings,
        },
      },
    }));
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const metaA = nodes[i].data?.metadata as any;
        const metaB = nodes[j].data?.metadata as any;

        const embA = parseEmbeddings(metaA);
        const embB = parseEmbeddings(metaB);

        let strength = 0;
        if (embA.length > 0 && embB.length > 0) {
          for (const vA of embA) {
            for (const vB of embB) {
              const sim = cosineSimilarity(vA, vB);
              if (sim > 0.7) strength++;
            }
          }
        }

        // 벡터가 없으면 substring fallback
        if (strength === 0) {
          const keywordsA = [...(metaA?.tags || [])];
          const keywordsB = [...(metaB?.tags || [])];
          const pairs = new Set<string>();
          for (const kA of keywordsA) {
            for (const kB of keywordsB) {
              if (!kA || !kB) continue;
              const key = [kA, kB].sort().join('||');
              if (pairs.has(key)) continue;
              pairs.add(key);
              if (kA === kB || (kA.length > 1 && kB.length > 1 && (kB.includes(kA) || kA.includes(kB)))) {
                strength++;
              }
            }
          }
        }

        if (strength >= 1) {
          edges.push({
            id: `edge-${i}-${j}`,
            source: nodes[i].id,
            target: nodes[j].id,
            data: { strength },
            style: { stroke: `rgba(139, 92, 246, ${0.3 + strength * 0.15})`, strokeWidth: 0.6 + strength * 0.25 },
            type: 'straight',
          });
        }
      }
    }
    setGraphNodes(nodes);
    setGraphEdges(edges);
  }, [setGraphNodes, setGraphEdges]);

  useEffect(() => {
    if (knowledgeDocs.length > 0) rebuildGraph(knowledgeDocs);
  }, [knowledgeDocs, rebuildGraph]);

  useEffect(() => {
    fetch('/api/knowledge')
      .then(res => res.json())
      .then(data => {
        const sorted = (data.documents || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setKnowledgeDocs(sorted as KnowledgeDoc[]);
      })
      .catch(console.error);
  }, []);

  const addMessage = useCallback((msg: Message) => setMessages(prev => [...prev, msg]), []);
  const addSpellLog = useCallback((zoneId: string, agentName: string, spell: string, type: 'success' | 'warning') => {
    spellLogIdRef.current += 1;
    setSpellLogs(prev => [...prev.slice(-49), { id: spellLogIdRef.current, time: formatTime(new Date()), spell: `[${agentName}] ${spell}`, type, zoneId }]);
  }, []);

  const runAgentWorkflow = useCallback(async (message: string) => {
    const steps: Array<{ agentId: string; task: string; spellLog: string; delay: number }> = [
      { agentId: 'orchestrator', task: `사용자 메시지 분석: "${message.substring(0, 30)}..."`, spellLog: '에이전트 간 A2A 협력 프로토콜 시작', delay: 600 },
      { agentId: 'text_agent', task: '텍스트 분석 Agent 실행 (LLM)...', spellLog: 'A2A 텍스트 분석 에이전트가 본문/키워드/topic 추출 중', delay: 1000 },
      { agentId: 'vision_agent', task: '비전 분석 Agent 실행 (Vision)...', spellLog: 'A2A 비전 에이전트가 이미지/캐러셀/인포그래픽 분석 중', delay: 1000 },
      { agentId: 'orchestrator', task: 'A2A 병렬 결과 취합 및 응답 생성...', spellLog: '텍스트/비전 Agent 결과를 통합하여 최종 지식 생성', delay: 1200 },
      { agentId: 'storage_agent', task: '지식 저장 및 컨텍스트 기록...', spellLog: 'A2A 파싱 결과를 지식 보관소에 저장 완료', delay: 500 },
    ];
    return steps;
  }, []);

  const [isKnowledgeAdding, setIsKnowledgeAdding] = useState(false);

  const handleSendMessage = useCallback(async (text: string) => {
    setIsLoading(true);
    setError('');
    setCurrentTask('멀티 에이전트 워크플로우 시작...');
    setProgress(10);
    try {
      const workflowSteps = await runAgentWorkflow(text);
      for (const step of workflowSteps) {
        setCurrentTask(step.task);
        setAgents(prev => prev.map(a => a.id === step.agentId ? { ...a, status: 'working', currentTask: step.task } : a));
        const agent = agents.find(a => a.id === step.agentId);
        addSpellLog(step.agentId, agent?.name || step.agentId, step.spellLog, 'success');
        await new Promise(r => setTimeout(r, step.delay));
      }
      setProgress(50);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, knowledgeDocs }),
      });
      if (!response.ok) throw new Error('AI 응답을 가져오는데 실패했습니다');
      const data = await response.json();
      const replyContent = data.response;
      const cleanedReply = replyContent.replace(/\[참조:\s*[^\]]+\]/g, '').trim();
      const citedTitles: string[] = [];
      const citeRegex = /\[참조:\s*([^\]]+)\]/g;
      let citeMatch;
      while ((citeMatch = citeRegex.exec(replyContent)) !== null) citedTitles.push(citeMatch[1].trim());
      const allDocs = data.documents || [];
      const matchedDocs = citedTitles.length > 0
        ? allDocs.filter((doc: any) => citedTitles.some(t => doc.title.includes(t) || t.includes(doc.title)))
        : allDocs;
      addMessage({
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: cleanedReply,
        timestamp: new Date(),
        documents: matchedDocs.map((doc: any) => ({ id: doc.id, title: doc.title, content: doc.content, tags: doc.tags || [], createdAt: doc.createdAt, url: doc.url })),
      });
      addSpellLog('orchestrator', '대마법사', '최종 응답 생성 완료', 'success');
      setProgress(100);
    } catch (err) {
      addSpellLog('orchestrator', '대마법사', '워크플로우 중 오류 발생', 'warning');
      addMessage({ id: `err-${Date.now()}`, role: 'system', content: `⚠️ 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, timestamp: new Date() });
    } finally {
      setAgents(prev => prev.map(a => ({ ...a, status: 'idle', currentTask: undefined })));
      setIsLoading(false);
      setProgress(0);
      setCurrentTask('');
    }
  }, [addMessage, knowledgeDocs, agents, addSpellLog, runAgentWorkflow]);

  return (
    <div className="magic-bg min-h-screen">
      <header className="header-glass sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-violet-800 flex items-center justify-center text-base">🧙‍♂️</div>
              <div>
                <h1 className="font-cinzel text-base font-bold text-white">Amy's Brain Office</h1>
                <p className="text-[10px] text-purple-400">Personal Knowledge System</p>
              </div>
            </div>
          </div>
          <div className="flex gap-1 mt-1">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`tab-btn flex items-center gap-1.5 ${activeTab === tab.id ? 'active' : ''}`}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-5">
              <div className="section-title mb-3">작업 현황</div>
              <div className="glow-purple rounded-xl overflow-hidden">
                <WizardTower agents={agents} spellLogs={spellLogs} />
              </div>
            </div>
            <div className="col-span-7 flex flex-col gap-5">
              <div className="glass-card p-5 flex-1">
                <div className="section-title mb-4">AI 채팅</div>
                <ChatInterface messages={messages} addMessage={addMessage} onSendMessage={handleSendMessage} isLoading={isLoading} progress={progress} currentTask={currentTask} error={error} />
              </div>
              <div className="glass-card p-5">
                <div className="section-title mb-3">지식 추가</div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input ref={urlInputRef} type="text" placeholder="URL을 입력하세요 (예: https://example.com)" className="flex-1 px-3 py-2 bg-white/5 border border-purple-500/30 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:bg-white/10 transition-all" disabled={isKnowledgeAdding} />
                  </div>
                  <div className="flex gap-2 items-center">
                    <input type="file" ref={fileInputRef} accept=".jpg,.jpeg,.png,.pdf,.docx,.md" className="flex-1 px-3 py-2 bg-white/5 border border-purple-500/30 rounded-lg text-white text-xs focus:outline-none focus:border-purple-500 transition-all file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700" disabled={isKnowledgeAdding} />
                    <button onClick={async () => {
                      if (urlInputRef.current?.value.trim() || fileInputRef.current?.files?.[0]) {
                        const url = urlInputRef.current?.value.trim() || '';
                        const file = fileInputRef.current?.files?.[0];
                        setIsKnowledgeAdding(true);
                        const isImage = file ? /\.(jpg|jpeg|png)$/i.test(file.name) : false;
                        const isPdf = file ? /\.pdf$/i.test(file.name) : false;
                        const isUrlOnly = !file && !!url;
                        
                        if (isImage || isUrlOnly) {
                          setCurrentTask('A2A 병렬 에이전트가 지식 분석 중...');
                          addSpellLog('orchestrator', '대마법사', 'A2A 프로토콜로 텍스트/비전 에이전트에 작업 분배', 'success');
                          setAgents(prev => prev.map(a => a.id === 'orchestrator' ? { ...a, status: 'working', currentTask: 'A2A 작업 분배 중...' } : a));
                          await new Promise(r => setTimeout(r, 500));
                          setAgents(prev => prev.map(a => a.id === 'text_agent' ? { ...a, status: 'working', currentTask: '텍스트 분석 (LLM)...' } : a));
                          addSpellLog('text_agent', '룬 마스터', '텍스트 에이전트: 본문/키워드/topic 추출 중', 'success');
                          await new Promise(r => setTimeout(r, 800));
                          setAgents(prev => prev.map(a => a.id === 'vision_agent' ? { ...a, status: 'working', currentTask: isImage ? '이미지 분석 중...' : '비전 분석 (Vision)...' } : a));
                          addSpellLog('vision_agent', '일루셔니스트', isImage ? '비전 에이전트: 이미지 분석 중' : '비전 에이전트: 이미지/캐러셀 분석 중', 'success');
                          await new Promise(r => setTimeout(r, 600));
                        } else if (isPdf) {
                          setCurrentTask('PDF 파일 분석 중...');
                          setAgents(prev => prev.map(a => a.id === 'text_agent' ? { ...a, status: 'working', currentTask: 'PDF 파일 분석 중...' } : a));
                          addSpellLog('text_agent', '룬 마스터', '텍스트 에이전트: PDF 파일 분석 중', 'success');
                          await new Promise(r => setTimeout(r, 1400));
                        } else {
                          setCurrentTask('텍스트 분석 중...');
                          setAgents(prev => prev.map(a => a.id === 'text_agent' ? { ...a, status: 'working', currentTask: '텍스트 분석 중...' } : a));
                          addSpellLog('text_agent', '룬 마스터', '텍스트 에이전트: 텍스트 분석 중', 'success');
                          await new Promise(r => setTimeout(r, 1400));
                        }
                        try {
                          let response;
                          if (file) {
                            const formData = new FormData();
                            formData.append('file', file);
                            if (url) formData.append('url', url);
                            response = await fetch('/api/knowledge', { method: 'POST', body: formData });
                          } else {
                            response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '', type: 'web', url }) });
                          }
                          
                          if (response.ok) {
                            const data = await response.json();
                            setAgents(prev => prev.map(a => a.id === 'storage_agent' ? { ...a, status: 'working', currentTask: '지식 저장 중...' } : a));
                            addSpellLog('storage_agent', '기록가', `파싱 결과 저장 완료: ${data.document?.title || url}`, 'success');
                            await new Promise(r => setTimeout(r, 400));
                            addMessage({ id: `system-${Date.now()}`, role: 'system', content: `지식이 저장되었습니다: ${data.document?.title || file?.name || url}`, timestamp: new Date() });
                            const res = await fetch('/api/knowledge');
                            const json = await res.json();
                            const sorted = (json.documents || []).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                            setKnowledgeDocs(sorted as KnowledgeDoc[]);
                            addSpellLog('orchestrator', '대마법사', '지식 추가 워크플로우 완료', 'success');
                          }
                        } catch (error) {
                          addSpellLog('text_agent', '룬 마스터', '지식 추출 중 오류가 발생했습니다.', 'warning');
                          addMessage({ id: `err-${Date.now()}`, role: 'system', content: `⚠️ 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, timestamp: new Date() });
                        } finally {
                          setIsKnowledgeAdding(false);
                          setCurrentTask('');
                          setAgents(prev => prev.map(a => ({ ...a, status: 'idle', currentTask: undefined })));
                          if (urlInputRef.current) urlInputRef.current.value = '';
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }
                      }
                    }} disabled={isKnowledgeAdding} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap">
                      <span>추가하기</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 px-1">지원 확장자: .jpg, .png, .pdf, .docx, .md 등</p>
                </div>
                {isKnowledgeAdding && (
                  <div className="flex items-center justify-center gap-2 mt-2 text-purple-300 text-xs">
                    <ThinkingOrb state="working" size={20} theme="dark" />
                    <span>진행중...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'graph' && (
          <div className="glass-card p-6">
            <div className="section-title mb-5">지식 그래프</div>
            <div className="relative">
              <KnowledgeGraph nodes={graphNodes} edges={graphEdges} onNodeClick={(node) => { /* handled inside component */ }} />
            </div>
          </div>
        )}
        {activeTab === 'history' && (
          <div className="glass-card p-6">
            <div className="section-title mb-5">지식 보관소</div>
            <KnowledgeHistory documents={knowledgeDocs} onChange={(docs) => { setKnowledgeDocs(docs); rebuildGraph(docs); }} />
          </div>
        )}
      </main>
    </div>
  );
}