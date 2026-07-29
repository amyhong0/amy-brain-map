import { BaseAgent } from './base-agent';
import { AgentResponse, Task } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';

export class TextAgent extends BaseAgent {
  constructor() {
    super('text_agent', '룬 마스터', 'Knowledge Analysis', '🔮', 4);
    this.state.position = { x: 50, y: 20 };
  }

  async executeTask(task: Task): Promise<AgentResponse> {
    this.setState({ status: 'working', currentTask: task.description });
    this.updateProgress(task.id, 0);

    try {
      const { query, timeRange, keywords } = JSON.parse(task.description);
      
      this.updateProgress(task.id, 20);
      
      // 문서 검색
      const documents = await this.searchDocuments(query, timeRange, keywords);
      
      this.updateProgress(task.id, 60);
      
      // 연관성 분석
      const relatedDocs = await this.analyzeRelationships(documents);
      
      this.updateProgress(task.id, 100);
      this.completeTask(task.id);
      
      this.setState({ status: 'idle', currentTask: undefined });
      
      return {
        success: true,
        data: { documents, relatedDocs },
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

  private async searchDocuments(
    query: string,
    timeRange?: { start: Date; end: Date },
    keywords?: string[]
  ): Promise<any[]> {
    const documentsDir = path.join(process.cwd(), 'knowledge', 'documents');
    const files = await fs.readdir(documentsDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    const results: any[] = [];
    
    for (const file of mdFiles) {
      const filePath = path.join(documentsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const { data, content: markdown } = matter(content);
      
      // 시간 필터링
      if (timeRange) {
        const createdAt = new Date(data.createdAt);
        if (createdAt < timeRange.start || createdAt > timeRange.end) {
          continue;
        }
      }
      
      // 키워드 필터링
      if (keywords && keywords.length > 0) {
        const hasKeyword = keywords.some(keyword => 
          data.tags?.includes(keyword) || 
          markdown.toLowerCase().includes(keyword.toLowerCase())
        );
        if (!hasKeyword) continue;
      }
      
      // 쿼리 매칭
      if (query && !markdown.toLowerCase().includes(query.toLowerCase())) {
        continue;
      }
      
      results.push({
        id: data.id,
        title: data.title,
        type: data.type,
        content: markdown,
        tags: data.tags,
        createdAt: data.createdAt,
        relatedDocs: data.relatedDocs
      });
    }
    
    return results;
  }

  private async analyzeRelationships(documents: any[]): Promise<any[]> {
    const relationships: any[] = [];
    
    // 간단한 연관성 분석: 공통 태그 기반
    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const doc1 = documents[i];
        const doc2 = documents[j];
        
        const commonTags = doc1.tags?.filter((tag: string) => 
          doc2.tags?.includes(tag)
        ) || [];
        
        if (commonTags.length > 0) {
          relationships.push({
            source: doc1.id,
            target: doc2.id,
            strength: commonTags.length,
            reason: `Common tags: ${commonTags.join(', ')}`
          });
        }
      }
    }
    
    return relationships;
  }
}

export { TextAgent as KnowledgeAnalyzerAgent };
