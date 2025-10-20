import type { AgentTask, PendingPlan } from '@/lib/types';
import type { ConfirmPlanOptions } from './types';

const createTaskId = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return `task_${globalThis.crypto.randomUUID()}`;
  }
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export class PlanManager {
  private pendingPlan: PendingPlan | null = null;
  private awaitingConfirmation = false;

  getPendingPlan(): PendingPlan | null {
    return this.pendingPlan;
  }

  isAwaitingConfirmation(): boolean {
    return this.awaitingConfirmation;
  }

  submit(plan: PendingPlan): void {
    this.pendingPlan = plan;
    this.awaitingConfirmation = true;
  }

  clear(): void {
    this.pendingPlan = null;
    this.awaitingConfirmation = false;
  }

  reject(): void {
    this.clear();
  }

  confirm(sessionId: string, options: ConfirmPlanOptions = {}): AgentTask[] {
    if (!this.pendingPlan) {
      throw new Error('Нет плана для подтверждения');
    }

    const plan = this.pendingPlan;
    const now = new Date();
    const tasks: AgentTask[] = plan.todos.map((todo, index) => ({
      id: createTaskId(),
      title: todo.title,
      description: todo.description ?? '',
      goal: todo.instructions ?? plan.description ?? '',
      status: options.autoStart && index === 0 ? 'in_progress' : 'pending',
      priority: todo.priority ?? 'medium',
      estimatedTime: todo.estimatedTime,
      actualTime: undefined,
      createdAt: now,
      updatedAt: now,
      completedAt: undefined,
      result: undefined,
      error: undefined,
      sessionId,
    }));

    this.clear();
    return tasks;
  }
}