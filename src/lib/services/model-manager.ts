import {
  ModelInfo,
  ModelValidationResult,
  ModelValidationError,
  ModelManagerConfig,
  ModelManagerState,
  ModelOperationResult,
  ModelScope,
  ModelManagerEvent,
  ModelLogEntry,
  ModelOption,
  ModelManagerError,
  ModelValidationError as ModelValidationErrorClass,
  ModelCacheError,
  ReasoningError,
  ReasoningConfig,
  ReasoningState,
  ModelManagerEventType,
  ModelScopeState,
  ModelHealthSnapshot,
  ModelHealthStatus,
  ReasoningHealthStatus,
  ModelCache,
} from '@/lib/types/models';
import { openRouterService, Model } from '@/lib/services/openrouter';
import { agentEventSystem, AGENT_EVENTS } from '@/lib/services/agent-event-system';
import { DataMigrator } from '@/lib/data-migrator';
import { AsyncDeduplicator } from '@/lib/utils/async-deduplicator';

const DEFAULT_SCOPE: ModelScope = 'chat';
const ALL_SCOPES: ModelScope[] = ['chat', 'workspace', 'image-creator'];

type ScopeStateMap = Record<ModelScope, ModelScopeState>;
type ScopeReasoningConfigMap = Record<ModelScope, ReasoningConfig>;

interface ReasoningHealthUpdate {
  status: ReasoningHealthStatus;
  latencyMs?: number;
  message?: string;
  error?: string;
  timestamp?: Date;
}

interface HealthCheckUpdate {
  status?: ModelHealthStatus;
  latencyMs?: number;
  error?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Упрощенный менеджер моделей с единым кэшем
 */
export class ModelManager {
  private state: ModelManagerState;
  private config: ModelManagerConfig;
  private listeners: Map<string, (event: ModelManagerEvent) => void> = new Map();
  private logBuffer: ModelLogEntry[] = [];
  private readonly maxLogEntries = 1000;
  private reasoningConfig: ScopeReasoningConfigMap;
  private modelLoader = new AsyncDeduplicator<ModelInfo[]>();

  constructor(config?: Partial<ModelManagerConfig>) {
    this.config = {
      cacheTimeoutMs: 5 * 60 * 1000, // 5 минут
      retryAttempts: 3,
      retryDelayMs: 1000,
      enableLogging: true,
      ...config,
    };

    const initialScopes = this.initializeScopeStates();

    this.state = {
      availableModels: [],
      selectedModelId: null,
      isLoading: false,
      error: null,
      lastRefresh: null,
      cache: this.createEmptyCache(),
      scopes: initialScopes,
    };

    this.reasoningConfig = this.loadReasoningConfig();
    this.applyReasoningConfigToScopes();

    this.log('info', 'ModelManager инициализирован', { config: this.config });

    this.modelLoader = new AsyncDeduplicator<ModelInfo[]>();
  }

