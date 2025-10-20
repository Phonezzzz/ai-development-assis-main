import { ModelProvider, ChatCompletionRequest, ChatCompletionResponse, ResponsesRequest } from './model-provider';
import { config } from '@/lib/config';
import { routingLogger } from '../routing-logger';
import { errorHandler } from '../error-handler';
import { ApiError, AuthenticationError, NetworkError, TimeoutError, ValidationError } from '../../errors';
import { configManager } from '../config-manager';

const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

export class OpenRouterProvider implements ModelProvider {
  private baseUrl = config.openrouter.baseUrl;
  private apiKey = config.openrouter.apiKey;

  canHandle(model: string): boolean {
    // OpenRouterProvider обрабатывает все модели, кроме локальных
    return !(model === 'local' || model.startsWith('local/'));
  }

  private isConfigured(): boolean {
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

  async createCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const requestId = `openrouter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    if (DEBUG) {
      console.log('=== DEBUG: OpenRouterProvider createCompletion ===');
      console.log('Request model:', JSON.stringify(request.model, null, 2));
    }

    // Логируем начало запроса
    routingLogger.logApiCall(requestId, 'POST', 'openrouter/chat/completion', {
      model: request.model,
      messageCount: request.messages.length,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: request.stream
    });

    try {
      if (!this.isConfigured()) {
        const error = new Error("OpenRouter API key not configured");
        routingLogger.logError(requestId, error, { stage: 'validation' });
        errorHandler.handleError(error, 'OpenRouter API validation');
        throw error;
      }

      if (request.stream) {
        const error = new Error("Потоковые ответы (stream) не реализованы в этом клиенте");
        routingLogger.logError(requestId, error, { stage: 'validation' });
        errorHandler.handleError(error, 'Stream validation');
        throw error;
      }

      // Логируем начало API вызова
      const apiStartTime = performance.now();
      routingLogger.logDebug(`Starting OpenRouter API call for model: ${request.model}`, { requestId });

      const body: Record<string, unknown> = {
        ...request,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }

      if (DEBUG) {
        const headers = this.getCommonHeaders();
        const safeHeaders = { ...headers };
        if (safeHeaders['Authorization']) {
          safeHeaders['Authorization'] = 'Bearer ***';
        }
        console.log('Отправляю запрос к OpenRouter:', { model: body.model, headers: safeHeaders });
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);

      const apiDuration = Math.round(performance.now() - apiStartTime);

      if (DEBUG) {
        console.log('Response status:', JSON.stringify(response.status, null, 2));
        console.log('Response ok:', JSON.stringify(response.ok, null, 2));
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body:', JSON.stringify(errorText, null, 2));
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        
        let error;
        if (response.status === 401 || response.status === 403) {
          error = new AuthenticationError(`Invalid API key: ${response.status}`);
        } else if (response.status >= 500) {
          error = new ApiError(`Server error: ${response.status}`);
        } else {
          const errorMsg = errorData.error && errorData.error.message ? errorData.error.message : "Unknown error";
          error = new ApiError(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorMsg}`);
        }
        
        // Логируем ошибку API
        routingLogger.logError(requestId, error, {
          stage: 'api_response',
          status: response.status,
          statusText: response.statusText,
          errorBody: errorData,
          apiDuration
        });
        
        // Обрабатываем ошибку через ErrorHandler
        errorHandler.handleError(error, `OpenRouter API - ${response.status}`);
        throw error;
      }

      const result = await response.json();
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (DEBUG) console.log('Success response:', JSON.stringify(result, null, 2));
      
      // Логируем успешный ответ
      routingLogger.logApiResponse(requestId, response.status, totalDuration, JSON.stringify(result).length);
      routingLogger.logPerformance(requestId, 'openrouter_chat_completion', totalDuration, {
        model: request.model,
        apiDuration,
        tokens: result.usage ? result.usage.total_tokens : 0,
        promptTokens: result.usage ? result.usage.prompt_tokens : 0,
        completionTokens: result.usage ? result.usage.completion_tokens : 0
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
      
      console.error("Error in OpenRouter chat completion:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'OpenRouter chat completion');
      }
      
      throw error;
    }
  }

  async createStream(request: ChatCompletionRequest): Promise<ReadableStream> {
    const requestId = `openrouter_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    if (DEBUG) {
      console.log('=== DEBUG: OpenRouterProvider createStream ===');
      console.log('Request model:', JSON.stringify(request.model, null, 2));
    }

    // Логируем начало потокового запроса
    routingLogger.logApiCall(requestId, 'POST', 'openrouter/chat/completions/stream', {
      model: request.model,
      messageCount: request.messages.length,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: true
    });

    try {
      if (!this.isConfigured()) {
        const error = new AuthenticationError("OpenRouter API key not configured");
        routingLogger.logError(requestId, error, { stage: 'validation' });
        errorHandler.handleError(error, 'OpenRouter API validation');
        throw error;
      }

      const apiStartTime = performance.now();

      const body: Record<string, unknown> = {
        ...request,
        stream: true,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }
      
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);
      
      const apiDuration = Math.round(performance.now() - apiStartTime);
      
      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body (stream):', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        
        let error;
        if (response.status === 401 || response.status === 403) {
          error = new AuthenticationError(`Invalid API key: ${response.status}`);
        } else if (response.status >= 500) {
          error = new ApiError(`Server error: ${response.status}`);
        } else {
          const errorMsg = errorData.error && errorData.error.message ? errorData.error.message : "Unknown error";
          error = new ApiError(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorMsg}`);
        }
        
        routingLogger.logError(requestId, error, {
          stage: 'stream_api_response',
          status: response.status,
          statusText: response.statusText,
          errorBody: errorData,
          apiDuration
        });
        
        // Обрабатываем ошибку через ErrorHandler
        errorHandler.handleError(error, `OpenRouter Stream API - ${response.status}`);
        throw error;
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      const reader = response.body.getReader();
      if (!reader) {
        const error = new NetworkError('Не удалось получить reader от ответа API');
        routingLogger.logError(requestId, error, { stage: 'stream_reader_creation' });
        errorHandler.handleError(error, 'Stream reader creation');
        throw error;
      }
      
      const totalDuration = Math.round(performance.now() - startTime);
      routingLogger.logApiResponse(requestId, response.status, totalDuration);
      routingLogger.logPerformance(requestId, 'openrouter_stream_start', totalDuration, {
        model: request.model,
        apiDuration
      });
      
      return new ReadableStream({
        start(controller) {
          // Возвращаем поток, который использует reader из ответа
          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          };
          processStream();
        },
        cancel() {
          reader.cancel();
        }
      });
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
      
      console.error("Error in OpenRouter streaming chat completion:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'OpenRouter streaming chat completion');
      }
      
      throw error;
    }
  }

  async createResponsesStream(request: ResponsesRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const requestId = `openrouter_resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    if (DEBUG) {
      console.log('=== DEBUG: OpenRouterProvider createResponsesStream ===');
      console.log('Request model:', JSON.stringify(request.model, null, 2));
    }

    // Логируем начало Responses API запроса
    routingLogger.logApiCall(requestId, 'POST', 'openrouter/responses', {
      model: request.model,
      modalities: request.modalities,
      max_output_tokens: request.max_output_tokens,
      promptLength: request.prompt.length
    });

    try {
      if (!this.isConfigured()) {
        const error = new AuthenticationError("OpenRouter API key not configured");
        routingLogger.logError(requestId, error, { stage: 'validation' });
        errorHandler.handleError(error, 'OpenRouter API validation');
        throw error;
      }

      const apiStartTime = performance.now();

      const body: Record<string, unknown> = {
        model: request.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: request.prompt }
            ]
          }
        ],
        modalities: request.modalities && request.modalities.length ? request.modalities : ['image', 'text'],
        stream: true,
      };
      if (request.max_output_tokens != null) {
        body.max_output_tokens = request.max_output_tokens;
      }
      
      const response = await this.fetchWithTimeout(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 300000);
      
      const apiDuration = Math.round(performance.now() - apiStartTime);
      
      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body (responses stream):', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        
        let error;
        if (response.status === 401 || response.status === 403) {
          error = new AuthenticationError(`Invalid API key: ${response.status}`);
        } else if (response.status >= 500) {
          error = new ApiError(`Server error: ${response.status}`);
        } else {
          const errorMsg = errorData.error && errorData.error.message ? errorData.error.message : "Unknown error";
          error = new ApiError(`OpenRouter Responses API error: ${response.status} ${response.statusText} - ${errorMsg}`);
        }
        
        routingLogger.logError(requestId, error, {
          stage: 'responses_api_response',
          status: response.status,
          statusText: response.statusText,
          errorBody: errorData,
          apiDuration
        });
        
        // Обрабатываем ошибку через ErrorHandler
        errorHandler.handleError(error, `OpenRouter Responses API - ${response.status}`);
        throw error;
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      const reader = response.body.getReader();
      if (!reader) {
        const error = new NetworkError('Не удалось получить reader от ответа Responses API');
        routingLogger.logError(requestId, error, { stage: 'responses_reader_creation' });
        errorHandler.handleError(error, 'Responses reader creation');
        throw error;
      }
      
      const totalDuration = Math.round(performance.now() - startTime);
      routingLogger.logApiResponse(requestId, response.status, totalDuration);
      routingLogger.logPerformance(requestId, 'openrouter_responses_start', totalDuration, {
        model: request.model,
        apiDuration
      });
      
      return reader as ReadableStreamDefaultReader<Uint8Array>;
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
      
      console.error("Error in OpenRouter responses stream:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('OpenRouter API error'))) {
        errorHandler.handleError(error, 'OpenRouter responses stream');
      }
      
      throw error;
    }
  }
}

export const openRouterProvider = new OpenRouterProvider();