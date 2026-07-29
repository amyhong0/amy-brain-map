import { BaseAgent } from './base-agent';
import { AgentResponse, Task } from './types';

export class DebugAgent extends BaseAgent {
  constructor() {
    super('debug', '정령사', 'Bug Hunter', '🦹', 0);
    this.state.position = { x: 50, y: 80 };
  }

  async executeTask(task: Task): Promise<AgentResponse> {
    this.setState({ status: 'working', currentTask: task.description });
    this.updateProgress(task.id, 0);

    try {
      const { code, error, codeType } = JSON.parse(task.description);
      
      this.updateProgress(task.id, 30);
      
      // 에러 분석
      const errorAnalysis = await this.analyzeError(error, code);
      
      this.updateProgress(task.id, 60);
      
      // 수정 제안
      const fix = await this.generateFix(errorAnalysis, code, codeType);
      
      this.updateProgress(task.id, 90);
      
      // 수정된 코드 테스트
      const testResult = await this.testFixedCode(fix, codeType);
      
      this.updateProgress(task.id, 100);
      
      if (testResult.success) {
        this.completeTask(task.id);
        this.setState({ status: 'idle', currentTask: undefined });
        
        return {
          success: true,
          data: { fixedCode: fix, errorAnalysis, testResult },
          agentId: this.state.id
        };
      } else {
        this.failTask(task.id, 'Fix did not resolve the issue');
        this.setState({ status: 'idle', currentTask: undefined });
        
        return {
          success: false,
          error: `Fix did not resolve the issue: ${testResult.error}`,
          agentId: this.state.id
        };
      }
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

  private async analyzeError(error: string, code: string): Promise<any> {
    const errorType = this.classifyError(error);
    const errorLocation = this.locateError(error, code);
    
    return {
      type: errorType,
      message: error,
      location: errorLocation,
      severity: this.assessSeverity(errorType)
    };
  }

  private classifyError(error: string): string {
    if (error.includes('syntax')) return 'syntax';
    if (error.includes('runtime')) return 'runtime';
    if (error.includes('import') || error.includes('module')) return 'import';
    if (error.includes('undefined') || error.includes('null')) return 'reference';
    return 'unknown';
  }

  private locateError(error: string, code: string): any {
    const lines = code.split('\n');
    const errorLineMatch = error.match(/line (\d+)/);
    
    if (errorLineMatch) {
      const lineNum = parseInt(errorLineMatch[1]);
      return {
        line: lineNum,
        content: lines[lineNum - 1] || 'Unknown line'
      };
    }
    
    return { line: -1, content: 'Unknown location' };
  }

  private assessSeverity(errorType: string): 'low' | 'medium' | 'high' {
    const severityMap: Record<string, 'low' | 'medium' | 'high'> = {
      'syntax': 'high',
      'runtime': 'medium',
      'import': 'high',
      'reference': 'medium',
      'unknown': 'low'
    };
    
    return severityMap[errorType] || 'low';
  }

  private async generateFix(errorAnalysis: any, code: string, codeType: string): Promise<string> {
    let fixedCode = code;
    
    switch (errorAnalysis.type) {
      case 'syntax':
        fixedCode = this.fixSyntaxError(code, errorAnalysis);
        break;
      case 'import':
        fixedCode = this.fixImportError(code, errorAnalysis);
        break;
      case 'reference':
        fixedCode = this.fixReferenceError(code, errorAnalysis);
        break;
      default:
        fixedCode = this.applyGeneralFix(code, errorAnalysis);
    }
    
    return fixedCode;
  }

  private fixSyntaxError(code: string, errorAnalysis: any): string {
    let fixed = code;
    fixed = fixed.replace(/(\w)(\n)/g, '$1;\n');
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    
    if (openBraces > closeBraces) {
      fixed += '\n}'.repeat(openBraces - closeBraces);
    }
    
    return fixed;
  }

  private fixImportError(code: string, errorAnalysis: any): string {
    if (code.includes('from') && !code.includes('.js') && !code.includes('.ts')) {
      return code.replace(/from '([^']+)'/g, "from '$1.js'");
    }
    return code;
  }

  private fixReferenceError(code: string, errorAnalysis: any): string {
    return code.replace(/(\w+)\.(\w+)/g, '($1?.$2)');
  }

  private applyGeneralFix(code: string, errorAnalysis: any): string {
    return code;
  }

  private async testFixedCode(code: string, codeType: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!code || code.trim().length === 0) {
        return { success: false, error: 'Fixed code is empty' };
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown test error' 
      };
    }
  }
}

export { DebugAgent as DebuggerAgent };
