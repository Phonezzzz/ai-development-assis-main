// Типы для системы управления моделями (упрощенная версия для ручного выбора)

export interface ModelPricing {
  prompt: number;
  completion: number;
}

export interface ModelCapabilities {
  chat: boolean;
  streaming: boolean;
  images: boolean;
  tools: boolean;
  embeddings: boolean;
  reasoning: boolean; // Поддержка chain-of-thought reasoning
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength: number;
  maxTokens: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  free: boolean;
  category: 'openrouter' | 'local';
  status: 'available' | 'unavailable' | 'error';
  lastChecked?: Date;
  errorMessage?: string;
}

export interface ModelValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ModelValidationResult {
  isValid: boolean;
  errors: ModelValidationError[];
  warnings: string[];
}

export interface ModelCache {
  models: Map<string, ModelInfo>;
  lastUpdated: Date;
  isLoading: boolean;
  error?: string;
}

export interface ModelManagerConfig {
  cacheTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  enableLogging: boolean;
}

export type ModelScope = 'chat' | 'workspace' | 'image-creator';

export enum ModelManagerEventType {
  CACHE_UPDATED = 'cache_updated',
  MODELS_REQUESTED = 'models_requested',
  MODELS_LOADED = 'models_loaded',
  MODEL_SELECTED = 'model_selected',
  MODEL_ERROR = 'model_error',
  REASONING_TOGGLED = 'reasoning_toggled',
  REASONING_HEALTH = 'reasoning_health',
  HEALTH_CHECK = 'health_check',
}

export type ReasoningHealthStatus = 'disabled' | 'idle' | 'active' | 'degraded' | 'error';

export type ModelHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'error';

export interface ModelHealthSnapshot {
  status: ModelHealthStatus;
  lastChecked: Date | null;
  lastUpdated: Date | null;
  consecutiveFailures: number;
  latencyMs?: number;
  error?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningState {
  enabled: boolean;
  modelId: string;
  lastToggled: Date | null;
  status: ReasoningHealthStatus;
  lastHealthCheck?: Date | null;
  latencyMs?: number;
  message?: string;
  error?: string;
}

export interface ModelOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface ModelManagerState {
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  cache: ModelCache;
  scopes: Record<ModelScope, ModelScopeState>;
}

export interface ModelScopeState {
  scope: ModelScope;
  availableModels: ModelInfo[];
  selectedModelId: string | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  cache: ModelCache;
  reasoning: ReasoningState;
  health: ModelHealthSnapshot;
}

// Типы для reasoning режима
export interface ReasoningConfig {
  enabled: boolean;
  modelId: string;
  showThinkingProcess: boolean;
  thinkingProcessStyle: 'expanded' | 'collapsed' | 'hidden';
  lastToggled?: Date;
}

export interface ChatMessageWithReasoning {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isVoice?: boolean;
  workspaceMode?: string;
  agentType?: string;
  reasoning?: {
    thinking: string;
    final: string;
    enabled: boolean;
  };
}

// Типы для событий менеджера моделей
export interface ModelManagerEvent {
  type: ModelManagerEventType;
  scope?: ModelScope;
  data: unknown;
  timestamp: Date;
}

// Несмотря на добавление новых событий, тип ModelManagerEventType остается тем же.

// Типы для логирования
export interface ModelLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
  timestamp: Date;
  operation: string;
  modelId?: string;
}

// Расширенные типы для совместимости с существующим кодом
export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength?: number;
  pricing?: ModelPricing;
  free?: boolean;
  supportsReasoning?: boolean; // Для обратной совместимости
}

// Типы ошибок
export class ModelManagerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ModelManagerError';
  }
}

export class ModelValidationErrorClass extends ModelManagerError {
  constructor(
    message: string,
    public validationErrors: ModelValidationError[]
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ModelValidationError';
  }
}

export class ModelCacheError extends ModelManagerError {
  constructor(message: string, public operation: string) {
    super(message, 'CACHE_ERROR');
    this.name = 'ModelCacheError';
  }
}

export class ReasoningError extends ModelManagerError {
  constructor(message: string, public modelId: string) {
    super(message, 'REASONING_ERROR');
    this.name = 'ReasoningError';
  }
}