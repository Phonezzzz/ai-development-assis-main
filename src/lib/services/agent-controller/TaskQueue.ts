import type { AgentTask } from '@/lib/types';
import type { EnqueueTaskOptions, UpdateTaskOptions } from './types';

const cloneTasks = (tasks: AgentTask[]): AgentTask[] =>
  tasks.map((task) => ({ ...task }));

export class TaskQueue {
  private tasks: AgentTask[] = [];
  private activeTaskId: string | null = null;

  getAll(): AgentTask[] {
    return cloneTasks(this.tasks);
  }

  getActive(): AgentTask | null {
    if (!this.activeTaskId) return null;
    return this.tasks.find((task) => task.id === this.activeTaskId) ?? null;
  }

  enqueue(taskOrTasks: AgentTask | AgentTask[], options: EnqueueTaskOptions = {}): AgentTask[] {
    const tasks = Array.isArray(taskOrTasks) ? taskOrTasks : [taskOrTasks];
    const now = new Date();

    const prepared = tasks.map((task) => ({
      ...task,
      updatedAt: now,
    }));

    if (options.preventDuplicates) {
      const existingIds = new Set(this.tasks.map((task) => task.id));
      const filtered = prepared.filter((task) => !existingIds.has(task.id));
      this.tasks.push(...filtered);
      if (filtered.length === 0) return this.getAll();
    } else {
      this.tasks.push(...prepared);
    }

    if (options.setActive && prepared.length > 0) {
      this.setActiveTask(prepared[0].id);
    } else if (!this.activeTaskId) {
      this.promoteNextPending();
    }

    return this.getAll();
  }

  updateTask(taskId: string, updates: Partial<AgentTask>, options: UpdateTaskOptions = {}): AgentTask | null {
    const index = this.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return null;

    const previous = this.tasks[index];
    const next: AgentTask = {
      ...previous,
      ...updates,
      updatedAt: new Date(),
    };

    if (next.status === 'completed' && !next.completedAt) {
      next.completedAt = new Date();
    }

    this.tasks[index] = next;

    if (!options.suppressEvents && this.activeTaskId === taskId && next.status === 'completed') {
      this.promoteNextPending();
    }

    return { ...next };
  }

  setActiveTask(taskId: string | null): AgentTask | null {
    if (taskId === null) {
      this.activeTaskId = null;
      return null;
    }

    const task = this.tasks.find((item) => item.id === taskId);
    if (!task) return null;

    if (task.status === 'pending') {
      this.updateTask(task.id, { status: 'in_progress' }, { suppressEvents: true });
    }

    this.activeTaskId = taskId;
    return { ...task };
  }

  promoteNextPending(): AgentTask | null {
    const next = this.tasks.find((task) => task.status === 'pending');
    if (!next) {
      this.activeTaskId = null;
      return null;
    }

    this.setActiveTask(next.id);
    return { ...next };
  }

  remove(taskId: string): AgentTask | null {
    const index = this.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return null;

    const [removed] = this.tasks.splice(index, 1);
    if (this.activeTaskId === taskId) {
      this.promoteNextPending();
    }
    return removed;
  }

  clear(): AgentTask[] {
    const removed = this.tasks;
    this.tasks = [];
    this.activeTaskId = null;
    return removed;
  }

  hasTasks(): boolean {
    return this.tasks.length > 0;
  }

  reset(tasks: AgentTask[], options: EnqueueTaskOptions = {}): AgentTask[] {
    this.tasks = [];
    this.activeTaskId = null;
    return this.enqueue(tasks, options);
  }
}