import { ModelProvider, ChatCompletionRequest, ChatCompletionResponse, ResponsesRequest } from './model-provider';
import { configManager } from '../config-manager';
import { routingLogger } from '../routing-logger';
import { errorHandler } from '../error-handler';
import { ApiError, AuthenticationError, NetworkError, TimeoutError, ValidationError } from '../../errors';

const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

export class LocalModelProvider implements ModelProvider {
  canHandle(model: string): boolean {
    return model === 'local' || model.startsWith('local/');
  }

  private getLocalLLMUrl(): string {
    return configManager.get('localLLMUrl', 'http://localhost:11964').replace(/\/+$/, '');
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
    const requestId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    try {
      const body: Record<string, unknown> = {
        model: 'default', // Use default model on local server
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }

      const base = this.getLocalLLMUrl();

      if (DEBUG) {
        console.log('Отправляю запрос к локальной модели:');
        console.log('Local URL:', JSON.stringify(base, null, 2));
        console.log('Model:', JSON.stringify(body.model, null, 2));
      }

      // Логируем начало локального API вызова
      routingLogger.logApiCall(requestId, 'POST', 'local/chat/completions', {
        model: 'default',
        messageCount: request.messages.length,
        temperature: body.temperature,
        max_tokens: body.max_tokens
      });

      const apiStartTime = performance.now();
      
      const response = await this.fetchWithTimeout(`${base}/v1/chat/completions`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);

      const apiDuration = Math.round(performance.now() - apiStartTime);

      if (DEBUG) {
        console.log('Local response status:', JSON.stringify(response.status, null, 2));
        console.log('Local response ok:', JSON.stringify(response.ok, null, 2));
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Local error response body:', JSON.stringify(errorText, null, 2));
        
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
          error = new ApiError(`Local model API error: ${response.status} ${response.statusText} - ${errorData.error && errorData.error.message ? errorData.error.message : "Unknown error"}`);
        }
        
        routingLogger.logError(requestId, error, {
          stage: 'local_api_response',
          status: response.status,
          statusText: response.statusText,
          errorBody: errorData,
          apiDuration,
          localUrl: base
        });
        
        // Обрабатываем ошибку через ErrorHandler
        errorHandler.handleError(error, 'Local model API');
        throw error;
      }

      const result = await response.json();
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (DEBUG) console.log('Local success response:', JSON.stringify(result, null, 2));
      
      // Логируем успешный локальный ответ
      routingLogger.logApiResponse(requestId, response.status, totalDuration, JSON.stringify(result).length);
      routingLogger.logPerformance(requestId, 'local_chat_completion', totalDuration, {
        model: 'default',
        apiDuration,
        tokens: result.usage ? result.usage.total_tokens : 0,
        promptTokens: result.usage ? result.usage.prompt_tokens : 0,
        completionTokens: result.usage ? result.usage.completion_tokens : 0,
        localUrl: base
      });
      
      return result;
    } catch (error) {
      const totalDuration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'local_unhandled_error',
          totalDuration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'local_unknown_error',
          totalDuration
        });
      }
      
      console.error("Error in local chat completion:", JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof Error && error.message.includes('Local model API error'))) {
        errorHandler.handleError(error, 'Local chat completion');
      }
      
      throw error;
    }
  }

  async createStream(request: ChatCompletionRequest): Promise<ReadableStream> {
    throw new ValidationError('Потоковые ответы для локальной модели не поддерживаются этим клиентом');
  }

  async createResponsesStream(request: ResponsesRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    throw new ValidationError('Responses API для локальной модели не поддерживается этим клиентом');
  }
}

export const localModelProvider = new LocalModelProvider();