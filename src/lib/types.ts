export type OperatingMode = 'chat' | 'image-creator' | 'workspace';

export type WorkspaceMode = 'ask' | 'plan' | 'act';
export type WorkMode = WorkspaceMode; // Alias for backward compatibility

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    prompt: number;
    completion: number;
  };
  free?: boolean;
  supportsReasoning?: boolean;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  workspaceMode?: WorkspaceMode;
  agentType?: string; // For specialized assistants (optional)
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  content?: string;
  lastModified: Date;
  metadata: {
    extension: string;
    language: string;
    isTextFile: boolean;
    isBinary: boolean;
    projectId: string;
    similarity?: number;
    [key: string]: string | number | boolean | undefined;
  };
}


export interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  confidence: number;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  timestamp: Date;
  isGenerating?: boolean;
}

// TODO System Types
export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  expectedResult?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  workspaceMode: WorkspaceMode;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  dependencies?: string[]; // IDs of other todos that must be completed first
  estimatedTime?: number; // minutes
  actualTime?: number; // minutes
  tags?: string[];
  result?: string; // What was actually accomplished
  error?: string; // Error message if failed
}

export interface TodoList {
  id: string;
  name: string;
  description?: string;
  items: TodoItem[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  projectContext?: string;
  totalEstimatedTime?: number;
  totalActualTime?: number;
}

export interface TodoContext {
  currentFile?: string;
  workingDirectory?: string;
  recentActions?: string[];
  variables?: Record<string, unknown>;
  sessionId?: string;
}

// Work Rules Types
export interface WorkRule {
  id: string;
  title: string;
  description: string;
  category: 'coding' | 'testing' | 'deployment' | 'documentation' | 'general';
  priority: 'high' | 'medium' | 'low';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  scope: 'global' | 'specific';
  modes?: OperatingMode[];
}

export interface WorkRulesSet {
  id: string;
  name: string;
  description?: string;
  rules: WorkRule[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Plan and SavePoint types
export interface PendingPlanTodo {
  title: string;
  description?: string;
  instructions?: string;
  expectedResult?: string;
  priority: 'low' | 'medium' | 'high';
  estimatedTime?: number;
  // Для отслеживания прогресса выполнения
  status?: 'pending' | 'done' | 'failed';
  resultSummary?: string; // Краткое описание результата (до 800 символов)
  startedAt?: number; // timestamp
  finishedAt?: number; // timestamp
}

export interface PendingPlan {
  id: string; // Уникальный ID плана
  planName: string;
  description: string;
  todos: PendingPlanTodo[];
}

// Результат выполнения отдельного шага плана
export interface StepRunResult {
  resultSummary: string; // 2-3 предложения без воды
  artifacts?: string[]; // Пути/имена созданных артефактов
  todoUpdate?: {
    done: boolean;
    notes?: string;
    itemsAdded?: string[];
  };
  errors?: string[]; // Ошибки, если были (пусто = успех)
}

export interface SavePoint {
  id: string;
  timestamp: Date;
  contextUsed: number;
  messagesCount: number;
  description: string;
  data?: {
    messages: Message[];
    currentMode: OperatingMode;
    currentWorkspaceMode: WorkspaceMode;
    pendingPlan: PendingPlan | null;
    sidebarCollapsed: boolean;
  };
}

// Todo Hook Return Type
export interface TodoHook {
  currentList: TodoList | null;
  todoLists: TodoList[];
  todoContext: TodoContext;
  createTodoList: (name: string, description?: string) => Promise<TodoList>;
  addTodoItem: (title: string, options?: Record<string, unknown>) => Promise<TodoItem | undefined>;
  updateTodoItem: (id: string, updates: Record<string, unknown>) => Promise<TodoItem | undefined>;
  deleteTodoItem: (id: string) => void;
  setCurrentTodoInProgress: (itemId: string) => Promise<void>;
  updateContext: (newContext: Partial<TodoContext>) => void;
  getCurrentItem: () => TodoItem | null;
  getNextItem: () => TodoItem | null;
  getCompletedCount: () => number;
  getTotalCount: () => number;
  getProgress: () => number;
  setCurrentList: (newValue: TodoList | null) => void;
}

// Agent Types for Autonomous Workspace Mode
export type AgentState = 'idle' | 'planning' | 'executing' | 'waiting' | 'error';

export interface AgentMessage extends Message {
  agentState?: AgentState;
  actionType?: 'initiate' | 'response' | 'error' | 'status';
  goal?: string;
  contextId?: string; // Для связывания с персистентной памятью
  metadata?: {
    sessionId?: string;
    taskId?: string;
    progress?: number;
    estimatedTime?: number;
  };
}

export interface AgentMemory {
  id: string;
  sessionId: string;
  context: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  type: 'goal' | 'observation' | 'action' | 'reflection';
  importance: number; // 1-10 scale
}

export interface AgentEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
  sessionId?: string;
}

export interface AgentStateMachine {
  currentState: AgentState;
  previousState: AgentState;
  transitions: Array<{
    from: AgentState;
    to: AgentState;
    condition?: string;
  }>;
  history: Array<{
    state: AgentState;
    timestamp: Date;
    reason?: string;
  }>;
}

export interface PersistentStorage {
  saveMemory(memory: AgentMemory): Promise<void>;
  loadMemory(sessionId: string): Promise<AgentMemory[]>;
  deleteMemory(memoryId: string): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  goal: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  estimatedTime?: number;
  actualTime?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
  sessionId: string; // Добавляем связь с сессией
}

export interface AgentSession {
  id: string;
  name: string;
  description?: string;
  state: AgentState;
  currentTask?: AgentTask;
  tasks: AgentTask[];
  memory: AgentMemory[];
  createdAt: Date;
  updatedAt: Date;
  contextWindow: number;
  contextUsed: number;
}