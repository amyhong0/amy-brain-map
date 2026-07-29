'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Terminal,
  CheckCircle2,
  Disc3,
  AlertTriangle,
} from 'lucide-react';
import { AgentState } from '@/lib/agents/types';

// ── Types ─────────────────────────────────────────────────────────
interface ZoneConfig {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  image?: string;
  tasks: { label: string; icon: string }[];
}

interface SpellLog {
  id: number;
  time: string;
  spell: string;
  type: 'success' | 'warning';
  zoneId: string;
}

// ── Zone Definitions ──────────────────────────────────────────────
const ZONES: ZoneConfig[] = [
  {
    id: 'cauldron',
    name: '대마법사',
    role: 'Task Distribution',
    emoji: '🧙‍♂️',
    color: '#9C27B0',
    image: '/image/캐릭터1.png',
    tasks: [
      { label: 'Agent Orchestration', icon: '⚡' },
      { label: 'Task Distribution', icon: '🔀' },
    ],
  },
  {
    id: 'desk',
    name: '룬 마스터',
    role: 'Knowledge Analysis',
    emoji: '🔮',
    color: '#4CAF50',
    image: '/image/캐릭터2.png',
    tasks: [
      { label: 'Document Parsing', icon: '📄' },
      { label: 'Knowledge Analysis', icon: '🔍' },
    ],
  },
  {
    id: 'library',
    name: '일루셔니스트',
    role: 'Knowledge Retrieval',
    emoji: '⚗️',
    color: '#2196F3',
    image: '/image/캐릭터3.png',
    tasks: [
      { label: 'Semantic Search', icon: '🔎' },
      { label: 'MCP 호출', icon: '🔌' },
    ],
  },
  {
    id: 'debug',
    name: '정령사',
    role: 'Error Fix',
    emoji: '🦹',
    color: '#F44336',
    image: '/image/캐릭터4.png',
    tasks: [
      { label: 'Error Diagnosis', icon: '🐛' },
      { label: 'Bug Fix', icon: '🔧' },
    ],
  },
  {
    id: 'archive',
    name: '기록가',
    role: 'Data Storage',
    emoji: '📚',
    color: '#FF9800',
    image: '/image/캐릭터5.png',
    tasks: [
      { label: 'Data Storage', icon: '💾' },
      { label: 'Archive Management', icon: '📦' },
    ],
  },
];

