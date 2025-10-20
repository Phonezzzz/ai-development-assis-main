import { useEffect } from 'react';
import useSWR from 'swr';
import { useWorkspaceChatStore } from '../stores/workspace-chat-store';
import {
  getWorkspaceChat,
  postWorkspaceMessage,
  subscribeToWorkspaceChat,
} from '../lib/services/workspace-api';
import type { WorkspaceSessionId, WorkspaceChatMessagePayload } from '../types/workspace';

export function useWorkspaceChat(sessionId: WorkspaceSessionId | null) {
  const {
    messages,
    isStreaming,
    currentSessionId,
    loadSession,
    sendMessage: storeSendMessage,
    receiveMessage,
    setStreaming,
  } = useWorkspaceChatStore();

  // Fetch chat messages when session changes
  const { data: fetchedMessages, error, isLoading, mutate } = useSWR(
    sessionId ? `/api/workspace/sessions/${sessionId}/chat` : null,
    () => sessionId ? getWorkspaceChat(sessionId) : [],
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // Update store when messages are fetched
  useEffect(() => {
    if (fetchedMessages && sessionId) {
      // Clear existing messages and add fetched ones
      useWorkspaceChatStore.setState({ messages: fetchedMessages });
    }
  }, [fetchedMessages, sessionId]);

  // Load session when sessionId changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, currentSessionId, loadSession]);

  // Subscribe to WebSocket for real-time messages
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribeToWorkspaceChat(sessionId, (message) => {
      receiveMessage(message);
      // Revalidate to ensure we have the latest data
      mutate();
    });

    return unsubscribe;
  }, [sessionId, receiveMessage, mutate]);

  const sendMessage = async (payload: WorkspaceChatMessagePayload) => {
    if (!sessionId) {
      throw new Error('No active session');
    }

    try {
      setStreaming(true);
      
      // Optimistically add user message to store
      const userMessage = {
        id: `temp_${Date.now()}`,
        sessionId,
        role: 'user' as const,
        content: payload.content,
        createdAt: new Date().toISOString(),
        metadata: payload.metadata,
      };
      receiveMessage(userMessage);

      // Send message to API
      const response = await postWorkspaceMessage(sessionId, payload);
      
      // Replace temporary message with server response
      useWorkspaceChatStore.setState(state => ({
        messages: state.messages
          .filter(msg => msg.id !== userMessage.id)
          .concat(response),
      }));

      // Revalidate to ensure consistency
      await mutate();
    } catch (error) {
      console.error('Failed to send message:', JSON.stringify(error, null, 2));
      // Remove optimistic message on error
      useWorkspaceChatStore.setState(state => ({
        messages: state.messages.filter(msg => !msg.id.startsWith('temp_')),
      }));
      throw error;
    } finally {
      setStreaming(false);
    }
  };

  return {
    messages,
    isStreaming,
    isLoading: isLoading || isStreaming,
    error,
    sendMessage,
    refresh: mutate,
  };
}