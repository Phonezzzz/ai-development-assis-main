import { useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  createWorkspaceTerminalSession,
  postWorkspaceTerminalCommand,
  subscribeToTerminalEvents,
} from '@/lib/services/workspace-api';
import type {
  WorkspaceSessionId,
  WorkspaceTerminalSession,
  WorkspaceTerminalCommandPayload,
  WorkspaceTerminalEvent,
} from '@/types/workspace';

interface TerminalCommand {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  timestamp: string;
  isExecuting: boolean;
}

interface UseWorkspaceTerminalReturn {
  // State
  session: WorkspaceTerminalSession | null;
  commands: TerminalCommand[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  
  // Actions
  createSession: (sessionId: WorkspaceSessionId) => Promise<void>;
  sendCommand: (command: string, workingDirectory?: string) => Promise<void>;
  clearCommands: () => void;
  reconnect: () => void;
}

export function useWorkspaceTerminal(): UseWorkspaceTerminalReturn {
  const [session, setSession] = useState<WorkspaceTerminalSession | null>(null);
  const [commands, setCommands] = useState<TerminalCommand[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // WebSocket connection state
  const [wsConnection, setWsConnection] = useState<(() => void) | null>(null);

  const createSession = useCallback(async (sessionId: WorkspaceSessionId) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const terminalSession = await createWorkspaceTerminalSession(sessionId);
      setSession(terminalSession);
      
      // Subscribe to terminal events
      const unsubscribe = subscribeToTerminalEvents(sessionId, (event: WorkspaceTerminalEvent) => {
        handleTerminalEvent(event);
      });
      
      setWsConnection(() => unsubscribe);
      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create terminal session'));
      console.error('Failed to create terminal session:', JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendCommand = useCallback(async (command: string, workingDirectory?: string) => {
    if (!session) {
      throw new Error('No active terminal session');
    }

    const commandId = `cmd_${Date.now()}`;

    try {
      setError(null);
      
      // Create optimistic command
      const newCommand: TerminalCommand = {
        id: commandId,
        command,
        output: '',
        isExecuting: true,
        timestamp: new Date().toISOString(),
      };

      setCommands(prev => [...prev, newCommand]);

      // Send command to API
      const payload: WorkspaceTerminalCommandPayload = {
        command,
        workingDirectory,
        metadata: { clientId: commandId },
      };

      await postWorkspaceTerminalCommand(session.sessionId, payload);
      
      // Note: The actual output will come via WebSocket events
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to send command'));
      console.error('Failed to send command:', JSON.stringify(err, null, 2));
      
      // Mark command as failed
      setCommands(prev =>
        prev.map(cmd =>
          cmd.id === commandId
            ? { ...cmd, isExecuting: false, exitCode: 1, output: `Error: ${err}` }
            : cmd
        )
      );
    }
  }, [session]);

  const handleTerminalEvent = useCallback((event: WorkspaceTerminalEvent) => {
    switch (event.type) {
      case 'output':
        setCommands(prev =>
          prev.map(cmd =>
            cmd.id === event.commandId
              ? {
                  ...cmd,
                  output: cmd.output + event.content,
                  exitCode: event.exitCode,
                  isExecuting: event.exitCode === undefined,
                }
              : cmd
          )
        );
        break;

      case 'status':
        if (event.status === 'error') {
          setError(new Error(event.message || 'Terminal error occurred'));
        }
        break;

      case 'heartbeat':
        // Keep connection alive, no action needed
        break;

      default:
        console.warn('Unknown terminal event type:', JSON.stringify(event, null, 2));
    }
  }, []);

  const clearCommands = useCallback(() => {
    setCommands([]);
  }, []);

  const reconnect = useCallback(() => {
    if (session && !isConnected) {
      createSession(session.sessionId);
    }
  }, [session, isConnected, createSession]);

  // Cleanup WebSocket connection on unmount
  useEffect(() => {
    return () => {
      if (wsConnection) {
        wsConnection();
      }
    };
  }, [wsConnection]);

  // Auto-reconnect logic
  useEffect(() => {
    if (!isConnected && session && !isLoading) {
      const timeout = setTimeout(() => {
        reconnect();
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [isConnected, session, isLoading, reconnect]);

  return {
    session,
    commands,
    isConnected,
    isLoading,
    error,
    createSession,
    sendCommand,
    clearCommands,
    reconnect,
  };
}