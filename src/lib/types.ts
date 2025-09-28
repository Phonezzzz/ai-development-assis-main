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
}

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  workspaceMode?: WorkspaceMode;
  agentType?: string; // For agent messages
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  content?: string;
  lastModified: Date;
  metadata?: {
    extension?: string;
    language?: string;
    isTextFile?: boolean;
    isBinary?: boolean;
    projectId?: string;
    similarity?: number;
    [key: string]: any;
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
  variables?: Record<string, any>;
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
export interface PendingPlan {
  planName: string;
  description: string;
  todos: Array<{
    title: string;
    description?: string;
    instructions?: string;
    expectedResult?: string;
    priority: 'low' | 'medium' | 'high';
    estimatedTime?: number;
  }>;
}

export interface SavePoint {
  id: string;
  timestamp: Date;
  contextUsed: number;
  messagesCount: number;
  description: string;
}