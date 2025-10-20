import { apiClient } from './api-client';
import { toast } from 'sonner';
import { WebSocketManager } from './websocket-manager';
import {
  WorkspaceSession,
  WorkspaceChatMessage,
  WorkspaceChatMessagePayload,
  WorkspaceStep,
  WorkspaceStepUpdatePayload,
  WorkspaceCheckpoint,
  WorkspaceCheckpointCreatePayload,
  WorkspaceStepsResponse,
  WorkspaceFileTree,
  WorkspaceFileData,
  WorkspaceTerminalSession,
  WorkspaceTerminalCommandPayload,
  WorkspaceTerminalCommandResponse,
  WorkspaceSessionId,
} from '../../types/workspace';

/**
 * Workspace API service for handling workspace-related operations
 */

// Создаем экземпляр WebSocketManager для всех WebSocket соединений
const wsManager = new WebSocketManager({
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  maxReconnectDelay: 30000
});

// Sessions
export const getWorkspaceSessions = async (): Promise<WorkspaceSession[]> => {
  const response = await apiClient.get<{ sessions: WorkspaceSession[] }>('/workspace/sessions');
  return response.sessions;
};

export const getWorkspaceChat = async (sessionId: WorkspaceSessionId): Promise<WorkspaceChatMessage[]> => {
  const response = await apiClient.get<{ messages: WorkspaceChatMessage[] }>(`/workspace/sessions/${sessionId}/chat`);
  return response.messages;
};

export const postWorkspaceMessage = async (
  sessionId: WorkspaceSessionId,
  message: WorkspaceChatMessagePayload
): Promise<WorkspaceChatMessage> => {
  const response = await apiClient.post<{ message: WorkspaceChatMessage }, WorkspaceChatMessagePayload>(
    `/workspace/sessions/${sessionId}/chat`,
    message
  );
  return response.message;
};

export const createWorkspaceSession = async (name: string, description?: string): Promise<WorkspaceSession> => {
  const response = await apiClient.post<{ session: WorkspaceSession }, { name: string; description?: string }>(
    '/workspace/sessions',
    { name, description }
  );
  return response.session;
};

export const deleteWorkspaceSession = async (sessionId: WorkspaceSessionId): Promise<void> => {
  await apiClient.del(`/workspace/sessions/${sessionId}`);
};

export const updateWorkspaceSession = async (
  sessionId: WorkspaceSessionId, 
  updates: { name?: string; description?: string; metadata?: Record<string, unknown> }
): Promise<WorkspaceSession> => {
  const response = await apiClient.put<{ session: WorkspaceSession }, typeof updates>(
    `/workspace/sessions/${sessionId}`,
    updates
  );
  return response.session;
};

// Steps and Checkpoints - TODO: Implement real endpoints
export const getWorkspaceSteps = async (sessionId: WorkspaceSessionId): Promise<WorkspaceStepsResponse> => {
  throw new Error('Not implemented yet');
};

export const putWorkspaceStep = async (
  stepId: string,
  update: WorkspaceStepUpdatePayload
): Promise<WorkspaceStep> => {
  throw new Error('Not implemented yet');
};

export const postWorkspaceCheckpoint = async (
  checkpoint: WorkspaceCheckpointCreatePayload
): Promise<WorkspaceCheckpoint> => {
  throw new Error('Not implemented yet');
};

// Files
export const getWorkspaceFile = async (path: string): Promise<WorkspaceFileData> => {
  const response = await apiClient.get<WorkspaceFileData>(`/files/content?path=${encodeURIComponent(path)}`);
  return response;
};

export const putWorkspaceFile = async (
  path: string,
  content: string
): Promise<WorkspaceFileData> => {
  const response = await apiClient.put<{ metadata: Record<string, unknown> }, { content: string }>(
    `/files?path=${encodeURIComponent(path)}`,
    { content }
  );
  return {
    path,
    content,
    encoding: 'utf-8',
    metadata: response.metadata
  } as WorkspaceFileData;
};

interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  extension?: string;
  children?: TreeNode[];
}

export const getWorkspaceFileTree = async (): Promise<WorkspaceFileTree> => {
  const response = await apiClient.get<{ tree: TreeNode }>(`/files/tree`);
  // Конвертируем формат ответа в WorkspaceFileTree
  const convertToWorkspaceFileTree = (node: TreeNode): WorkspaceFileTree => {
    if (node.type === 'directory' && node.children) {
      return [{
        path: node.path,
        name: node.name,
        type: 'directory',
        lastModified: node.mtimeMs ? new Date(node.mtimeMs).toISOString() : undefined,
        children: node.children.flatMap((child: TreeNode) => convertToWorkspaceFileTree(child))
      }];
    } else {
      return [{
        path: node.path,
        name: node.name,
        type: 'file',
        size: node.size,
        lastModified: node.mtimeMs ? new Date(node.mtimeMs).toISOString() : undefined,
        metadata: {
          extension: node.extension,
          language: node.extension
        }
      }];
    }
  };
  
  return convertToWorkspaceFileTree(response.tree).flat();
};