// ── Background Component ──────────────────────────────────────────
function BackgroundImage() {
  return (
    <div className="absolute inset-0 w-full h-full">
      <img 
        src="/image/배경.png" 
        alt="Background" 
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

// ── Character Component with Image ────────────────────────────────
function Character({
  zone,
  agent,
  position,
  onPositionChange,
  onClick,
  containerWidth,
  containerHeight,
}: {
  zone: ZoneConfig;
  agent: AgentState | undefined;
  position: { x: number; y: number };
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
  onClick: () => void;
  containerWidth: number;
  containerHeight: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isWorking = agent?.status === 'working';
  const currentTask = agent?.currentTask;

  // Character size (fixed 67px, need ~11% buffer for translate(-50%, -50%))
  const charWidth = 67;
  const charHeight = 67;
  
  // 최종 클램프 값 (67px 캐릭터 절반 고려)
  const SAFE_MIN = 12;
  const SAFE_MAX = 88;

  const getBoundaries = () => {
    let regionMinX = SAFE_MIN, regionMaxX = SAFE_MAX, regionMinY = SAFE_MIN, regionMaxY = SAFE_MAX;
    
    if (zone.id === 'cauldron') {
      regionMinX = 42; regionMaxX = 58;
      regionMinY = 10; regionMaxY = 20;
    } else if (zone.id === 'desk') {
      regionMinX = 18; regionMaxX = 28;
      regionMinY = 32; regionMaxY = 48;
    } else if (zone.id === 'library') {
      regionMinX = 72; regionMaxX = 82;
      regionMinY = 32; regionMaxY = 48;
    } else if (zone.id === 'debug') {
      regionMinX = 18; regionMaxX = 28;
      regionMinY = 62; regionMaxY = 78;
    } else if (zone.id === 'archive') {
      regionMinX = 72; regionMaxX = 82;
      regionMinY = 62; regionMaxY = 78;
    }
    
    return { minX: regionMinX, maxX: regionMaxX, minY: regionMinY, maxY: regionMaxY };
  };

  useEffect(() => {
    if (!isWorking) {
      const wanderInterval = setInterval(() => {
        const { minX, maxX, minY, maxY } = getBoundaries();
        
        const newX = position.x + (Math.random() - 0.5) * 10;
        const newY = position.y + (Math.random() - 0.5) * 10;
        const clampedX = Math.max(minX, Math.min(maxX, newX));
        const clampedY = Math.max(minY, Math.min(maxY, newY));
        const finalX = Math.max(SAFE_MIN, Math.min(SAFE_MAX, clampedX));
        const finalY = Math.max(SAFE_MIN, Math.min(SAFE_MAX, clampedY));
        onPositionChange(zone.id, { x: finalX, y: finalY });
      }, 3000);

      return () => clearInterval(wanderInterval);
    }
  }, [isWorking, position.x, position.y, zone.id, onPositionChange, containerWidth, containerHeight]);

  return (
    <motion.div
      className="absolute cursor-pointer"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isWorking ? 100 : 10,
        width: `${charWidth}px`,
        height: `${charHeight}px`,
      }}
      onClick={onClick}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      animate={{
        scale: isWorking ? 1.1 : 1,
      }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative w-full h-full">
        <img 
          src={zone.image} 
          alt={zone.name}
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
          style={{
            filter: isWorking ? `drop-shadow(0 0 12px ${zone.color}88)` : `drop-shadow(0 0 8px ${zone.color}44)`,
            imageRendering: 'pixelated',
            opacity: isWorking ? 1 : 0.8,
          }}
        />

          {!isWorking && (
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-purple-500/50 rounded-full animate-pulse pointer-events-none" />
        )}
        
         {/* 마법진 Aura 효과 - 작업 중일 때 (향상된 버전) */}
         {isWorking && (
           <motion.div
             className="absolute -top-8 -left-8 -right-8 -bottom-8 pointer-events-none"
             initial={{ opacity: 0, scale: 0.5 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.5 }}
             transition={{ duration: 0.5 }}
           >
             {/* 외부 링 1 - 시계 방향 회전 */}
             <div 
               className="absolute inset-0 rounded-full animate-spin"
               style={{ 
                 animationDuration: '4s',
                 border: `2px solid transparent`,
                 background: `conic-gradient(from 0deg, ${zone.color}00, ${zone.color}88, ${zone.color}ff, ${zone.color}88, ${zone.color}00)`,
                 WebkitMask: 'radial-gradient(transparent 65%, black 66%, black 90%, transparent 91%)',
                 mask: 'radial-gradient(transparent 65%, black 66%, black 90%, transparent 91%)',
                 filter: 'blur(1px)',
               }}
             />
             
             {/* 외부 링 2 - 반시계 방향 회전 */}
             <div 
               className="absolute inset-1 rounded-full animate-spin"
               style={{ 
                 animationDuration: '3s',
                 animationDirection: 'reverse',
                 border: `2px solid transparent`,
                 background: `conic-gradient(from 180deg, ${zone.color}00, ${zone.color}66, ${zone.color}aa, ${zone.color}66, ${zone.color}00)`,
                 WebkitMask: 'radial-gradient(transparent 70%, black 71%, black 85%, transparent 86%)',
                 mask: 'radial-gradient(transparent 70%, black 71%, black 85%, transparent 86%)',
                 filter: 'blur(1px)',
               }}
             />
             
             {/* 내부 링 3 - 빠르게 회전 */}
             <div 
               className="absolute inset-2 rounded-full animate-spin"
               style={{ 
                 animationDuration: '2s',
                 border: `1px solid ${zone.color}88`,
                 boxShadow: `0 0 15px ${zone.color}44, inset 0 0 15px ${zone.color}44`,
                 opacity: 0.8,
               }}
             />
             
             {/* 빛나는 중심점 */}
             <div 
               className="absolute"
               style={{
                 top: '50%',
                 left: '50%',
                 width: '8px',
                 height: '8px',
                 transform: 'translate(-50%, -50%)',
                 borderRadius: '50%',
                 background: zone.color,
                 boxShadow: `0 0 20px ${zone.color}, 0 0 40px ${zone.color}66`,
               }}
             >
               <motion.div
                 className="absolute inset-0 rounded-full"
                 animate={{
                   scale: [1, 2, 1],
                   opacity: [0.8, 0, 0.8],
                 }}
                 transition={{
                   duration: 1.5,
                   repeat: Infinity,
                   ease: 'easeOut',
                 }}
                 style={{
                   background: `radial-gradient(circle, ${zone.color}ff, transparent)`,
                 }}
               />
             </div>

             {/* 룬 문자 효과 */}
             {Array.from({ length: 8 }).map((_, i) => {
               const angle = (i / 8) * Math.PI * 2;
               const radius = 55;
               const x = 50 + Math.cos(angle) * radius / 2;
               const y = 50 + Math.sin(angle) * radius / 2;
               const runes = ['ᛦ', 'ᛉ', 'ᛟ', 'ᚨ', 'ᚷ', 'ᛞ', 'ᛏ', 'ᛒ'];
               return (
                 <motion.div
                   key={i}
                   className="absolute text-[10px] font-bold pointer-events-none"
                   style={{
                     left: `${x}%`,
                     top: `${y}%`,
                     color: zone.color,
                     transform: 'translate(-50%, -50%)',
                     textShadow: `0 0 10px ${zone.color}88`,
                   }}
                   animate={{
                     opacity: [0.3, 1, 0.3],
                     scale: [0.8, 1.2, 0.8],
                   }}
                   transition={{
                     duration: 2 + Math.random(),
                     repeat: Infinity,
                     delay: i * 0.3,
                   }}
                 >
                   {runes[i]}
                 </motion.div>
               );
             })}
           </motion.div>
         )}

        <div 
          className="absolute -top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 rounded text-[7px] font-bold text-white pointer-events-none"
          style={{
            background: `${zone.color}dd`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            border: `1px solid ${zone.color}66`,
          }}
        >
          {zone.name}
        </div>

        {isHovered && (
          <motion.div
            className="absolute -top-8 -left-4 whitespace-nowrap px-2 py-2 rounded-md text-white text-[10px] font-medium pointer-events-none z-[200]"
            style={{
              background: `linear-gradient(135deg, ${zone.color}ee, ${zone.color}aa)`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              border: `1px solid ${zone.color}88`,
            }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="font-bold">{zone.name}</div>
            <div className="text-[9px] opacity-90 mt-1">{zone.emoji} {zone.role}</div>
            <div className="text-[9px] opacity-70 mt-0.5 border-t border-white/20 pt-1">
              {zone.tasks.map((task, i) => (
                <div key={i}>{task.icon} {task.label}</div>
              ))}
            </div>
            <div className="text-[9px] opacity-70 mt-1">{agent?.status === 'working' ? '⚡ Working' : '😴 Idle'}</div>
          </motion.div>
        )}

        {isWorking && currentTask && (
          <motion.div
            className="absolute left-1/2 transform -translate-x-1/2 -translate-y-full mb-2 px-2 py-1.5 text-white text-[8px] font-medium whitespace-nowrap max-w-[180px] pointer-events-none z-[200]"
            style={{
              background: `linear-gradient(135deg, ${zone.color}ee, ${zone.color}aa)`,
              border: `2px solid ${zone.color}88`,
              boxShadow: `0 4px 12px ${zone.color}66`,
              borderRadius: '6px',
            }}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full bg-white animate-pulse" />
              <span>Working: {currentTask}</span>
            </div>
            <div 
              className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-1.5 h-1.5"
              style={{
                background: `${zone.color}ee`,
                borderLeft: `2px solid ${zone.color}88`,
                borderBottom: `2px solid ${zone.color}88`,
              }}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────
function AgentModal({
  zone, agent, onClose,
}: {
  zone: ZoneConfig; agent: AgentState | undefined; onClose: () => void;
}) {
  const isWorking = agent?.status === 'working';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-80 rounded-xl p-5"
        style={{
          background: `linear-gradient(135deg, ${zone.color}22, ${zone.color}11)`,
          border: `2px solid ${zone.color}66`,
        }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <img src={zone.image} alt={zone.name} className="w-16 h-16 object-contain" />
          <div>
            <div className="text-white font-bold text-lg">{zone.name}</div>
            <div className="text-gray-400 text-xs font-mono">{zone.role}</div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          {zone.tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span>{task.icon}</span>
              <span className="text-gray-300">{task.label}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: isWorking ? '#FFD700' : '#4CAF50' }}
            animate={isWorking ? { scale: [1, 1.3, 1] } : {}}
          />
          <span className="text-xs text-gray-400">
            {isWorking ? '작업 중' : '대기 중'}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Spell Log Item ────────────────────────────────────────────────
function SpellLogItem({ log, zoneColor }: { log: SpellLog; zoneColor: string }) {
  const typeIcon = {
    success: <CheckCircle2 size={10} />,
    warning: <AlertTriangle size={10} />,
  };

  const typeColor = {
    success: '#4CAF50',
    warning: '#FFD700',
  };

  // zoneId에 따른 색상 매핑
  const getZoneTextColor = (zoneId: string): string => {
    const zoneColors: Record<string, string> = {
      cauldron: '#9C27B0',  // 보라
      desk: '#4CAF50',      // 초록
      library: '#2196F3',  // 파랑
      debug: '#F44336',    // 빨강
      archive: '#FF9800',  // 주황
    };
    return zoneColors[zoneId] || typeColor.success;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-1.5 py-0.5 group"
    >
      <span className="text-[9px] text-gray-600 font-mono w-14 flex-shrink-0">{log.time}</span>
      <span className="mt-0.5 flex-shrink-0" style={{ color: typeColor[log.type] }}>
        {typeIcon[log.type]}
      </span>
      <span className="text-[10px] font-mono leading-tight" style={{ color: getZoneTextColor(log.zoneId) }}>
        {log.spell}
      </span>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────
interface WizardTowerProps {
  agents: AgentState[];
  spellLogs?: SpellLog[];
}

export default function WizardTower({ agents, spellLogs = [] }: WizardTowerProps) {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isTerminalVisible, setIsTerminalVisible] = useState(true);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [characterPositions, setCharacterPositions] = useState<Record<string, { x: number; y: number }>>({
    cauldron: { x: 50, y: 15 },
    desk: { x: 25, y: 40 },
    library: { x: 75, y: 40 },
    debug: { x: 25, y: 70 },
    archive: { x: 75, y: 70 },
  });
  const towerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const selectedZoneData = selectedZone ? ZONES.find(z => z.id === selectedZone) : null;
  const selectedAgent = selectedZone ? agents.find(a => a.id === selectedZone) : undefined;

  const workingCount = agents.filter(a => a.status === 'working').length;

    // Load saved character positions from localStorage
  useEffect(() => {
    const savedPositions = localStorage.getItem('characterPositions');
    if (savedPositions) {
      try {
        setCharacterPositions(JSON.parse(savedPositions));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('characterPositions', JSON.stringify(characterPositions));
  }, [characterPositions]);

  // Get container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (towerRef.current) {
        const rect = towerRef.current.getBoundingClientRect();
        setContainerDimensions({ width: rect.width, height: rect.height });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Auto-scroll terminal to bottom when spellLogs change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [spellLogs]);

  const handleZoneClick = useCallback((zoneId: string) => {
    setSelectedZone(prev => prev === zoneId ? null : zoneId);
  }, []);

  const handlePositionChange = useCallback((zoneId: string, pos: { x: number; y: number }) => {
    setCharacterPositions(prev => ({
      ...prev,
      [zoneId]: pos,
    }));
  }, []);

  const getZoneColor = (zoneId: string): string => {
    return ZONES.find(z => z.id === zoneId)?.color || '#666';
  };

  return (
    <div className="relative select-none">
      <div className="relative bg-gradient-to-b from-[#050510] via-[#0D0820] to-[#1A0A2E] rounded-t-xl pt-3 pb-0 px-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-purple-400" />
            <span className="text-purple-300 text-[10px] font-bold tracking-widest uppercase">Arcane Office</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsTerminalVisible(v => !v)} className="p-1 rounded-md hover:bg-white/10 transition-all">
              <Terminal size={12} className={isTerminalVisible ? 'text-purple-400' : 'text-gray-600'} />
            </button>
            <motion.div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${
                workingCount > 0 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-gray-800 text-gray-500'
              }`}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: workingCount > 0 ? '#FFD700' : '#666' }} />
              {workingCount > 0 ? `${workingCount} WORKING` : 'ALL IDLE'}
            </motion.div>
          </div>
        </div>
      </div>

      <div ref={towerRef} className="relative bg-gradient-to-b from-[#0D0820] via-[#1A0A2E] to-[#0A0518] overflow-hidden rounded-b-xl" style={{ height: '315px' }}>
        <BackgroundImage />
        
        {ZONES.map((zone) => (
          <Character
            key={zone.id}
            zone={zone}
            agent={agents.find(a => a.id === zone.id)}
            position={characterPositions[zone.id]}
            onPositionChange={handlePositionChange}
            onClick={() => handleZoneClick(zone.id)}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
          />
        ))}
      </div>

      <AnimatePresence>
        {selectedZone && selectedZoneData && (
          <AgentModal
            zone={selectedZoneData}
            agent={selectedAgent}
            onClose={() => setSelectedZone(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTerminalVisible && (
          <motion.div
            ref={terminalRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto"
              style={{ background: 'rgba(0,0,0,0.6)', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-purple-900/30">
                <div className="flex items-center gap-2">
                  <Disc3 size={10} className="text-purple-400" />
                  <span className="text-purple-400 text-[9px] font-bold">SPELL LOG</span>
                </div>
                <span className="text-gray-600 text-[8px]">{spellLogs.length} entries</span>
              </div>
               {spellLogs.length === 0 ? (
                 <div className="text-gray-600 text-[9px] italic py-4 text-center">마법 주문 로그가 여기에 표시됩니다...</div>
               ) : (
                 spellLogs.slice().reverse().map(log => <SpellLogItem key={log.id} log={log} zoneColor={getZoneColor(log.zoneId)} />)
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}