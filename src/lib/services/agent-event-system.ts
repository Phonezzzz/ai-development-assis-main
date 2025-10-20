export const AGENT_EVENTS = {
  TASK_STARTED: 'agent:task:started',
  TASK_COMPLETED: 'agent:task:completed',
  TASK_FAILED: 'agent:task:failed',
  TASK_UPDATED: 'agent:task:updated',
  STATE_CHANGED: 'agent:state:changed',
  SESSION_CREATED: 'agent:session:created',
  SESSION_UPDATED: 'agent:session:updated',
  SESSION_CLEARED: 'agent:session:cleared',
  MEMORY_ADDED: 'agent:memory:added',
  MEMORY_SAVED: 'agent:memory:saved',
  MEMORY_DELETED: 'agent:memory:deleted',
  MEMORY_CLEARED: 'agent:memory:cleared',
  AUTONOMOUS_ACTION_STARTED: 'agent:autonomous_action:started',
  AUTONOMOUS_ACTION_COMPLETED: 'agent:autonomous_action:completed',
  AUTONOMOUS_ACTION_FAILED: 'agent:autonomous_action:failed',
  ERROR: 'agent:error',
  WARNING: 'agent:warning',
  MODEL_STATE_UPDATED: 'agent:model:state',
  MODEL_HEALTH_CHECK: 'agent:model:health',
} as const;

export type AgentEventType = typeof AGENT_EVENTS[keyof typeof AGENT_EVENTS];

export type AgentIssueLevel = 'error' | 'warning';

export interface AgentIssueEvent {
  level: AgentIssueLevel;
  message: string;
  description?: string;
  source?: string;
  scope?: string;
  context?: Record<string, unknown>;
  error?: unknown;
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: string;
}

export type AgentIssueEventPayload = Omit<AgentIssueEvent, 'level' | 'timestamp'> & {
  timestamp?: string;
};

export class AgentEventSystem {
  private listeners: Map<AgentEventType, Function[]> = new Map();

  on(eventType: AgentEventType, callback: Function): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  off(eventType: AgentEventType, callback: Function): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(eventType: AgentEventType, payload?: unknown): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in event handler for ${eventType}:`, JSON.stringify(error, null, 2));
        }
      });
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export const agentEventSystem = new AgentEventSystem();

function normalizeIssueEvent(level: AgentIssueLevel, payload: AgentIssueEventPayload): AgentIssueEvent {
  return {
    level,
    message: payload.message || 'Неизвестное событие агента',
    description: payload.description,
    source: payload.source,
    scope: payload.scope,
    context: payload.context,
    error: payload.error,
    action: payload.action,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

export function emitAgentError(payload: AgentIssueEventPayload): void {
  agentEventSystem.emit(AGENT_EVENTS.ERROR, normalizeIssueEvent('error', payload));
}

export function emitAgentWarning(payload: AgentIssueEventPayload): void {
  agentEventSystem.emit(AGENT_EVENTS.WARNING, normalizeIssueEvent('warning', payload));
}