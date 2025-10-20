import { z } from 'zod';

// Базовые схемы для общих типов данных
export const BaseModelSchema = z.object({
  id: z.string().min(1, 'ID модели обязателен'),
  name: z.string().min(1, 'Название модели обязательно'),
  provider: z.string().min(1, 'Провайдер модели обязателен'),
});

export const PricingSchema = z.object({
  prompt: z.number().min(0, 'Цена prompt не может быть отрицательной'),
  completion: z.number().min(0, 'Цена completion не может быть отрицательной'),
});

export const CapabilitiesSchema = z.object({
  reasoning: z.boolean().default(false),
});

// Схема для валидации modelId
export const ModelIdSchema = z.string().min(1, 'ID модели обязателен');

// Полная схема для ModelInfo
export const ModelInfoSchema = BaseModelSchema.extend({
  description: z.string().optional(),
  contextLength: z.number().positive('Context length должен быть положительным числом'),
  maxTokens: z.number().positive('Max tokens должен быть положительным числом'),
  pricing: PricingSchema,
  free: z.boolean().default(false),
  capabilities: CapabilitiesSchema,
});

// Схема для конфигурации reasoning
export const ReasoningConfigSchema = z.object({
  enabled: z.boolean().default(false),
  modelId: z.string().min(1, 'ID модели обязателен для reasoning'),
  showThinkingProcess: z.boolean().default(true),
  thinkingProcessStyle: z.enum(['expanded', 'collapsed', 'hidden']).default('expanded'),
  lastToggled: z.date().optional(),
});

// Схема для состояния scope
export const ModelScopeStateSchema = z.object({
  scope: z.enum(['chat', 'workspace', 'image-creator']),
  availableModels: z.array(ModelInfoSchema).default([]),
  selectedModelId: z.string().nullable().default(null),
  isLoading: z.boolean().default(false),
  error: z.string().nullable().default(null),
  lastRefresh: z.date().nullable().default(null),
});

// Схема для кэша моделей
export const ModelCacheSchema = z.object({
  models: z.record(z.string(), ModelInfoSchema).default({}),
  lastUpdated: z.date().default(() => new Date(0)),
  isLoading: z.boolean().default(false),
  error: z.string().optional(),
});

// Схема для состояния здоровья модели
export const ModelHealthSnapshotSchema = z.object({
  status: z.enum(['unknown', 'healthy', 'degraded', 'unhealthy']).default('unknown'),
  lastChecked: z.date().nullable().default(null),
  lastUpdated: z.date().nullable().default(null),
  consecutiveFailures: z.number().default(0),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

// Схема для состояния reasoning
export const ReasoningStateSchema = z.object({
  enabled: z.boolean().default(false),
  modelId: z.string().default(''),
  lastToggled: z.date().nullable().default(null),
  status: z.enum(['idle', 'active', 'disabled', 'error']).default('disabled'),
  lastHealthCheck: z.date().nullable().default(null),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

// Схема для сообщений чата
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

// Схема для конфигурации приложения
export const AppConfigSchema = z.object({
  features: z.object({
    realTimeVectorSearch: z.boolean().default(false),
    reasoning: z.boolean().default(false),
    imageGeneration: z.boolean().default(false),
  }),
  api: z.object({
    baseUrl: z.string().url().default('http://localhost:4000'),
    openaiKey: z.string().optional(),
    qdrantUrl: z.string().url().optional(),
  }),
});

// Типы для TypeScript
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;
export type ModelScopeState = z.infer<typeof ModelScopeStateSchema>;
export type ModelCache = z.infer<typeof ModelCacheSchema>;
export type ModelHealthSnapshot = z.infer<typeof ModelHealthSnapshotSchema>;
export type ReasoningState = z.infer<typeof ReasoningStateSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;