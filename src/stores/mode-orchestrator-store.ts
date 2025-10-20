import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Message, SavePoint } from '@/lib/types';

export type OperatingMode = 'chat' | 'workspace' | 'image-creator';
export type WorkspaceModeType = 'ask' | 'plan' | 'act';
export type PlanExecutionStatus = 'idle' | 'planning' | 'ready' | 'executing' | 'done';
export type PendingPlan = import('../lib/types').PendingPlan;

interface ChatNamespace {
  messages: Message[];
  awaitingConfirmation: boolean;
  currentQuery: string;
  pendingPlan: PendingPlan | null;
  savePoints: SavePoint[];
  planStatus: PlanExecutionStatus;
  currentStepIndex: number;
}

interface UiNamespace {
  currentMode: OperatingMode;
  currentWorkspaceMode: WorkspaceModeType;
  sidebarCollapsed: boolean;
  showImageGallery: boolean;
  showRoutingMonitor: boolean;
  showTestSuite: boolean;
}

interface ModeOrchestratorPersisted {
  chat: ChatNamespace;
  ui: UiNamespace;
}

interface ModeOrchestratorActions {
  setCurrentMode: (mode: OperatingMode) => void;
  setWorkspaceMode: (mode: WorkspaceModeType) => void;
  setSidebarCollapsed: (state: boolean) => void;
  toggleSidebar: () => void;
  setShowImageGallery: (state: boolean) => void;
  setShowRoutingMonitor: (state: boolean) => void;
  setShowTestSuite: (state: boolean) => void;
  setMessages: (messages: Message[]) => void;
  updateMessages: (updater: (prev: Message[]) => Message[]) => void;
  appendMessage: (message: Message) => void;
  clearMessages: () => void;
  setAwaitingConfirmation: (state: boolean) => void;
  setCurrentQuery: (value: string) => void;
  setPendingPlan: (plan: PendingPlan | null) => void;
  setPlanStatus: (status: PlanExecutionStatus) => void;
  setCurrentStepIndex: (index: number) => void;
  setSavePoints: (savePoints: SavePoint[]) => void;
  updateSavePoints: (updater: (prev: SavePoint[]) => SavePoint[]) => void;
  clearSavePoints: () => void;
  reset: () => void;
}

export interface ModeOrchestratorState {
  chat: ChatNamespace;
  ui: UiNamespace;
  actions: ModeOrchestratorActions;
}

const PERSIST_KEY = 'mode-orchestrator-store';
const PERSIST_VERSION = 1;

const OPERATING_MODES: OperatingMode[] = ['chat', 'workspace', 'image-creator'];
const WORKSPACE_MODES: WorkspaceModeType[] = ['ask', 'plan', 'act'];

const isOperatingMode = (value: unknown): value is OperatingMode =>
  typeof value === 'string' && OPERATING_MODES.includes(value as OperatingMode);

const isWorkspaceMode = (value: unknown): value is WorkspaceModeType =>
  typeof value === 'string' && WORKSPACE_MODES.includes(value as WorkspaceModeType);

const createInitialChatState = (): ChatNamespace => ({
  messages: [],
  awaitingConfirmation: false,
  currentQuery: '',
  pendingPlan: null,
  savePoints: [],
  planStatus: 'idle',
  currentStepIndex: 0,
});

const createInitialUiState = (): UiNamespace => ({
  currentMode: 'chat',
  currentWorkspaceMode: 'ask',
  sidebarCollapsed: false,
  showImageGallery: false,
  showRoutingMonitor: false,
  showTestSuite: false,
});

const reviveMessages = (messages: Message[] | undefined): Message[] => {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    ...message,
    timestamp:
      message.timestamp instanceof Date
        ? message.timestamp
        : new Date(message.timestamp as unknown as string),
  }));
};

const reviveSavePoints = (savePoints: SavePoint[] | undefined): SavePoint[] => {
  if (!Array.isArray(savePoints)) return [];
  return savePoints.map((point) => ({
    ...point,
    timestamp:
      point.timestamp instanceof Date
        ? point.timestamp
        : new Date(point.timestamp as unknown as string),
    data: point.data
      ? {
          ...point.data,
          messages: reviveMessages(point.data.messages as Message[] | undefined),
        }
      : point.data,
  }));
};

