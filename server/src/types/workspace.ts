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

export interface WorkspaceTerminalSession {
  id: string;
  sessionId: string;
  createdAt: string;
  status: 'active' | 'closed';
  metadata?: Record<string, unknown>;
}

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