export type WorkspaceChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface WorkspaceChatMessage {
  id: string;
  sessionId: string;
  role: WorkspaceChatRole;
  content: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceChatMessagePayload {
  role: Extract<WorkspaceChatRole, 'user' | 'system'>;
  content: string;
  metadata?: Record<string, unknown>;
}

export type WorkspaceStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface WorkspaceStep {
  id: string;
  sessionId: string;
  title: string;
  description?: string;
  status: WorkspaceStepStatus;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export type WorkspaceStepUpdatePayload = Partial<Omit<WorkspaceStep, 'id' | 'sessionId' | 'createdAt'>> & {
  metadata?: Record<string, unknown>;
};

export interface WorkspaceCheckpoint {
  id: string;
  sessionId: string;
  stepId?: string;
  label: string;
  summary?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceCheckpointCreatePayload {
  stepId?: string;
  label: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceStepsResponse {
  steps: WorkspaceStep[];
  checkpoints: WorkspaceCheckpoint[];
}

export interface WorkspaceSession {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string;
  metadata?: Record<string, unknown>;
}

export type WorkspaceSessionId = WorkspaceSession['id'];

export interface WorkspaceFileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: string;
  children?: WorkspaceFileNode[];
  metadata?: Record<string, unknown>;
}

export type WorkspaceFileTree = WorkspaceFileNode[];

export interface WorkspaceFileTreeEvent {
  type: 'created' | 'updated' | 'deleted' | 'refresh';
  node?: WorkspaceFileNode;
  path?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceFileData {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64' | string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceTerminalSession {
  id: string;
  sessionId: string;
  createdAt: string;
  status: 'active' | 'closed';
  metadata?: Record<string, unknown>;
}

export type WorkspaceTerminalEvent =
  | {
      type: 'output';
      commandId: string;
      content: string;
      exitCode?: number;
      timestamp: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'status';
      status: 'started' | 'finished' | 'error';
      message?: string;
      timestamp: string;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'heartbeat';
      timestamp: string;
      metadata?: Record<string, unknown>;
    };

export interface WorkspaceTerminalCommandPayload {
  command: string;
  workingDirectory?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceTerminalCommandResponse {
  commandId: string;
  acknowledgedAt: string;
  metadata?: Record<string, unknown>;
}