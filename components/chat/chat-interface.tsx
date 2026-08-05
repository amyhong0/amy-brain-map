'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  documents?: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    createdAt: string;
    url?: string;
  }>;
}

// Knowledge content type for modal
export interface KnowledgeContent {
  title: string;
  content: string;
  tags?: string[];
  createdAt?: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => Promise<void>;
  addMessage: (msg: Message) => void;
  isLoading?: boolean;
  progress?: number;
  currentTask?: string;
  error?: string;
  onKnowledgeClick?: (knowledgeId: string) => void;
}

// Knowledge Detail Modal - shows full content when clicking links
function KnowledgeDetailModal({ knowledge, onClose }: { knowledge: KnowledgeContent; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="max-w-md w-full max-h-[80vh] overflow-y-auto rounded-xl p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 15, 50, 0.95), rgba(20, 10, 40, 0.95))',
          border: '1px solid rgba(139, 92, 246, 0.3)',
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-600/30 flex items-center justify-center text-lg">
            📄
          </div>
          <div>
            <h3 className="text-white font-bold">{knowledge.title}</h3>
            <span className="text-[10px] text-purple-300">지식 문서</span>
          </div>
        </div>

        {knowledge.tags && knowledge.tags.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] text-gray-400 mb-1 block">태그:</span>
            <div className="flex flex-wrap gap-1">
              {knowledge.tags.map((tag, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-purple-500/30 text-purple-200">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {knowledge.createdAt && (
          <div className="text-[10px] text-gray-400 mb-2">
            생성일: {knowledge.createdAt}
          </div>
        )}

        <div className="text-[11px] text-gray-300 mt-2 pt-2 border-t border-white/10 whitespace-pre-wrap">
          {knowledge.content}
        </div>

        <button
          onClick={onClose}
          className="mt-4 px-4 py-1.5 rounded-lg bg-purple-600/30 text-white text-[11px] hover:bg-purple-600/50"
        >
          닫기
        </button>
      </motion.div>
    </motion.div>
  );
}

// Knowledge database for chat links
const CHAT_KNOWLEDGE_DB: Record<string, KnowledgeContent> = {
  nvidia: {
    title: 'NVIDIA AI GPU 아키텍처 분석',
    content: `**Blackwell GPU 아키텍처**\n\n• 성능: 이전 세대 대비 2.5x 향상\n• 메모리: HBM3E 사용, 대용량 데이터 처리\n• 연결: NVLink 4.0 인터커넥트 지원\n• 최적화: AI 추론 전용 Tensor Core\n\n**CUDA 플랫폼**\n\n• 병렬 컴퓨팅 프레임워크\n• PyTorch, TensorFlow와 통합\n• GPU 메모리 관리 최적화\n\n관련 태그: #NVIDIA #GPU #딥러닝`,
    tags: ['NVIDIA', 'GPU', '딥러닝'],
    createdAt: '2026-07-20'
  },
  mcp: {
    title: 'MCP 프로토콜 기술 문서',
    content: `**Model Context Protocol**\n\n• AI 에이전트와 외부 도구 연결 표준\n• JSON-RPC 2.0 기반 통신\n• 세 가지 프리미티브: 도구, 리소스, 프롬프트\n\n**적용 사례**\n\n• 파일 시스템 접근\n• 웹 검색 엔진 연동\n• 데이터베이스 쿼리\n\n관련 태그: #MCP #프로토콜 #AI`,
    tags: ['MCP', '프로토콜', 'AI'],
    createdAt: '2026-07-19'
  },
  ai: {
    title: 'AI 시스템 설계 가이드',
    content: `**멀티 에이전트 시스템**\n\n• Orchestrator Pattern\n• Task Distribution 전략\n• Memory Retrieval 메커니즘\n\n**최신 동향**\n\n• 대규모 언어 모델 최적화\n• RAG(Retrieval-Augmented Generation)\n• AI 안전성 및 윤리\n\n관련 태그: #AI #머신러닝 #딥러닝`,
    tags: ['AI', '머신러닝', '딥러닝'],
    createdAt: '2026-07-18'
  },
};

const EXAMPLE_QUESTIONS = [
  { label: '📅 최근 저장 지식 요약', text: '최근 지식 보관소에 새로 추가된 문서들과 핵심 요약을 정리해줘.' },
  { label: '🏷️ 태그별 지식 분류', text: '보관함에 있는 지식 문서들을 주요 태그와 주제별로 그룹화해서 보여줘.' },
  { label: '🔍 AI & 기술 지식 검색', text: '저장해둔 문서와 웹 링크 중에서 AI 및 기술 관련 지식을 찾아서 설명해줘.' },
];

export default function ChatInterface({
  messages,
  onSendMessage,
  addMessage,
  isLoading = false,
  progress = 0,
  currentTask,
  error,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeContent | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle markdown link clicks in messages
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && target.textContent) {
      const href = target.getAttribute('href') || '';
      // Match /knowledge/{id} pattern
      const match = href.match(/\/knowledge\/([^/]+)/);
      if (match) {
        e.preventDefault();
        const knowledgeId = match[1];
        const knowledge = CHAT_KNOWLEDGE_DB[knowledgeId];
        if (knowledge) {
          setSelectedKnowledge(knowledge);
        }
      }
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');

    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    try {
      await onSendMessage(text);
    } catch (err) {
      addMessage({
        id: `err-${Date.now()}`,
        role: 'system',
        content: `⚠️ 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
        timestamp: new Date(),
      });
    }
  }, [input, isLoading, onSendMessage, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col" style={{ height: 420 }}>
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-br-sm'
                  : msg.role === 'system'
                    ? 'bg-white/6 border border-white/10 text-gray-300 rounded-bl-sm'
                    : 'bg-indigo-900/40 border border-indigo-500/20 text-indigo-100 rounded-bl-sm'
              }`}
              onClick={handleContentClick}
            >
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-purple-300 hover:text-purple-200 underline cursor-pointer">$1</a>')
                }}
              />
              {msg.documents && msg.documents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <div className="text-[10px] text-purple-300 mb-2">📄 관련 문서:</div>
                  {msg.documents.map((doc, idx) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedKnowledge({
                        title: doc.title,
                        content: doc.content,
                        tags: doc.tags,
                        createdAt: doc.createdAt
                      })}
                      className="block w-full text-left px-2 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-[11px] text-purple-200 transition-all mb-1 last:mb-0"
                    >
                      {doc.title}
                    </button>
                  ))}
                </div>
              )}
                <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-gray-500'} text-right`}>
                  {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
            </div>
          </div>
        ))}

        {/* 로딩 버블 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/6 border border-white/10 text-gray-300 rounded-2xl rounded-bl-sm px-4 py-3 text-sm max-w-[80%]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"/>
                <span className="text-purple-300 text-xs animate-pulse">{currentTask || '처리 중...'}</span>
              </div>
              {progress > 0 && (
                <div className="magic-progress mt-1">
                  <div className="magic-progress-bar" style={{ width: `${progress}%` }}/>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-900/30 border border-red-500/30 text-red-300 rounded-2xl px-4 py-2.5 text-xs max-w-[80%]">
              ⚠️ {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef}/>
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-white/8 pt-2">
        {/* 예시 질문 3가지 추천 버튼 */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-purple-300 flex items-center gap-1 mr-1">
            <span>💡</span> 예시 질문:
          </span>
          {EXAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => {
                if (isLoading) return;
                addMessage({
                  id: Date.now().toString(),
                  role: 'user',
                  content: q.text,
                  timestamp: new Date(),
                });
                onSendMessage(q.text);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 hover:text-white transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-1 shadow-sm cursor-pointer"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Enter로 전송)"
            rows={2}
            disabled={isLoading}
            className="flex-1 magic-input resize-none text-sm leading-relaxed"
            style={{ minHeight: 56 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="btn-magic px-5 py-3 self-stretch flex items-center gap-1.5"
          >
            <span>전송</span>
            <span>↑</span>
          </button>
        </div>
      </div>

      {/* Knowledge Detail Modal */}
      <AnimatePresence>
        {selectedKnowledge && (
          <KnowledgeDetailModal
            knowledge={selectedKnowledge}
            onClose={() => setSelectedKnowledge(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