const createBatchedStorage = (delay = 150): Storage => {
  if (typeof window === 'undefined') {
    return {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    } as Storage;
  }

  const base = window.localStorage;
  const queue = new Map<string, string>();
  let timer: number | null = null;

  const flush = () => {
    queue.forEach((value, key) => base.setItem(key, value));
    queue.clear();
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleFlush = () => {
    if (timer !== null) return;
    timer = window.setTimeout(flush, delay);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
  }

  return {
    get length() {
      return base.length;
    },
    clear: () => {
      queue.clear();
      base.clear();
    },
    getItem: (key: string) => {
      if (queue.has(key)) {
        return queue.get(key) ?? null;
      }
      return base.getItem(key);
    },
    key: base.key.bind(base),
    removeItem: (key: string) => {
      queue.delete(key);
      base.removeItem(key);
    },
    setItem: (key: string, value: string) => {
      queue.set(key, value);
      scheduleFlush();
    },
  } as Storage;
};

const extractLegacyState = (): ModeOrchestratorPersisted | undefined => {
  if (typeof window === 'undefined') return undefined;

  try {
    const chat = createInitialChatState();
    const ui = createInitialUiState();
    let hasLegacyData = false;

    const readJson = <T>(key: string): T | undefined => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    };

    const readBoolean = (key: string): boolean | undefined => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      return raw === 'true';
    };

    const legacyMode = window.localStorage.getItem('current-mode');
    if (legacyMode && isOperatingMode(legacyMode)) {
      ui.currentMode = legacyMode;
      window.localStorage.removeItem('current-mode');
      hasLegacyData = true;
    }

    const legacyMessages = readJson<Message[]>('chat-messages');
    if (Array.isArray(legacyMessages)) {
      chat.messages = reviveMessages(legacyMessages);
      window.localStorage.removeItem('chat-messages');
      hasLegacyData = true;
    }

    const legacyPendingPlan = readJson<PendingPlan>('pending-plan');
    if (legacyPendingPlan !== undefined) {
      chat.pendingPlan = legacyPendingPlan;
      window.localStorage.removeItem('pending-plan');
      hasLegacyData = true;
    }

    const legacySavePoints = readJson<SavePoint[]>('context-save-points');
    if (Array.isArray(legacySavePoints)) {
      chat.savePoints = reviveSavePoints(legacySavePoints);
      window.localStorage.removeItem('context-save-points');
      hasLegacyData = true;
    }

    const legacySidebar = readBoolean('sidebar-collapsed');
    if (typeof legacySidebar === 'boolean') {
      ui.sidebarCollapsed = legacySidebar;
      window.localStorage.removeItem('sidebar-collapsed');
      hasLegacyData = true;
    }

    return hasLegacyData ? { chat, ui } : undefined;
  } catch (error) {
    console.warn('[ModeOrchestratorStore] Failed to extract legacy state', JSON.stringify(error, null, 2));
    return undefined;
  }
};

const migratePersistedState = (
  persistedState: unknown,
  version: number
): ModeOrchestratorPersisted => {
  const base: ModeOrchestratorPersisted = {
    chat: createInitialChatState(),
    ui: createInitialUiState(),
  };

  if (!persistedState) {
    const legacy = extractLegacyState();
    if (legacy) {
      return {
        chat: { ...base.chat, ...legacy.chat },
        ui: { ...base.ui, ...legacy.ui },
      };
    }
    return base;
  }

  if (version < PERSIST_VERSION) {
    const flat = persistedState as Record<string, unknown>;

    if (flat && !('chat' in flat) && !('ui' in flat)) {
      const chat: Partial<ChatNamespace> = {
        messages: reviveMessages(flat.messages as Message[] | undefined),
        pendingPlan: (flat.pendingPlan as PendingPlan | null) ?? base.chat.pendingPlan,
        savePoints: reviveSavePoints(flat.savePoints as SavePoint[] | undefined),
        awaitingConfirmation:
          typeof flat.awaitingConfirmation === 'boolean'
            ? (flat.awaitingConfirmation as boolean)
            : base.chat.awaitingConfirmation,
        currentQuery:
          typeof flat.currentQuery === 'string'
            ? (flat.currentQuery as string)
            : base.chat.currentQuery,
        planStatus: base.chat.planStatus,
        currentStepIndex: base.chat.currentStepIndex,
      };

      const ui: Partial<UiNamespace> = {
        currentMode: isOperatingMode(flat.currentMode)
          ? (flat.currentMode as OperatingMode)
          : base.ui.currentMode,
        currentWorkspaceMode: isWorkspaceMode(flat.currentWorkspaceMode)
          ? (flat.currentWorkspaceMode as WorkspaceModeType)
          : base.ui.currentWorkspaceMode,
        sidebarCollapsed:
          typeof flat.sidebarCollapsed === 'boolean'
            ? (flat.sidebarCollapsed as boolean)
            : base.ui.sidebarCollapsed,
        showImageGallery:
          typeof flat.showImageGallery === 'boolean'
            ? (flat.showImageGallery as boolean)
            : base.ui.showImageGallery,
        showRoutingMonitor:
          typeof flat.showRoutingMonitor === 'boolean'
            ? (flat.showRoutingMonitor as boolean)
            : base.ui.showRoutingMonitor,
        showTestSuite:
          typeof flat.showTestSuite === 'boolean'
            ? (flat.showTestSuite as boolean)
            : base.ui.showTestSuite,
      };

      return {
        chat: { ...base.chat, ...chat },
        ui: { ...base.ui, ...ui },
      };
    }
  }

  const typed = persistedState as Partial<ModeOrchestratorPersisted>;

  return {
    chat: {
      ...base.chat,
      ...typed.chat,
      messages: typed.chat ? reviveMessages(typed.chat.messages) : base.chat.messages,
      savePoints: typed.chat ? reviveSavePoints(typed.chat.savePoints) : base.chat.savePoints,
    },
    ui: {
      ...base.ui,
      ...typed.ui,
    },
  };
};

