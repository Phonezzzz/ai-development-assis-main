import type { AgentState, AgentTask, PendingPlan } from '@/lib/types';
import { agentEventSystem, AGENT_EVENTS } from '@/lib/services/agent-event-system';
import { PlanManager } from './PlanManager';
import { TaskQueue } from './TaskQueue';
import { MemoryManager } from './MemoryManager.ts';
import { ActionCoordinator } from './ActionCoordinator.ts';
import type {
  AgentControllerEvent,
  AgentControllerListener,
  AgentControllerSession,
  AgentControllerSnapshot,
  ConfirmPlanOptions,
  EnqueueTaskOptions,
  UpdateTaskOptions,
} from './types';
import { EventHandlingStrategy } from './EventHandlingStrategy';

interface InitializeOptions {
  id: string;
  name?: string;
  description?: string;
}

interface SnapshotContext {
  suppressEvents?: boolean;
}

const DEFAULT_STATE: AgentState = 'idle';

export class AgentController {
  private session: AgentControllerSession | null = null;
  private state: AgentState = DEFAULT_STATE;
  private readonly planManager = new PlanManager();
  private readonly taskQueue = new TaskQueue();
  private readonly memoryManager = new MemoryManager();
  private readonly actionCoordinator = new ActionCoordinator();
  private readonly events = new EventHandlingStrategy();
  private memoryStats = null as AgentControllerSnapshot['memoryStats'];
  private lastSnapshot: AgentControllerSnapshot | null = null;

  async initialize(options: InitializeOptions): Promise<AgentControllerSnapshot> {
    const now = new Date();
    this.session = {
      id: options.id,
      name: options.name,
      description: options.description,
      createdAt: now,
      updatedAt: now,
    };
    this.planManager.clear();
    this.taskQueue.clear();
    this.state = DEFAULT_STATE;
    await this.refreshMemoryStats();
    agentEventSystem.emit(AGENT_EVENTS.SESSION_CREATED, {
      sessionId: options.id,
      name: options.name,
      description: options.description,
      timestamp: now.toISOString(),
    });
    return this.emit('snapshot');
  }

  async shutdown(): Promise<AgentControllerSnapshot> {
    if (this.session) {
      agentEventSystem.emit(AGENT_EVENTS.SESSION_CLEARED, {
        sessionId: this.session.id,
        timestamp: new Date().toISOString(),
      });
    }
    this.session = null;
    this.planManager.clear();
    this.taskQueue.clear();
    this.state = DEFAULT_STATE;
    this.memoryStats = null;
    return this.emit('snapshot');
  }

  getSnapshot(): AgentControllerSnapshot {
    if (!this.lastSnapshot) {
      this.lastSnapshot = this.buildSnapshot();
    }
    return this.lastSnapshot;
  }

  subscribe(listener: AgentControllerListener): () => void {
    return this.events.subscribe(listener, this.getSnapshot());
  }

