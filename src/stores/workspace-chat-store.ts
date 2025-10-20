import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  WorkspaceChatMessage,
  WorkspaceChatMessagePayload,
  WorkspaceStep,
  WorkspaceStepUpdatePayload,
  WorkspaceCheckpoint,
  WorkspaceCheckpointCreatePayload,
  WorkspaceSessionId,
} from '../types/workspace';
import { getWorkspaceChat, postWorkspaceMessage } from '../lib/services/workspace-api';

interface WorkspaceChatState {
  // State
  messages: WorkspaceChatMessage[];
  steps: WorkspaceStep[];
  checkpoints: WorkspaceCheckpoint[];
  isStreaming: boolean;
  currentSessionId: WorkspaceSessionId | null;
  
  // Actions
  loadSession: (sessionId: WorkspaceSessionId) => Promise<void>;
  sendMessage: (payload: WorkspaceChatMessagePayload) => Promise<void>;
  receiveMessage: (message: WorkspaceChatMessage) => void;
  setStreaming: (state: boolean) => void;
  addStep: (step: Omit<WorkspaceStep, 'id' | 'createdAt'>) => void;
  updateStep: (stepId: string, update: WorkspaceStepUpdatePayload) => void;
  addCheckpoint: (checkpoint: WorkspaceCheckpointCreatePayload) => void;
  clearSession: () => void;
}

export const useWorkspaceChatStore = create<WorkspaceChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      messages: [],
      steps: [],
      checkpoints: [],
      isStreaming: false,
      currentSessionId: null,

      // Actions
      loadSession: async (sessionId) => {
        try {
          console.log('Loading session:', JSON.stringify(sessionId, null, 2));
          set({ currentSessionId: sessionId });
          
          // Загружаем сообщения чата для сессии
          const messages = await getWorkspaceChat(sessionId);
          set({ messages });
        } catch (error) {
          console.error('Failed to load session:', JSON.stringify(error, null, 2));
          // В случае ошибки, все равно устанавливаем текущую сессию
          set({ currentSessionId: sessionId });
        }
      },

      sendMessage: async (payload) => {
        const { currentSessionId } = get();
        if (!currentSessionId) {
          console.error('No active session');
          return;
        }

        try {
          console.log('Sending message:', JSON.stringify(payload, null, 2));
          set({ isStreaming: true });
          
          // Отправляем сообщение через API
          const message = await postWorkspaceMessage(currentSessionId, payload);
          
          // Добавляем сообщение в локальное состояние
          set((state) => ({
            messages: [...state.messages, message],
            isStreaming: false,
          }));
        } catch (error) {
          console.error('Failed to send message:', JSON.stringify(error, null, 2));
          set({ isStreaming: false });
        }
      },

      receiveMessage: (message) => {
        set((state) => ({
          messages: [...state.messages, message],
          isStreaming: false,
        }));
      },

      setStreaming: (state) => {
        set({ isStreaming: state });
      },

      addStep: (step) => {
        const newStep: WorkspaceStep = {
          ...step,
          id: `step_${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          steps: [...state.steps, newStep],
        }));
      },

      updateStep: (stepId, update) => {
        set((state) => ({
          steps: state.steps.map((step) =>
            step.id === stepId
              ? { ...step, ...update, updatedAt: new Date().toISOString() }
              : step
          ),
        }));
      },

      addCheckpoint: (checkpoint) => {
        const newCheckpoint: WorkspaceCheckpoint = {
          ...checkpoint,
          id: `checkpoint_${Date.now()}`,
          sessionId: get().currentSessionId || '',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          checkpoints: [...state.checkpoints, newCheckpoint],
        }));
      },

      clearSession: () => {
        set({
          messages: [],
          steps: [],
          checkpoints: [],
          isStreaming: false,
          currentSessionId: null,
        });
      },
    }),
    {
      name: 'workspace-chat-store',
      partialize: (state) => ({
        currentSessionId: state.currentSessionId,
        // Don't persist messages, steps, checkpoints to avoid large storage
      }),
    }
  )
);