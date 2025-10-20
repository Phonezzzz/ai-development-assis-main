import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WorkspaceSession, WorkspaceSessionId } from '@/types/workspace';
import { getWorkspaceSessions } from '@/lib/services/workspace-api';

interface WorkspaceHistoryState {
  // State
  sessions: WorkspaceSession[];
  activeSessionId: WorkspaceSessionId | null;
  isLoading: boolean;
  
  // Actions
  fetchSessions: () => Promise<void>;
  setActiveSession: (sessionId: WorkspaceSessionId | null) => void;
  appendSession: (session: WorkspaceSession) => void;
  updateSession: (sessionId: WorkspaceSessionId, updates: Partial<Omit<WorkspaceSession, 'id' | 'createdAt'>>) => void;
  deleteSession: (sessionId: WorkspaceSessionId) => void;
  clearSessions: () => void;
}

export const useWorkspaceHistoryStore = create<WorkspaceHistoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      activeSessionId: null,
      isLoading: false,

      // Actions
      fetchSessions: async () => {
        set({ isLoading: true });
        try {
          const sessions = await getWorkspaceSessions();
          
          set({ sessions, isLoading: false });
        } catch (error) {
          console.error('Failed to fetch sessions:', JSON.stringify(error, null, 2));
          set({ isLoading: false });
        }
      },

      setActiveSession: (sessionId) => {
        set({ activeSessionId: sessionId });
      },

      appendSession: (session) => {
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        }));
      },

      updateSession: (sessionId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, ...updates, updatedAt: new Date().toISOString() }
              : session
          ),
        }));
      },

      deleteSession: (sessionId) => {
        set((state) => {
          const newSessions = state.sessions.filter(session => session.id !== sessionId);
          const newActiveSessionId = state.activeSessionId === sessionId
            ? (newSessions.length > 0 ? newSessions[0].id : null)
            : state.activeSessionId;
          
          return {
            sessions: newSessions,
            activeSessionId: newActiveSessionId,
          };
        });
      },

      clearSessions: () => {
        set({
          sessions: [],
          activeSessionId: null,
        });
      },
    }),
    {
      name: 'workspace-history-store',
      version: 1,
    }
  )
);