  submitPlan(plan: PendingPlan): AgentControllerSnapshot {
    this.ensureSession();
    this.planManager.submit(plan);
    this.setState('planning', { suppressEvents: true });
    agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
      sessionId: this.session!.id,
      type: 'plan_submitted',
      plan,
      timestamp: new Date().toISOString(),
    });
    return this.emit('plan_pending');
  }

  confirmPlan(options: ConfirmPlanOptions = {}): AgentControllerSnapshot {
    const sessionId = this.ensureSession();
    const tasks = this.planManager.confirm(sessionId, options);
    if (tasks.length === 0) {
      return this.emit('plan_confirmed');
    }
    const snapshot = this.enqueueTask(tasks, { setActive: options.autoStart ?? true });
    agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
      sessionId,
      type: 'plan_confirmed',
      tasks: snapshot.queue,
      timestamp: new Date().toISOString(),
    });
    this.setState('executing');
    return this.emit('plan_confirmed');
  }

  rejectPlan(): AgentControllerSnapshot {
    this.ensureSession();
    const pending = this.planManager.getPendingPlan();
    this.planManager.reject();
    agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
      sessionId: this.session!.id,
      type: 'plan_rejected',
      plan: pending,
      timestamp: new Date().toISOString(),
    });
    this.setState('idle');
    return this.emit('plan_rejected');
  }

  enqueueTask(taskOrTasks: AgentTask | AgentTask[], options: EnqueueTaskOptions = {}): AgentControllerSnapshot {
    this.ensureSession();
    const beforeActive = this.taskQueue.getActive();
    const updatedQueue = this.taskQueue.enqueue(taskOrTasks, options);
    const afterActive = this.taskQueue.getActive();

    if (afterActive && (!beforeActive || beforeActive.id !== afterActive.id)) {
      agentEventSystem.emit(AGENT_EVENTS.TASK_STARTED, {
        sessionId: this.session!.id,
        task: afterActive,
        timestamp: new Date().toISOString(),
      });
    }

    updatedQueue
      .filter((task) => task.status === 'pending')
      .forEach((task) => {
        agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
          sessionId: this.session!.id,
          task,
          timestamp: new Date().toISOString(),
        });
      });

    if (updatedQueue.length > 0 && this.state === 'idle') {
      this.setState('executing');
    }

    return this.emit('tasks_updated');
  }

  async updateTask(taskId: string, updates: Partial<AgentTask>, options: UpdateTaskOptions = {}): Promise<AgentControllerSnapshot> {
    this.ensureSession();
    const previousTask = this.taskQueue.getAll().find((task) => task.id === taskId);
    const updated = this.taskQueue.updateTask(taskId, updates, options);

    if (!updated) {
      throw new Error(`Задача с идентификатором "${taskId}" не найдена`);
    }

    if (previousTask?.status !== updated.status) {
      if (updated.status === 'completed') {
        agentEventSystem.emit(AGENT_EVENTS.TASK_COMPLETED, {
          sessionId: this.session!.id,
          task: updated,
          timestamp: new Date().toISOString(),
        });
      } else if (updated.status === 'failed') {
        agentEventSystem.emit(AGENT_EVENTS.TASK_FAILED, {
          sessionId: this.session!.id,
          task: updated,
          timestamp: new Date().toISOString(),
        });
      } else if (updated.status === 'in_progress') {
        agentEventSystem.emit(AGENT_EVENTS.TASK_STARTED, {
          sessionId: this.session!.id,
          task: updated,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
        sessionId: this.session!.id,
        task: updated,
        timestamp: new Date().toISOString(),
      });
    }

    if (updated.status === 'completed') {
      this.actionCoordinator.clearActiveForTask(updated.id);
      // Fail-fast: не подавляем ошибку записи памяти
      await this.memoryManager.recordTaskCompletion(updated);
      await this.refreshMemoryStats();
    }

    if (!this.taskQueue.hasTasks()) {
      this.setState('idle');
    }

    return this.emit('tasks_updated');
  }

  removeTask(taskId: string): AgentControllerSnapshot {
    this.ensureSession();
    const removed = this.taskQueue.remove(taskId);
    if (!removed) {
      return this.getSnapshot();
    }

    agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
      sessionId: this.session!.id,
      task: removed,
      type: 'removed',
      timestamp: new Date().toISOString(),
    });

    if (!this.taskQueue.hasTasks()) {
      this.setState('idle');
    }

    return this.emit('tasks_updated');
  }

  clearQueue(): AgentControllerSnapshot {
    this.ensureSession();
    const removed = this.taskQueue.clear();
    if (removed.length > 0) {
      agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, {
        sessionId: this.session!.id,
        type: 'queue_cleared',
        timestamp: new Date().toISOString(),
      });
    }
    this.setState('idle');
    return this.emit('queue_flushed');
  }

  async executeFileOperation(
    task: AgentTask,
    operation: Parameters<ActionCoordinator['executeFileOperation']>[1],
    filePath: string,
    content?: string,
  ) {
    this.ensureSession();
    return this.actionCoordinator.executeFileOperation(task, operation, filePath, content);
  }

  async executeCode(task: AgentTask, code: string, language?: string) {
    this.ensureSession();
    return this.actionCoordinator.executeCode(task, code, language);
  }

  getActiveActions() {
    return this.actionCoordinator.getActiveActions();
  }

  getActionHistory() {
    return this.actionCoordinator.getActionHistory();
  }

  async clearCompletedActions() {
    this.actionCoordinator.clearCompletedActions();
    return this.emit('tasks_updated');
  }

  async refreshMemoryStats(): Promise<void> {
    if (!this.session) {
      this.memoryStats = null;
      return;
    }
    try {
      this.memoryStats = await this.memoryManager.getStats(this.session.id);
    } catch (error) {
      agentEventSystem.emit(AGENT_EVENTS.WARNING, {
        message: 'Не удалось обновить статистику памяти агента',
        source: 'agent-controller',
        error,
        scope: 'memory-stats',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private ensureSession(): string {
    if (!this.session) {
      throw new Error('AgentController не инициализирован. Вызовите initialize() перед использованием.');
    }
    return this.session.id;
  }

  private setState(state: AgentState, context: SnapshotContext = {}): void {
    if (this.state === state) return;
    this.state = state;
    if (!context.suppressEvents) {
      this.emit('state_changed');
      const sessionId = this.session ? this.session.id : 'unknown';
      agentEventSystem.emit(AGENT_EVENTS.STATE_CHANGED, {
        sessionId,
        state,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private buildSnapshot(): AgentControllerSnapshot {
    return {
      session: this.session,
      state: this.state,
      pendingPlan: this.planManager.getPendingPlan(),
      awaitingConfirmation: this.planManager.isAwaitingConfirmation(),
      queue: this.taskQueue.getAll(),
      activeTask: this.taskQueue.getActive(),
      memoryStats: this.memoryStats,
      lastUpdated: new Date(),
    };
  }

  private emit(event: AgentControllerEvent): AgentControllerSnapshot {
    const snapshot = this.buildSnapshot();
    this.lastSnapshot = snapshot;
    return this.events.emit(event, snapshot);
  }
}

export const agentController = new AgentController();
