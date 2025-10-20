import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceLayoutState {
  // Layout state
  splitRatio: number;
  terminalHeight: number;
  filesVisible: boolean;
  terminalVisible: boolean;
  
  // Actions
  setSplitRatio: (ratio: number) => void;
  setTerminalHeight: (height: number) => void;
  setFilesVisible: (visible: boolean) => void;
  setTerminalVisible: (visible: boolean) => void;
  toggleFilesVisible: () => void;
  toggleTerminalVisible: () => void;
  loadFromStorage: () => void;
  persist: () => void;
}

export const useWorkspaceLayoutStore = create<WorkspaceLayoutState>()(
  persist(
    (set, get) => ({
      // Initial state
      splitRatio: 70, // 70% for main content, 30% for sidebar
      terminalHeight: 300, // pixels
      filesVisible: true,
      terminalVisible: true,

      // Actions
      setSplitRatio: (ratio) => {
        set({ splitRatio: Math.max(20, Math.min(80, ratio)) }); // Clamp between 20-80%
      },

      setTerminalHeight: (height) => {
        set({ terminalHeight: Math.max(200, Math.min(600, height)) }); // Clamp between 200-600px
      },

      setFilesVisible: (visible) => {
        set({ filesVisible: visible });
      },

      setTerminalVisible: (visible) => {
        set({ terminalVisible: visible });
      },

      toggleFilesVisible: () => {
        set((state) => ({ filesVisible: !state.filesVisible }));
      },

      toggleTerminalVisible: () => {
        set((state) => ({ terminalVisible: !state.terminalVisible }));
      },

      loadFromStorage: () => {
        // This is handled automatically by the persist middleware
        console.log('Loading layout state from storage');
      },

      persist: () => {
        // This is handled automatically by the persist middleware
        console.log('Persisting layout state');
      },
    }),
    {
      name: 'workspace-layout-store',
      version: 1,
    }
  )
);