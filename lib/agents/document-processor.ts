import { BaseAgent } from './base-agent';
import { AgentResponse, Task, Document } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

export class StorageAgent extends BaseAgent {
  constructor() {
    super('storage_agent', '기록가', 'Data Storage', '📚', 1);
    this.state.position = { x: 50, y: 90 };
  }

  async executeTask(task: Task): Promise<AgentResponse> {
    this.setState({ status: 'working', currentTask: task.description });
    this.updateProgress(task.id, 0);

    try {
      const { type, content, title, url } = JSON.parse(task.description);
      
      this.updateProgress(task.id, 30);
      
      // 지식 마크다운 문서 생성 및 저장
      const documentId = `doc-${Date.now()}`;
      const mdPath = path.join(process.cwd(), 'knowledge', `${documentId}.md`);
      
      const mdContent = this.generateMarkdown(documentId, type, title, content, url);
      
      this.updateProgress(task.id, 60);
      
      await fs.writeFile(mdPath, mdContent, 'utf-8');
      
      this.updateProgress(task.id, 100);
      this.completeTask(task.id);
      
      this.setState({ status: 'idle', currentTask: undefined });
      
      return {
        success: true,
        data: { documentId, mdPath },
        agentId: this.state.id
      };
    } catch (error) {
      this.failTask(task.id, error instanceof Error ? error.message : 'Unknown error');
      this.setState({ status: 'idle', currentTask: undefined });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: this.state.id
      };
    }
  }

  private generateMarkdown(
    id: string,
    type: string,
    title: string,
    content: string,
    url?: string
  ): string {
    const now = new Date().toISOString();
    
    return `---
id: ${id}
type: ${type}
title: "${title}"
tags: []
createdAt: ${now}
updatedAt: ${now}
relatedDocs: []
---

# ${title}

${content}

${url ? `\n\n**Source:** ${url}` : ''}
`;
  }
}

export { StorageAgent as DocumentProcessorAgent };