export const useModeOrchestratorStore = create<ModeOrchestratorState>()(
  persist(
    (set, get) => {
      const setChat = (updater: (prev: ChatNamespace) => ChatNamespace) =>
        set((state) => ({ chat: updater(state.chat) }));

      const setUi = (updater: (prev: UiNamespace) => UiNamespace) =>
        set((state) => ({ ui: updater(state.ui) }));

      return {
        chat: createInitialChatState(),
        ui: createInitialUiState(),
        actions: {
          setCurrentMode: (mode) =>
            setUi((ui) => ({
              ...ui,
              currentMode: mode,
            })),
          setWorkspaceMode: (mode) =>
            setUi((ui) => ({
              ...ui,
              currentWorkspaceMode: mode,
            })),
          setSidebarCollapsed: (stateValue) =>
            setUi((ui) => ({
              ...ui,
              sidebarCollapsed: stateValue,
            })),
          toggleSidebar: () =>
            setUi((ui) => ({
              ...ui,
              sidebarCollapsed: !ui.sidebarCollapsed,
            })),
          setShowImageGallery: (stateValue) =>
            setUi((ui) => ({
              ...ui,
              showImageGallery: stateValue,
            })),
          setShowRoutingMonitor: (stateValue) =>
            setUi((ui) => ({
              ...ui,
              showRoutingMonitor: stateValue,
            })),
          setShowTestSuite: (stateValue) =>
            setUi((ui) => ({
              ...ui,
              showTestSuite: stateValue,
            })),
          setMessages: (messages) =>
            setChat((chat) => ({
              ...chat,
              messages,
            })),
          updateMessages: (updater) =>
            setChat((chat) => ({
              ...chat,
              messages: updater(chat.messages),
            })),
          appendMessage: (message) =>
            setChat((chat) => ({
              ...chat,
              messages: [...chat.messages, message],
            })),
          clearMessages: () =>
            setChat((chat) => ({
              ...chat,
              messages: [],
            })),
          setAwaitingConfirmation: (stateValue) =>
            setChat((chat) => ({
              ...chat,
              awaitingConfirmation: stateValue,
            })),
          setCurrentQuery: (value) =>
            setChat((chat) => ({
              ...chat,
              currentQuery: value,
            })),
          setPendingPlan: (plan) =>
            setChat((chat) => ({
              ...chat,
              pendingPlan: plan,
            })),
          setPlanStatus: (status) =>
            setChat((chat) => ({
              ...chat,
              planStatus: status,
            })),
          setCurrentStepIndex: (index) =>
            setChat((chat) => ({
              ...chat,
              currentStepIndex: index,
            })),
          setSavePoints: (savePoints) =>
            setChat((chat) => ({
              ...chat,
              savePoints,
            })),
          updateSavePoints: (updater) =>
            setChat((chat) => ({
              ...chat,
              savePoints: updater(chat.savePoints),
            })),
          clearSavePoints: () =>
            setChat((chat) => ({
              ...chat,
              savePoints: [],
            })),
          reset: () =>
            set({
              chat: createInitialChatState(),
              ui: createInitialUiState(),
            }),
        },
      };
    },
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => createBatchedStorage()),
      partialize: (state) => ({
        chat: state.chat,
        ui: state.ui,
      }),
      migrate: (persistedState, version) => migratePersistedState(persistedState, version),
      merge: (persistedState, currentState) => {
        if (!persistedState) return currentState;
        const data = persistedState as ModeOrchestratorPersisted;

        return {
          ...currentState,
          chat: {
            ...currentState.chat,
            ...data.chat,
          },
          ui: {
            ...currentState.ui,
            ...data.ui,
          },
        };
      },
    }
  )
);