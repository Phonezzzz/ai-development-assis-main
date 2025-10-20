import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EditorTab {
  id: string;
  filePath: string;
  content: string;
  isDirty: boolean;
  language?: string;
  lastSaved?: string;
}

interface EditorTabsState {
  // State
  tabs: EditorTab[];
  activeTabId: string | null;
  
  // Actions
  openTab: (tab: Omit<EditorTab, 'id' | 'isDirty'> & { id?: string }) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  updateContent: (tabId: string, content: string) => void;
  markSaved: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  getActiveTab: () => EditorTab | null;
  hasUnsavedChanges: () => boolean;
}

export const useEditorTabsStore = create<EditorTabsState>()(
  persist(
    (set, get) => ({
      // Initial state
      tabs: [],
      activeTabId: null,

      // Actions
      openTab: (tabData) => {
        const { tabs } = get();
        const existingTab = tabs.find(tab => tab.filePath === tabData.filePath);
        
        if (existingTab) {
          // Tab already exists, just activate it
          set({ activeTabId: existingTab.id });
          return;
        }

        const newTab: EditorTab = {
          id: tabData.id || `tab_${Date.now()}`,
          filePath: tabData.filePath,
          content: tabData.content,
          isDirty: false,
          language: tabData.language,
          lastSaved: tabData.lastSaved,
        };

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }));
      },

      closeTab: (tabId) => {
        set((state) => {
          const newTabs = state.tabs.filter(tab => tab.id !== tabId);
          let newActiveTabId = state.activeTabId;

          // If we're closing the active tab, set new active tab
          if (state.activeTabId === tabId) {
            const currentIndex = state.tabs.findIndex(tab => tab.id === tabId);
            const nextTab = newTabs[currentIndex] || newTabs[currentIndex - 1] || null;
            newActiveTabId = nextTab ? nextTab.id : null;
          }

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      updateContent: (tabId, content) => {
        set((state) => ({
          tabs: state.tabs.map(tab =>
            tab.id === tabId
              ? { ...tab, content, isDirty: true }
              : tab
          ),
        }));
      },

      markSaved: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map(tab =>
            tab.id === tabId
              ? { ...tab, isDirty: false, lastSaved: new Date().toISOString() }
              : tab
          ),
        }));
      },

      closeAllTabs: () => {
        set({
          tabs: [],
          activeTabId: null,
        });
      },

      closeOtherTabs: (tabId) => {
        set((state) => ({
          tabs: state.tabs.filter(tab => tab.id === tabId),
          activeTabId: tabId,
        }));
      },

      closeTabsToRight: (tabId) => {
        set((state) => {
          const tabIndex = state.tabs.findIndex(tab => tab.id === tabId);
          if (tabIndex === -1) return state;

          const newTabs = state.tabs.slice(0, tabIndex + 1);
          const lastTab = newTabs.length > 0 ? newTabs[newTabs.length - 1] : null;
          const newActiveTabId = state.activeTabId && newTabs.some(tab => tab.id === state.activeTabId)
            ? state.activeTabId
            : (lastTab ? lastTab.id : null);

          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          };
        });
      },

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find(tab => tab.id === activeTabId) || null;
      },

      hasUnsavedChanges: () => {
        const { tabs } = get();
        return tabs.some(tab => tab.isDirty);
      },
    }),
    {
      name: 'editor-tabs-store',
      version: 1,
      partialize: (state) => ({
        // Only persist tabs and activeTabId, not content to avoid large storage
        tabs: state.tabs.map(tab => ({
          ...tab,
          content: '', // Don't persist content to avoid large storage
        })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);