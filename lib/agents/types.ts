export type AgentStatus = 'idle' | 'working' | 'completed' | 'failed';
export type TaskType = 'orchestrate' | 'text_parse' | 'knowledge_analyze' | 'vision_parse' | 'storage_save' | 'document_process' | 'debug';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'assigned' | 'completed' | 'failed';
export type DocumentType = 'pdf' | 'web' | 'image';

export interface AgentState {
  id: string;
  name: string;
  role: string;
  emoji: string;
  status: AgentStatus;
  currentTask?: string;
  position: { x: number; y: number };
  floor: number;
}

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  assignedTo?: string;
  status: TaskStatus;
  createdAt: Date;
  description: string;
  progress: number;
}

export interface Document {
  id: string;
  type: DocumentType;
  title: string;
  content: string;
  summary: string;
  url?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  mdPath: string;
  relatedDocs: string[];
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    documentId: string;
    type: string;
    position: { x: number; y: number };
    mdPath: string;
    metadata: any;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    strength: number;
  }>;
}

export interface AgentResponse {
  success: boolean;
  data?: any;
  error?: string;
  agentId: string;
}