// Terminal - реальные API вызовы
export const postWorkspaceTerminalCommand = async (
  sessionId: WorkspaceSessionId,
  command: WorkspaceTerminalCommandPayload
): Promise<WorkspaceTerminalCommandResponse> => {
  const response = await apiClient.post<{ commandResponse: WorkspaceTerminalCommandResponse }, WorkspaceTerminalCommandPayload>(
    `/workspace/sessions/${sessionId}/terminal/command`,
    command
  );
  return response.commandResponse;
};

export const createWorkspaceTerminalSession = async (
  sessionId: WorkspaceSessionId
): Promise<WorkspaceTerminalSession> => {
  const response = await apiClient.post<{ terminalSession: WorkspaceTerminalSession }, {}>(
    `/workspace/sessions/${sessionId}/terminal/session`,
    {}
  );
  return response.terminalSession;
};

// WebSocket subscriptions - реальные реализации
export const subscribeToWorkspaceChat = (
  sessionId: WorkspaceSessionId,
  onMessage: (message: WorkspaceChatMessage) => void
): (() => void) => {
  const wsUrl = `ws://localhost:4000/ws/workspace/chat/${sessionId}`;
  
  const handleMessage = (message: any) => {
    if (message.type === 'message' && message.data) {
      onMessage(message.data);
    }
  };

  const handleError = (error: Event) => {
    console.error('WebSocket error:', error);
    toast.error('Соединение с workspace чатом недоступно', {
      description: 'Проверьте, что backend сервер запущен.',
    });
  };

  // Подключаемся и устанавливаем обработчики
  wsManager.connect(wsUrl).then(() => {
    console.log(`Connected to workspace chat for session: ${sessionId}`);
  }).catch(error => {
    console.error('Failed to connect to workspace chat:', error);
    handleError(error);
  });

  wsManager.onMessage(handleMessage);
  wsManager.onError(handleError);

  // Return unsubscribe function
  return () => {
    wsManager.removeMessageHandler(handleMessage);
    wsManager.removeErrorHandler(handleError);
    wsManager.close();
  };
};

export const subscribeToFileUpdates = (
  onUpdate: (event: { type: string; [key: string]: unknown }) => void
): (() => void) => {
  const wsUrl = `ws://localhost:4000/ws/files`;
  
  const handleMessage = (message: any) => {
    console.log('[WS][files] received message:', message);

    // Поддерживаем оба формата сообщений:
    // 1. {type: 'file-update', data: {...}} - старый формат
    // 2. {channel: 'files:update', payload: {...}} - формат от FileWatcher
    let eventData = null;

    if (message.type === 'file-update' || message.type === 'file-change') {
      // Старый формат
      eventData = message.data;
    } else if (message.channel === 'files:update' && message.payload) {
      // Новый формат от FileWatcher
      eventData = message.payload;
    }

    if (eventData) {
      console.log('[WS][files] processing file update:', eventData);
      onUpdate({
        type: 'file-update',
        ...(typeof eventData === 'object' && eventData !== null ? eventData : {})
      });
    } else {
      console.warn('[WS][files] unknown message format:', message);
    }
  };

  const handleError = (error: Event) => {
    console.error('[WS][files] error details', {
      error,
      timestamp: new Date().toISOString()
    });
    console.warn('⚠️ Workspace сервер недоступен');
  };

  // Подключаемся и устанавливаем обработчики
  wsManager.connect(wsUrl).then(() => {
    console.log('[WS][files] initiating connection', {
      wsUrl, timestamp: new Date().toISOString()
    });
  }).catch(error => {
    console.error('Failed to connect to file updates:', error);
    handleError(error);
  });

  wsManager.onMessage(handleMessage);
  wsManager.onError(handleError);

  // Return unsubscribe function
  return () => {
    wsManager.removeMessageHandler(handleMessage);
    wsManager.removeErrorHandler(handleError);
    wsManager.close();
  };
};

export const subscribeToTerminalEvents = (
  sessionId: WorkspaceSessionId,
  onEvent: (event: { type: string; [key: string]: unknown }) => void
): (() => void) => {
  const wsUrl = `ws://localhost:4000/ws/terminal/${sessionId}`;
  
  const handleMessage = (message: any) => {
    if (message.type === 'output' || message.type === 'status' || message.type === 'error') {
      onEvent(message);
    }
  };

  const handleError = (error: Event) => {
    console.error('Terminal events WebSocket error:', error);
    console.warn('⚠️ Terminal WebSocket недоступен');
  };

  // Подключаемся и устанавливаем обработчики
  wsManager.connect(wsUrl).then(() => {
    console.log(`✅ Connected to terminal events for session: ${sessionId}`);
  }).catch(error => {
    console.error('Failed to connect to terminal events:', error);
    handleError(error);
  });

  wsManager.onMessage(handleMessage);
  wsManager.onError(handleError);

  // Return unsubscribe function
  return () => {
    wsManager.removeMessageHandler(handleMessage);
    wsManager.removeErrorHandler(handleError);
    wsManager.close();
  };
};