  /**
   * Получение всех доступных моделей с кэшированием
   */
  async getModels(scope: ModelScope = DEFAULT_SCOPE, forceRefresh = false): Promise<ModelOperationResult<ModelInfo[]>> {
    const operation = 'getModels';
    const scopeState = this.getScopeState(scope);

    try {
      this.log('info', 'Запрос моделей', { scope, forceRefresh });

      // Используем единый кэш вместо дублирования
      if (!forceRefresh && this.isCacheValid(this.state.cache)) {
        const models = Array.from(this.state.cache.models.values());
        this.log('info', 'Модели загружены из единого кэша', { scope, count: models.length });
        return({
          success: true,
          data: models,
          timestamp: new Date(),
        });
      }

      const models = await this.modelLoader.dedupe(scope, async () => {
        this.state.isLoading = true;
        this.state.cache.isLoading = true;
        this.emitEvent(ModelManagerEventType.MODELS_REQUESTED, scope, { forceRefresh });

        const result = await this.loadModelsWithRetry();
        this.applyModelsToCache(result);

        this.state.isLoading = false;
        this.state.cache.isLoading = false;

        this.log('info', 'Модели успешно загружены', { scope, count: result.length });
        this.emitEvent(ModelManagerEventType.MODELS_LOADED, scope, { models: result, count: result.length });

        return result;
      });

      return({
        success: true,
        data: models,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage = this.handleError(error, operation);
      scopeState.error = errorMessage;
      scopeState.isLoading = false;
      this.state.error = errorMessage;
      this.state.isLoading = false;
      this.state.cache.isLoading = false;

      this.log('error', 'Ошибка загрузки моделей', { scope, error: errorMessage });
      this.emitEvent(ModelManagerEventType.MODEL_ERROR, scope, { error: errorMessage });

      return{
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Получение модели по ID
   */
  async getModelById(modelId: string, scope: ModelScope = DEFAULT_SCOPE): Promise<ModelOperationResult<ModelInfo | null>> {
    const operation = 'getModelById';
    let cachedValue;

    try {
      this.log('info', 'Получение модели по ID', { scope, modelId });

      const cachedModels = Array.from(this.state.cache.models.values());
      cachedValue = cachedModels.find((m) => m.id === modelId);

      if (cachedValue) {
        this.log('info', 'Модель найдена в кэше', { scope, modelId });
        return({
          success: true,
          data: cachedValue,
          timestamp: new Date(),
        });
      }

      await this.getModels(scope);

      const model = this.state.availableModels.find((m) => m.id === modelId) || null;

      if (!model) {
        this.log('warn', 'Модель не найдена', {
          scope,
          modelId,
          availableModelsCount: this.state.availableModels.length,
        });
      }

      return({
        success: true,
        data: model,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage = this.handleError(error, operation);
      this.log('error', 'Ошибка получения модели', { scope, error: errorMessage, modelId });

      return{
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Установка выбранной модели
   */
  setSelectedModel(modelId: string, scope: ModelScope = DEFAULT_SCOPE): ModelOperationResult<boolean> {
    const operation = 'setSelectedModel';

    try {
      this.log('info', 'Установка выбранной модели', {
        scope,
        modelId,
        availableModelsCount: this.state.availableModels.length,
      });

      const model = this.state.availableModels.find((m) => m.id === modelId);

      if (!model) {
        this.log('error', 'Модель не найдена', {
          scope,
          modelId,
          availableModelsCount: this.state.availableModels.length,
        });

        return({
          success: false,
          error: 'Модель не найдена',
          timestamp: new Date(),
        });
      }

      const scopeState = this.getScopeState(scope);
      scopeState.selectedModelId = modelId;
      
      // Сохраняем в localStorage через DataMigrator
      DataMigrator.updateModels({
        selected: {
          ...DataMigrator.getData().models.selected,
          [scope]: modelId
        }
      });

      if (!model.capabilities.reasoning && scopeState.reasoning.enabled) {
        this.setReasoningEnabled(false, modelId, scope);
      }

      this.emitEvent(ModelManagerEventType.MODEL_SELECTED, scope, { model, manual: true });

      this.log('info', 'Модель установлена', { scope, modelId, name: model.name });

      return({
        success: true,
        data: true,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage = this.handleError(error, operation);
      this.log('error', 'Ошибка установки модели', { scope, error: errorMessage, modelId });

      return({
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Получение текущей выбранной модели
   */
  getCurrentModel(scope: ModelScope = DEFAULT_SCOPE): ModelInfo | null {
    const scopeState = this.getScopeState(scope);
    if (!scopeState.selectedModelId) return null;
    return this.state.availableModels.find((m) => m.id === scopeState.selectedModelId) || null;
  }

  /**
   * Проверка поддерживает ли модель reasoning
   */
  supportsReasoning(modelId?: string, scope: ModelScope = DEFAULT_SCOPE): boolean {
    const model = modelId
      ? this.state.availableModels.find((m) => m.id === modelId)
      : this.getCurrentModel(scope);

    if (!model) {
      return false;
    }
    return model.capabilities.reasoning || false;
  }

  /**
   * Включение/выключение reasoning режима
   */
  setReasoningEnabled(
    enabled: boolean,
    modelId?: string,
    scope: ModelScope = DEFAULT_SCOPE
  ): ModelOperationResult<boolean> {
    const operation = 'setReasoningEnabled';
    const scopeState = this.getScopeState(scope);
    const targetModelId = modelId || scopeState.selectedModelId;

    try {
      if (!modelId) {
        throw new ReasoningError('Не выбрана модель', '');
      }

      const model = this.state.availableModels.find((m) => m.id === modelId);

      if (!model) {
        throw new ReasoningError('Модель не найдена', modelId);
      }

      if (enabled && !model.capabilities.reasoning) {
        throw new ReasoningError(`Модель ${model.name} не поддерживает reasoning режим`, modelId);
      }

      const config = this.reasoningConfig[scope];
      config.enabled = enabled;
      config.modelId = modelId;
      config.lastToggled = new Date();

      const reasoningState = scopeState.reasoning;
      reasoningState.enabled = enabled;
      reasoningState.modelId = modelId;
      reasoningState.lastToggled = config.lastToggled;
      reasoningState.status = enabled ? 'active' : 'disabled';
      reasoningState.error = undefined;
      reasoningState.message = undefined;
      reasoningState.latencyMs = undefined;
      reasoningState.lastHealthCheck = enabled ? new Date() : null;

      this.saveReasoningConfig();

      this.log('info', 'Reasoning режим изменен', {
        scope,
        enabled,
        modelId: modelId,
        modelName: model.name,
      });

      this.emitEvent(ModelManagerEventType.REASONING_TOGGLED, scope, {
        enabled,
        modelId: modelId,
        model,
      });

      return({
        success: true,
        data: enabled,
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage = this.handleError(error, operation);
      this.log('error', 'Ошибка изменения reasoning режима', {
        scope,
        error: errorMessage,
        enabled,
        modelId: modelId,
      });

      return({
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Получение конфигурации reasoning (персистентной) для scope
   */
  getReasoningConfig(scope: ModelScope = DEFAULT_SCOPE): ReasoningConfig {
    const config = this.reasoningConfig[scope];
    return {
      enabled: config.enabled,
      modelId: config.modelId,
      showThinkingProcess: config.showThinkingProcess,
      thinkingProcessStyle: config.thinkingProcessStyle,
      lastToggled: config.lastToggled,
    };
  }

  /**
   * Получение runtime-состояния reasoning
   */
  getReasoningState(scope: ModelScope = DEFAULT_SCOPE): ReasoningState {
    const scopeState = this.getScopeState(scope);
    return { ...scopeState.reasoning };
  }

  /**
   * Установка стиля отображения процесса мышления
   */
  setReasoningDisplayStyle(
    style: 'expanded' | 'collapsed' | 'hidden',
    scope: ModelScope = DEFAULT_SCOPE
  ): void {
    const config = this.reasoningConfig[scope];
    config.thinkingProcessStyle = style;
    this.saveReasoningConfig();
    this.log('info', 'Изменен стиль отображения reasoning', { scope, style });
  }

  /**
   * Запись статуса reasoning health
   */
  reportReasoningHealth(scope: ModelScope, update: ReasoningHealthUpdate): void {
    const scopeState = this.getScopeState(scope);
    const timestamp = update.timestamp ?? new Date();

    scopeState.reasoning.status = update.status;
    scopeState.reasoning.lastHealthCheck = timestamp;
    scopeState.reasoning.latencyMs = update.latencyMs;
    scopeState.reasoning.message = update.message;
    scopeState.reasoning.error = update.error;

    this.emitEvent(ModelManagerEventType.REASONING_HEALTH, scope, {
      status: update.status,
      latencyMs: update.latencyMs,
      message: update.message,
      error: update.error,
      timestamp,
    });
  }

  /**
   * Инициировать health-check модели
   */
  triggerHealthCheck(scope: ModelScope = DEFAULT_SCOPE, update?: HealthCheckUpdate): ModelHealthSnapshot {
    const scopeState = this.getScopeState(scope);
    const timestamp = update && update.timestamp ? update.timestamp : new Date();

    scopeState.health.lastChecked = timestamp;
    if (update) {
      if (update.status) {
        scopeState.health.status = update.status;
      }
      if (typeof update.latencyMs === 'number') {
        scopeState.health.latencyMs = update.latencyMs;
      }
      if (update.error !== undefined) {
        scopeState.health.error = update.error;
      }
      if (update.reason !== undefined) {
        scopeState.health.reason = update.reason;
      }
      if (update.metadata) {
        scopeState.health.metadata = {
          ...scopeState.health.metadata,
          ...update.metadata,
        };
      }
    }

    this.emitEvent(ModelManagerEventType.HEALTH_CHECK, scope, {
      health: { ...scopeState.health },
      timestamp,
    });

    return { ...scopeState.health };
  }

  /**
   * Получить health snapshot
   */
  getHealthSnapshot(scope: ModelScope = DEFAULT_SCOPE): ModelHealthSnapshot {
    const scopeState = this.getScopeState(scope);
    return { ...scopeState.health };
  }

  /**
   * Валидация модели
   */
  validateModel(model: ModelInfo): ModelValidationResult {
    const errors: ModelValidationError[] = [];
    const warnings: string[] = [];

    if (!model.id || model.id.trim() === '') {
      errors.push({
        field: 'id',
        message: 'ID модели обязателен',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!model.name || model.name.trim() === '') {
      errors.push({
        field: 'name',
        message: 'Название модели обязательно',
        code: 'REQUIRED_FIELD',
      });
    }

    if (!model.provider || model.provider.trim() === '') {
      errors.push({
        field: 'provider',
        message: 'Провайдер модели обязателен',
        code: 'REQUIRED_FIELD',
      });
    }

    if (model.contextLength <= 0) {
      errors.push({
        field: 'contextLength',
        message: 'Context length должен быть положительным числом',
        code: 'INVALID_VALUE',
      });
    }

    if (model.maxTokens <= 0) {
      errors.push({
        field: 'maxTokens',
        message: 'Max tokens должен быть положительным числом',
        code: 'INVALID_VALUE',
      });
    }

    if (model.pricing.prompt < 0 || model.pricing.completion < 0) {
      errors.push({
        field: 'pricing',
        message: 'Цены не могут быть отрицательными',
        code: 'INVALID_VALUE',
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Преобразование в старый формат ModelOption для совместимости
   */
  toModelOption(model: ModelInfo): ModelOption {
    return {
      id: model.id,
      name: model.name,
      provider: model.provider,
      description: model.description,
      contextLength: model.contextLength,
      pricing: model.pricing,
      free: model.free,
      supportsReasoning: model.capabilities.reasoning,
    };
  }

  /**
   * Получение состояния менеджера
   */
  getState(): Readonly<ModelManagerState> {
    return {
      ...this.state,
      cache: {
        ...this.state.cache,
        models: new Map(this.state.cache.models),
      },
      scopes: Object.fromEntries(
        ALL_SCOPES.map((scope) => [
          scope,
          {
            ...this.state.scopes[scope],
            reasoning: { ...this.state.scopes[scope].reasoning },
            health: { ...this.state.scopes[scope].health },
          },
        ])
      ) as ScopeStateMap,
    };
  }

  /**
   * Очистка кэша
   */
  clearCache(scope?: ModelScope): void {
    if (scope) {
      const scopeState = this.getScopeState(scope);
      scopeState.availableModels = [];
      scopeState.lastRefresh = null;
      scopeState.error = null;
      scopeState.isLoading = false;
      this.emitEvent(ModelManagerEventType.CACHE_UPDATED, scope, { cleared: true });
    } else {
      this.state.cache.models.clear();
      this.state.cache.lastUpdated = new Date(0);
      this.state.cache.isLoading = false;
      this.state.cache.error = undefined;
      this.state.availableModels = [];
      this.state.lastRefresh = null;
      this.state.error = null;
      this.state.isLoading = false;

      ALL_SCOPES.forEach((s) => {
        const scopeState = this.state.scopes[s];
        scopeState.availableModels = [];
        scopeState.lastRefresh = null;
        scopeState.error = null;
        scopeState.isLoading = false;
      });

      this.emitEvent(ModelManagerEventType.CACHE_UPDATED, undefined, { cleared: true });
    }

    this.log('info', 'Кэш очищен', { scope: scope ?? 'all' });
  }

  /**
   * Подписка на события
   */
  on(event: ModelManagerEventType | string, listener: (event: ModelManagerEvent) => void): string {
    const id = Math.random().toString(36).substr(2, 9);
    this.listeners.set(id, listener);
    return id;
  }

  /**
   * Отписка от событий
   */
  off(listenerId: string): void {
    this.listeners.delete(listenerId);
  }

  /**
   * Получение логов
   */
  getLogs(level?: string): ModelLogEntry[] {
    let logs = [...this.logBuffer];
    if (level) {
      logs = logs.filter((log) => log.level === level);
    }
    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // ===================== PRIVATE HELPERS ===================== //

  private initializeScopeStates(): ScopeStateMap {
    const data = DataMigrator.getData();
    
    return ALL_SCOPES.reduce((acc, scope) => {
      const selectedModelId = data.models.selected[scope];
      acc[scope] = this.createScopeState(scope, selectedModelId || undefined);
      return acc;
    }, {} as ScopeStateMap);
  }

  private createScopeState(scope: ModelScope, selectedModelId?: string): ModelScopeState {
    return {
      scope,
      availableModels: [],
      selectedModelId: selectedModelId || null,
      isLoading: false,
      error: null,
      lastRefresh: null,
      cache: this.createEmptyCache(),
      reasoning: this.createReasoningState(),
      health: this.createHealthSnapshot(),
    };
  }

  private createEmptyCache(): ModelCache {
    return {
      models: new Map(),
      lastUpdated: new Date(0),
      isLoading: false,
    };
  }

  private createReasoningConfig(): ReasoningConfig {
    return {
      enabled: false,
      modelId: '',
      showThinkingProcess: true,
      thinkingProcessStyle: 'expanded',
      lastToggled: undefined,
    };
  }

  private createReasoningState(config?: ReasoningConfig): ReasoningState {
    const enabled = config ? config.enabled : false;
    const modelId = config ? config.modelId : '';
    const lastToggled = config && config.lastToggled ? config.lastToggled : null;

    return {
      enabled,
      modelId,
      lastToggled,
      status: enabled ? 'idle' : 'disabled',
      lastHealthCheck: null,
      latencyMs: undefined,
      message: undefined,
      error: undefined,
    };
  }

  private createHealthSnapshot(): ModelHealthSnapshot {
    return {
      status: 'unknown',
      lastChecked: null,
      lastUpdated: null,
      consecutiveFailures: 0,
      latencyMs: undefined,
      error: undefined,
      reason: undefined,
      metadata: {},
    };
  }

  private applyReasoningConfigToScopes(): void {
    const data = DataMigrator.getData();
    
    ALL_SCOPES.forEach((scope) => {
      const config = this.reasoningConfig[scope];
      const scopeState = this.state.scopes[scope];
      scopeState.reasoning = this.createReasoningState(config);
    });
  }

  private loadReasoningConfig(): ScopeReasoningConfigMap {
    const data = DataMigrator.getData();
    const defaults = ALL_SCOPES.reduce((acc, scope) => {
      acc[scope] = this.createReasoningConfig();
      return acc;
    }, {} as ScopeReasoningConfigMap);

    // Загружаем конфигурацию из мигрированных данных
    if (data.models.reasoning) {
      ALL_SCOPES.forEach((scope) => {
        if (data.models.reasoning[scope]) {
          const config = data.models.reasoning[scope];
          defaults[scope] = {
            ...defaults[scope],
            ...config,
            lastToggled: config.lastToggled ? new Date(config.lastToggled) : undefined,
          };
        }
      });
    }

    return defaults;
  }

  private saveReasoningConfig(): void {
    const data = DataMigrator.getData();
    const reasoningConfig: Record<string, any> = {};
    
    ALL_SCOPES.forEach((scope) => {
      reasoningConfig[scope] = this.reasoningConfig[scope];
    });

    DataMigrator.updateModels({
      reasoning: reasoningConfig
    });
  }

  private getScopeState(scope: ModelScope): ModelScopeState {
    const scopeState = this.state.scopes[scope];
    if (!scopeState) {
      throw new ModelCacheError(`Неизвестный scope ${scope}`, 'getScopeState');
    }
    return scopeState;
  }

  // ===================== SHARED HELPERS ====================== //

  private applyModelsToCache(models: ModelInfo[]): void {
    const now = new Date();

    this.state.cache.models = new Map(models.map((model) => [model.id, model]));
    this.state.cache.lastUpdated = now;
    this.state.cache.isLoading = false;
    this.state.cache.error = undefined;
    this.state.availableModels = models;
    this.state.lastRefresh = now;
    this.state.error = null;

    // Обновляем все scope states
    ALL_SCOPES.forEach((scope) => {
      const scopeState = this.state.scopes[scope];
      scopeState.availableModels = models;
      scopeState.lastRefresh = now;
      scopeState.error = null;
      scopeState.isLoading = false;
    });
  }

  private isCacheValid(cache: ModelCache): boolean {
    const now = new Date();
    const cacheAge = now.getTime() - cache.lastUpdated.getTime();
    return cacheAge < this.config.cacheTimeoutMs && cache.models.size > 0;
  }

  private async loadModelsWithRetry(): Promise<ModelInfo[]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        this.log('info', 'Попытка загрузки моделей', { attempt });
        const openRouterModels = await openRouterService.getModels();
        return this.transformModels(openRouterModels);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('warn', 'Попытка загрузки моделей не удалась', {
          attempt,
          error: errorMessage,
        });

        if (attempt < this.config.retryAttempts) {
          const delayMs = this.config.retryDelayMs * Math.pow(2, attempt - 1); // Экспоненциальная задержка: 1s, 2s, 4s
          this.log('info', 'Повторная попытка через', { delayMs, nextAttempt: attempt + 1 });
          await this.delay(delayMs);
        }
      }
    }

    throw lastError;
  }

  private transformModels(models: Model[]): ModelInfo[] {
    const transformedModels: ModelInfo[] = [];

    transformedModels.push({
      id: 'local',
      name: 'Local use',
      provider: 'Local',
      description: 'Локальная модель',
      contextLength: 128000,
      maxTokens: 8192,
      pricing: { prompt: 0, completion: 0 },
      capabilities: {
        chat: true,
        streaming: false,
        images: false,
        tools: false,
        embeddings: false,
        reasoning: false,
      },
      free: true,
      category: 'local',
      status: 'available',
      lastChecked: new Date(),
    });

    models.forEach((model) => {
      try {
        const modelInfo: ModelInfo = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          description: this.generateModelDescription(model),
          contextLength: model.contextLength,
          maxTokens: model.maxTokens,
          pricing: model.pricing,
          capabilities: {
            chat: true,
            streaming: true,
            images: this.detectImageCapability(model),
            tools: true,
            embeddings: false,
            reasoning: this.detectReasoningCapability(model),
          },
          free: model.free || false,
          category: 'openrouter',
          status: 'available',
          lastChecked: new Date(),
        };

        const validation = this.validateModel(modelInfo);
        if (validation.isValid) {
          transformedModels.push(modelInfo);
        } else {
          this.log('warn', 'Модель не прошла валидацию', {
            modelId: model.id,
            errors: validation.errors,
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('error', 'Ошибка трансформации модели', {
          modelId: model.id,
          error: errorMessage,
        });
      }
    });

    return transformedModels;
  }

  private detectReasoningCapability(model: Model): boolean {
    const reasoningModels = [
      'openai/o1-preview',
      'openai/o1-mini',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      'deepseek/deepseek-r1',
      'deepseek/deepseek-r1-distill-llama-70b',
      'deepseek/deepseek-r1-distill-qwen-14b',
      'qwen/qwq-32b-preview',
      'microsoft/wizardlm-2-8x22b',
      'nousresearch/hermes-3-llama-3.1-405b',
      'meta-llama/llama-3.1-405b-instruct',
    ];

    return reasoningModels.some(
      (reasoningModel) =>
        model.id.includes(reasoningModel) ||
        model.name.toLowerCase().includes('reasoning') ||
        model.name.toLowerCase().includes('thinking') ||
        model.name.toLowerCase().includes('chain-of-thought') ||
        model.name.toLowerCase().includes('cot')
    );
  }

  private detectImageCapability(model: Model): boolean {
    return (
      model.id.includes('vision') ||
      model.id.includes('image') ||
      model.name.toLowerCase().includes('vision')
    );
  }

  private generateModelDescription(model: Model): string {
    const contextFormatted = this.formatContextLength(model.contextLength);
    const priceFormatted = model.free ? 'Free' : `$${model.pricing.prompt}/$${model.pricing.completion}`;
    return `${contextFormatted} • ${priceFormatted}`;
  }

  private formatContextLength(length: number): string {
    if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M tokens`;
    if (length >= 1000) return `${(length / 1000).toFixed(0)}K tokens`;
    return `${length} tokens`;
  }

  private handleError(error: unknown, operation: string): string {
    if (error instanceof ModelManagerError) {
      return error.message;
    }

    if (error instanceof Error) {
      return `${operation}: ${error.message}`;
    }

    return `${operation}: Неизвестная ошибка`;
  }

  private emitEvent(type: ModelManagerEventType, scope: ModelScope | undefined, data: unknown): void {
    const event: ModelManagerEvent = {
      type,
      scope,
      data,
      timestamp: new Date(),
    };

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('error', 'Ошибка в обработчике событий', {
          error: errorMessage,
          eventType: type,
        });
      }
    });

    const payload = { event, scope, data };

    if (type === ModelManagerEventType.REASONING_HEALTH || type === ModelManagerEventType.HEALTH_CHECK) {
      agentEventSystem.emit(AGENT_EVENTS.MODEL_HEALTH_CHECK, payload);
    } else {
      agentEventSystem.emit(AGENT_EVENTS.MODEL_STATE_UPDATED, payload);
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (!this.config.enableLogging && level !== 'error') return;

    const logEntry: ModelLogEntry = {
      level,
      message,
      data,
      timestamp: new Date(),
      operation: 'ModelManager',
    };

    this.logBuffer.push(logEntry);

    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer = this.logBuffer.slice(-this.maxLogEntries);
    }

    if (level === 'error') {
      console.error(`[ModelManager] ${message}`, JSON.stringify(data, null, 2));
    } else if (level === 'warn') {
      console.warn(`[ModelManager] ${message}`, JSON.stringify(data, null, 2));
    } else if (this.config.enableLogging) {
      console.log(`[ModelManager] ${message}`, JSON.stringify(data, null, 2));
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Экспорт синглтона
export const modelManager = new ModelManager();