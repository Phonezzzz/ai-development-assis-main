import type { AgentTask } from '@/lib/types';
import {
  agentAutonomousActions,
  type AutonomousAction,
} from '@/lib/services/agent-autonomous-actions';

export class ActionCoordinator {
  async executeFileOperation(
    task: AgentTask,
    operation: Parameters<typeof agentAutonomousActions.executeFileOperation>[1],
    filePath: string,
    content?: string,
  ) {
    return agentAutonomousActions.executeFileOperation(task, operation, filePath, content);
  }

  async executeCode(task: AgentTask, code: string, language?: string) {
    return agentAutonomousActions.executeCode(task, code, language);
  }

  getActiveActions(): AutonomousAction[] {
    return agentAutonomousActions.getActiveActions();
  }

  getActionHistory(): AutonomousAction[] {
    return agentAutonomousActions.getActionHistory();
  }

  clearCompletedActions(): void {
    agentAutonomousActions.clearCompletedActions();
  }

  clearActiveForTask(taskId: string): void {
    agentAutonomousActions.clearActionsByTask(taskId);
  }
}