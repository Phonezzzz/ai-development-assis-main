import type { AgentState, AgentTask, PendingPlan } from '@/lib/types';

export type AgentControllerEvent =
  | 'snapshot'
  | 'state_changed'
  | 'plan_pending'
  | 'plan_confirmed'
  | 'plan_rejected'
  | 'tasks_updated'
  | 'memory_updated'
  | 'queue_flushed';

export interface AgentControllerListener {
  (event: AgentControllerEvent, snapshot: AgentControllerSnapshot): void;
}

export interface AgentControllerSession {
  id: string;
  name?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMemoryStats {
  totalMemories: number;
  memoryByType: Record<string, number>;
  oldestMemory?: Date;
  newestMemory?: Date;
}

export interface AgentControllerSnapshot {
  session: AgentControllerSession | null;
  state: AgentState;
  pendingPlan: PendingPlan | null;
  awaitingConfirmation: boolean;
  queue: AgentTask[];
  activeTask: AgentTask | null;
  memoryStats: AgentMemoryStats | null;
  lastUpdated: Date;
}

export interface ConfirmPlanOptions {
  autoStart?: boolean;
}

export interface EnqueueTaskOptions {
  setActive?: boolean;
  preventDuplicates?: boolean;
}

export interface UpdateTaskOptions {
  suppressEvents?: boolean;
}