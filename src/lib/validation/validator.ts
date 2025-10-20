import { z } from 'zod';
import {
  ModelInfoSchema,
  ReasoningConfigSchema,
  ModelScopeStateSchema,
  ModelCacheSchema,
  ModelHealthSnapshotSchema,
  ReasoningStateSchema,
  ChatMessageSchema,
  AppConfigSchema,
  type ModelInfo,
  type ReasoningConfig,
  type ModelScopeState,
  type ModelCache,
  type ModelHealthSnapshot,
  type ReasoningState,
  type ChatMessage,
  type AppConfig
} from './schemas';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodIssue[] = []
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DataValidator {
  /**
   * Универсальный метод валидации
   */
  static validate<T>(data: unknown, schema: z.ZodSchema<T>): ValidationResult<T> {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        };
      }
      throw error;
    }
  }

  /**
   * Безопасная валидация без выбрасывания ошибки
   */
  static safeValidate<T>(data: unknown, schema: z.ZodSchema<T>): { success: true; data: T } | { success: false; error: ValidationError } {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: new ValidationError('Валидация не пройдена', result.error.errors)
    };
  }

  /**
   * Валидация данных из localStorage с восстановлением при ошибке
   */
  static validateLocalStorageData<T>(
    key: string,
    schema: z.ZodSchema<T>,
    defaultValue: T
  ): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;

      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      
      if (result.success) {
        return result.data;
      } else {
        console.warn(`Невалидные данные в localStorage для ключа ${key}:`, result.error.errors);
        return defaultValue;
      }
    } catch (error) {
      console.warn(`Ошибка чтения данных из localStorage для ключа ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Валидация с логированием ошибок
   */
  static validateWithLogging<T>(data: unknown, schema: z.ZodSchema<T>, context: string): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(`Ошибка валидации в контексте ${context}:`, error.errors);
      }
      throw error;
    }
  }

  /**
   * Создание валидированных данных по умолчанию
   */
  static createDefaultModelInfo(overrides?: Partial<ModelInfo>): ModelInfo {
    return ModelInfoSchema.parse({
      id: '',
      name: '',
      provider: '',
      description: '',
      contextLength: 4096,
      maxTokens: 4096,
      pricing: { prompt: 0, completion: 0 },
      free: false,
      capabilities: { reasoning: false },
      ...overrides
    });
  }

  static createDefaultReasoningConfig(overrides?: Partial<ReasoningConfig>): ReasoningConfig {
    return ReasoningConfigSchema.parse({
      enabled: false,
      modelId: '',
      showThinkingProcess: true,
      thinkingProcessStyle: 'expanded',
      lastToggled: undefined,
      ...overrides
    });
  }

  static createDefaultModelScopeState(scope: 'chat' | 'workspace' | 'image-creator', overrides?: Partial<ModelScopeState>): ModelScopeState {
    return ModelScopeStateSchema.parse({
      scope,
      availableModels: [],
      selectedModelId: null,
      isLoading: false,
      error: null,
      lastRefresh: null,
      ...overrides
    });
  }
}