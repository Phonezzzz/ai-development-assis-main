import type { AgentTask } from '@/lib/types';
import { agentMemoryService } from '@/lib/services/agent-memory';

export class MemoryManager {
  async recordTaskCompletion(task: AgentTask): Promise<void> {
    try {
      await agentMemoryService.addMemory({
        sessionId: task.sessionId,
        context: task.result
          ? `Результат задачи "${task.title}": ${task.result}`
          : `Задача "${task.title}" завершена`,
        type: task.error ? 'observation' : 'reflection',
        importance: task.priority === 'high' ? 8 : task.priority === 'medium' ? 6 : 4,
        metadata: {
          taskId: task.id,
          status: task.status,
          error: task.error,
          actualTime: task.actualTime,
          estimatedTime: task.estimatedTime,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('[AgentController][MemoryManager] Failed to record task completion', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async getStats(sessionId: string) {
    return agentMemoryService.getMemoryStats(sessionId);
  }
}