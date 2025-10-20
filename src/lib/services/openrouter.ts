import { config } from '@/lib/config';
import { routingLogger } from './routing-logger';
import { errorHandler } from './error-handler';
import { ErrorType } from '../errors';
import { ApiError, AuthenticationError, NetworkError, TimeoutError, ValidationError } from '../errors';
import { configManager } from './config-manager';
import { modelRouter } from './model-router';
import type { ChatCompletionRequest, ChatCompletionResponse, ResponsesRequest } from './providers/model-provider';
const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

export interface Model {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  contextLength: number;
  free?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class OpenRouterService {
  private baseUrl = config.openrouter.baseUrl;
  private apiKey = config.openrouter.apiKey;

  constructor() {}

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }

  private getCommonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Title': 'AI Agent Workspace',
    };
    const referer = typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'http://localhost';
    headers['HTTP-Referer'] = referer;
    if (this.isConfigured()) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  private normalizePrice(value: unknown): number {
    if (typeof value === 'number') return value >= 1 ? value / 1000 : value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return 0;
      return parsed >= 1 ? parsed / 1000 : parsed;
    }
    return 0;
  }

  private transformModel(modelData: any): Model {
    const pricing = modelData.pricing || {};
    return {
      id: modelData.id,
      name: modelData.name || modelData.id,
      provider: this.extractProvider(modelData.id),
      maxTokens: modelData.context_length || 8192,
      pricing: {
        prompt: this.normalizePrice(pricing.prompt),
        completion: this.normalizePrice(pricing.completion),
      },
      contextLength: modelData.context_length || 8192,
      free: pricing.prompt === 0 && pricing.completion === 0,
    };
  }

  async getModels(): Promise<Model[]> {
    const localModels = this.getLocalModels();

    const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.getCommonHeaders(),
    }, 10000);

    if (!response.ok) {
      throw new Error(`OpenRouter API returned status ${response.status}`);
    }

    const data = await response.json();
    const openRouterModels = data.data.map((model: any) => this.transformModel(model));

    // local/use всегда в списке + модели из OpenRouter
    return [...localModels, ...openRouterModels];
  }

  private getLocalModels(): Model[] {
    return [
      {
        id: 'local/use',
        name: 'Local use',
        provider: 'Local',
        maxTokens: 8192,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 128000,
        free: true,
      }
    ];
  }

  private extractProvider(modelId: string): string {
    const parts = modelId.split('/');
    if (parts.length > 1) {
      const provider = parts[0];
      // Map common provider names to readable format
      const providerMap: { [key: string]: string } = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'meta-llama': 'Meta',
        'mistralai': 'Mistral AI',
        'cohere': 'Cohere',
        'deepseek': 'DeepSeek',
        'qwen': 'Qwen',
        'microsoft': 'Microsoft',
        'nvidia': 'NVIDIA',
        'perplexity': 'Perplexity',
        'huggingfaceh4': 'Hugging Face',
        'nousresearch': 'Nous Research',
        'teknium': 'Teknium',
        'liquid': 'Liquid',
        'alpindale': 'Alpindale',
        'gryphe': 'Gryphe',
        'koboldai': 'KoboldAI',
        'mancer': 'Mancer',
        'neversleep': 'NeverSleep',
        'undi95': 'Undi95',
        'jondurbin': 'Jon Durbin',
        'cognitivecomputations': 'Cognitive Computations',
        'lizpreciatior': 'Liz Preciatior',
        'recursal': 'Recursal',
        'lynn': 'Lynn',
        'flammenai': 'FlammenAI',
        'sophosympatheia': 'Sophosympatheia',
        'rwkv': 'RWKV',
        'togethercomputer': 'Together',
        'databricks': 'Databricks',
        'mattshumer': 'Matt Shumer',
        'austism': 'Austism',
        'sammcj': 'Samm C',
        'nothingiisreal': 'NothingIsReal',
        'sao10k': 'Sao10K',
        'dragonfly': 'Dragonfly',
        'infermatic': 'Infermatic',
        'eva-unit-01': 'Eva Unit 01',
        'thebloke': 'TheBloke',
        'bigcode': 'BigCode',
      };
      return providerMap[provider.toLowerCase()] || provider;
    }
    return 'Unknown';
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    if (DEBUG) {
      console.log('=== DEBUG: createChatCompletion ===');
      console.log('Request model:', JSON.stringify(request.model, null, 2));
      console.log('Using ModelRouter for request');
    }

    // Логируем начало запроса
    routingLogger.logApiCall(requestId, 'POST', 'chat/completion', {
      model: request.model,
      messageCount: request.messages.length,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream
    });

    try {
      // Используем ModelRouter для маршрутизации
      const result = await modelRouter.createCompletion(request);
      const duration = Math.round(performance.now() - startTime);
      
      // Логируем успешный ответ
      routingLogger.logApiResponse(requestId, 200, duration, JSON.stringify(result).length);
      routingLogger.logPerformance(requestId, 'model_router_chat_completion', duration, {
        model: request.model,
        tokens: result.usage ? result.usage.total_tokens : 0
      });
      
      return result;
    } catch (error) {
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'unhandled_error',
          totalDuration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'unknown_error',
          totalDuration
        });
      }
      
      console.error("Error in chat completion:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'Chat completion');
      }
      
      throw error;
    }
  }

  async createChatCompletionStream(request: ChatCompletionRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const requestId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    if (DEBUG) {
      console.log('=== DEBUG: createChatCompletionStream ===');
      console.log('Request model:', JSON.stringify(request.model, null, 2));
      console.log('Using ModelRouter for stream request');
    }

    // Логируем начало потокового запроса
    routingLogger.logApiCall(requestId, 'POST', 'chat/completions/stream', {
      model: request.model,
      messageCount: request.messages.length,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: true
    });

    try {
      // Используем ModelRouter для маршрутизации потоковых запросов
      const stream = await modelRouter.createStream(request);
      const reader = stream.getReader();
      
      const totalDuration = Math.round(performance.now() - startTime);
      routingLogger.logApiResponse(requestId, 200, totalDuration);
      routingLogger.logPerformance(requestId, 'model_router_stream_start', totalDuration, {
        model: request.model
      });
      
      return reader;
    } catch (error) {
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'stream_unhandled_error',
          totalDuration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'stream_unknown_error',
          totalDuration
        });
      }
      
      console.error("Error in streaming chat completion:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'Streaming chat completion');
      }
      
      throw error;
    }
  }

  async createResponsesStream(params: { model: string; prompt: string; modalities?: string[]; max_output_tokens?: number }): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const requestId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    if (DEBUG) {
      console.log('=== DEBUG: createResponsesStream ===');
      console.log('Request model:', JSON.stringify(params.model, null, 2));
      console.log('Using ModelRouter for responses request');
    }

    // Логируем начало Responses API запроса
    routingLogger.logApiCall(requestId, 'POST', 'responses', {
      model: params.model,
      modalities: params.modalities,
      max_output_tokens: params.max_output_tokens,
      promptLength: params.prompt.length
    });

    try {
      // Используем ModelRouter для маршрутизации
      const result = await modelRouter.createResponsesStream({
        model: params.model,
        prompt: params.prompt,
        modalities: params.modalities,
        max_output_tokens: params.max_output_tokens
      });
      
      const totalDuration = Math.round(performance.now() - startTime);
      routingLogger.logApiResponse(requestId, 200, totalDuration);
      routingLogger.logPerformance(requestId, 'model_router_responses_start', totalDuration, {
        model: params.model
      });
      
      return result;
    } catch (error) {
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'responses_unhandled_error',
          totalDuration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'responses_unknown_error',
          totalDuration
        });
      }
      
      console.error("Error in responses stream:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'Responses stream');
      }
      
      throw error;
    }
  }

  async generateCompletion(prompt: string, model?: string, options?: { maxTokens?: number; temperature?: number; systemMessage?: string }): Promise<string> {
    const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    // ОДНА переменная для модели
    const selectedModel = model || 'unknown';

    try {
      const messages: ChatMessage[] = [];

      if (options && options.systemMessage) {
        messages.push({
          role: "system",
          content: options.systemMessage
        });
      }

      messages.push({
        role: "user",
        content: prompt
      });

      // Логируем генерацию completion
      routingLogger.logApiCall(requestId, 'POST', 'generate_completion', {
        model: selectedModel,
        messageCount: messages.length,
        temperature: options ? (options.temperature || 0.7) : 0.7,
        maxTokens: options ? options.maxTokens : undefined,
        promptLength: prompt.length
      });

      // Если модель не указана - падаем
      if (selectedModel === 'unknown') {
        throw new Error('Model must be specified for generateCompletion');
      }

      const response = await this.createChatCompletion({
        model: selectedModel,
        messages,
        temperature: options ? (options.temperature || 0.7) : 0.7,
        max_tokens: options ? options.maxTokens : undefined
      });

      const duration = Math.round(performance.now() - startTime);

      if (!response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Invalid response from OpenRouter API');
      }

      const result = response.choices[0].message.content || "Ошибка генерации ответа";

      routingLogger.logPerformance(requestId, 'generate_completion', duration, {
        model: selectedModel,
        resultLength: result.length,
        tokens: response.usage ? response.usage.total_tokens : 0
      });
      
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'generate_completion_error',
          totalDuration: duration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'generate_completion_unknown_error',
          totalDuration: duration
        });
      }
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && (
        error.message.includes('OpenRouter API error') || 
        error.message.includes('Local model API error')
      ))) {
        errorHandler.handleError(error, 'Generate completion');
      }
      
      throw error;
    }
  }

}

export const openRouterService = new OpenRouterService();