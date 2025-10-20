import { ModelProvider, ChatCompletionRequest, ChatCompletionResponse, ResponsesRequest } from './providers/model-provider';
import { LocalModelProvider } from './providers/local-provider';
import { OpenRouterProvider } from './providers/openrouter-provider';
import { routingLogger } from './routing-logger';
import { errorHandler } from './error-handler';
import { ValidationError } from '../errors';

export class ModelRouter {
  private providers: ModelProvider[] = [new LocalModelProvider(), new OpenRouterProvider()];

  async createCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const requestId = `router_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    try {
      // Логируем начало маршрутизации
      routingLogger.logApiCall(requestId, 'POST', 'model_router/completion', {
        model: request.model,
        messageCount: request.messages.length,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: request.stream
      });

      const provider = this.providers.find(p => p.canHandle(request.model));
      
      if (!provider) {
        const error = new ValidationError(`No provider found for model: ${request.model}`);
        routingLogger.logError(requestId, error, { stage: 'provider_selection' });
        errorHandler.handleError(error, 'Model router provider selection');
        throw error;
      }

      // Логируем выбор провайдера
      routingLogger.logDebug(`Selected provider for model ${request.model}: ${provider.constructor.name}`, { requestId });

      const result = await provider.createCompletion(request);
      const duration = Math.round(performance.now() - startTime);

      // Логируем успешную маршрутизацию
      routingLogger.logApiResponse(requestId, 200, duration, JSON.stringify(result).length);
      routingLogger.logPerformance(requestId, 'model_router_completion', duration, {
        model: request.model,
        provider: provider.constructor.name,
        tokens: result.usage ? result.usage.total_tokens : 0
      });

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'router_unhandled_error',
          totalDuration: duration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'router_unknown_error',
          totalDuration: duration
        });
      }
      
      // Обрабатываем ошибку через ErrorHandler
      errorHandler.handleError(error, 'Model router completion');
      throw error;
    }
  }

  async createStream(request: ChatCompletionRequest): Promise<ReadableStream> {
    const requestId = `router_stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    try {
      // Логируем начало потоковой маршрутизации
      routingLogger.logApiCall(requestId, 'POST', 'model_router/stream', {
        model: request.model,
        messageCount: request.messages.length,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        stream: true
      });

      const provider = this.providers.find(p => p.canHandle(request.model));
      
      if (!provider) {
        const error = new ValidationError(`No provider found for model: ${request.model}`);
        routingLogger.logError(requestId, error, { stage: 'provider_selection' });
        errorHandler.handleError(error, 'Model router stream provider selection');
        throw error;
      }

      // Логируем выбор провайдера для потока
      routingLogger.logDebug(`Selected provider for stream model ${request.model}: ${provider.constructor.name}`, { requestId });

      const result = await provider.createStream(request);
      const duration = Math.round(performance.now() - startTime);

      // Логируем успешную потоковую маршрутизацию
      routingLogger.logApiResponse(requestId, 200, duration);
      routingLogger.logPerformance(requestId, 'model_router_stream', duration, {
        model: request.model,
        provider: provider.constructor.name
      });

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'router_stream_unhandled_error',
          totalDuration: duration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'router_stream_unknown_error',
          totalDuration: duration
        });
      }
      
      // Обрабатываем ошибку через ErrorHandler
      errorHandler.handleError(error, 'Model router stream');
      throw error;
    }
  }

  // Метод для добавления новых провайдеров
  addProvider(provider: ModelProvider): void {
    this.providers.push(provider);
  }

  // Метод для получения списка всех провайдеров
  getProviders(): ModelProvider[] {
    return [...this.providers];
  }

  async createResponsesStream(request: ResponsesRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const requestId = `router_resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    try {
      // Логируем начало маршрутизации для Responses API
      routingLogger.logApiCall(requestId, 'POST', 'model_router/responses', {
        model: request.model,
        modalities: request.modalities,
        max_output_tokens: request.max_output_tokens,
        promptLength: request.prompt.length
      });

      const provider = this.providers.find(p => p.canHandle(request.model));
      
      if (!provider) {
        const error = new ValidationError(`No provider found for model: ${request.model}`);
        routingLogger.logError(requestId, error, { stage: 'provider_selection' });
        errorHandler.handleError(error, 'Model router responses provider selection');
        throw error;
      }

      // Проверяем, поддерживает ли провайдер Responses API
      if (!provider.createResponsesStream) {
        const error = new ValidationError(`Provider ${provider.constructor.name} does not support Responses API`);
        routingLogger.logError(requestId, error, { stage: 'responses_unsupported' });
        errorHandler.handleError(error, 'Responses API unsupported');
        throw error;
      }

      // Логируем выбор провайдера для Responses API
      routingLogger.logDebug(`Selected provider for responses model ${request.model}: ${provider.constructor.name}`, { requestId });

      const result = await provider.createResponsesStream(request);
      const duration = Math.round(performance.now() - startTime);

      // Логируем успешную маршрутизацию
      routingLogger.logApiResponse(requestId, 200, duration);
      routingLogger.logPerformance(requestId, 'model_router_responses', duration, {
        model: request.model,
        provider: provider.constructor.name
      });

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, {
          stage: 'router_responses_unhandled_error',
          totalDuration: duration
        });
      } else {
        routingLogger.logError(requestId, String(error), {
          stage: 'router_responses_unknown_error',
          totalDuration: duration
        });
      }
      
      // Обрабатываем ошибку через ErrorHandler
      errorHandler.handleError(error, 'Model router responses');
      throw error;
    }
  }
}

// Создаем экземпляр для глобального использования
export const modelRouter = new ModelRouter();