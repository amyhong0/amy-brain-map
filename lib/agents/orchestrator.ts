import { BaseAgent } from './base-agent';
import { AgentResponse, Task, AgentState, TaskType } from './types';

export class OrchestratorAgent extends BaseAgent {
  private agents: Map<string, BaseAgent> = new Map();

  constructor() {
    super('orchestrator', '대마법사', 'Central Control', '🧙‍♂️', 5);
    this.state.position = { x: 50, y: 10 };
  }

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getState().id, agent);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  async executeTask(task: Task): Promise<AgentResponse> {
    this.setState({ status: 'working', currentTask: task.description });
    
    try {
      // 작업 분배 로직
      const assignedAgent = this.assignTask(task);
      
      if (!assignedAgent) {
        return {
          success: false,
          error: 'No available agent for this task type',
          agentId: this.state.id
        };
      }

      // 에이전트에 작업 할당
      const response = await assignedAgent.executeTask(task);
      
      this.setState({ status: 'idle', currentTask: undefined });
      
      return response;
    } catch (error) {
      this.setState({ status: 'idle', currentTask: undefined });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: this.state.id
      };
    }
  }

  private assignTask(task: Task): BaseAgent | null {
    const agentMap: Record<TaskType, string> = {
      'orchestrate': 'orchestrator',
      'text_parse': 'text_agent',
      'knowledge_analyze': 'text_agent',
      'vision_parse': 'vision_agent',
      'storage_save': 'storage_agent',
      'document_process': 'storage_agent',
      'debug': 'debug'
    };

    const agentId = agentMap[task.type];
    const agent = this.agents.get(agentId);

    if (agent && agent.getState().status === 'idle') {
      task.assignedTo = agentId;
      task.status = 'assigned';
      return agent;
    }

    return null;
  }

  async executeParallelTasks(tasks: Task[]): Promise<AgentResponse[]> {
    this.setState({ status: 'working', currentTask: `Processing ${tasks.length} parallel tasks` });

    const promises = tasks.map(task => this.executeTask(task));
    const results = await Promise.all(promises);

    this.setState({ status: 'idle', currentTask: undefined });

    return results;
  }

  getAgentStates(): AgentState[] {
    const states: AgentState[] = [this.getState()];
    
    this.agents.forEach((agent) => {
      states.push(agent.getState());
    });

    return states;
  }

  getTaskQueue(): Task[] {
    return [...this.taskQueue];
  }

  addToTaskQueue(task: Task): void {
    this.taskQueue.push(task);
  }

  processTaskQueue(): void {
    // 우선순위별로 작업 처리
    this.taskQueue.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 병렬 처리 가능한 작업 그룹화
    const pendingTasks = this.taskQueue.filter(t => t.status === 'pending');
    
    if (pendingTasks.length > 0) {
      this.executeParallelTasks(pendingTasks).then(() => {
        // 완료된 작업 제거
        this.taskQueue = this.taskQueue.filter(t => t.status !== 'completed');
      });
    }
  }
}
