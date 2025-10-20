// Классификация ошибок
export interface ErrorClassification {
  type: ErrorType;
  userMessage: string;
  technicalMessage: string;
  shouldRetry: boolean;
}

import { emitAgentError } from './agent-event-system';
import { 
  AppError, 
  NetworkError, 
  TimeoutError, 
  ApiError, 
  AuthenticationError, 
  ValidationError,
  ErrorType 
} from '../errors';

export class ErrorHandler {
  private static instance: ErrorHandler;
  
  private constructor() {}
  
  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }
  
  /**
   * Классифицирует ошибку и возвращает понятное сообщение для пользователя
   */
  public classifyError(error: unknown, context?: string): ErrorClassification {
    // Если ошибка уже является нашей классификацией, возвращаем её
    if (error && typeof error === 'object' && 'type' in error && 'userMessage' in error) {
      return error as ErrorClassification;
    }
    
    const getErrorMessage = (error: unknown): string => {
      if (typeof error === 'string') {
        return error;
      }
      
      if (error instanceof Error) {
        return error.message;
      }
      
      if (error && typeof error === 'object') {
        // Проверяем различные форматы API ошибок
        if ('message' in error) {
          return String(error.message);
        }
        if ('error' in error) {
          const errorObj = error.error;
          if (typeof errorObj === 'string') {
            return errorObj;
          }
          if (errorObj && typeof errorObj === 'object' && 'message' in errorObj) {
            return String(errorObj.message);
          }
        }
      }
      
      return String(error);
    };
    
    const errorMessage = getErrorMessage(error);
    
    // Проверяем известные классы ошибок
    if (error instanceof AppError) {
      return {
        type: error.type.toLowerCase() as ErrorType,
        userMessage: error.userMessage,
        technicalMessage: errorMessage,
        shouldRetry: error.shouldRetry
      };
    }
    
    // Неизвестная ошибка
    return {
      type: ErrorType.UNKNOWN,
      userMessage: 'Произошла непредвиденная ошибка. Попробуйте еще раз.',
      technicalMessage: errorMessage,
      shouldRetry: false
    };
  }
  
  /**
   * Логирует ошибку в консоль
   */
  public logError(error: unknown, classification: ErrorClassification, context?: string): void {
    const logData = {
      type: classification.type,
      userMessage: classification.userMessage,
      technicalMessage: classification.technicalMessage,
      context,
      timestamp: new Date().toISOString(),
      originalError: error
    };
    
    console.error(`[ErrorHandler] ${classification.type.toUpperCase()}:`, logData);
  }
  
  /**
   * Показывает пользователю понятное сообщение об ошибке через централизованную систему событий
   */
  public showError(classification: ErrorClassification, context?: string, error?: unknown): void {
    emitAgentError({
      message: classification.userMessage,
      description: classification.technicalMessage,
      source: 'error-handler',
      scope: context,
      context: classification.shouldRetry ? { shouldRetry: classification.shouldRetry } : undefined,
      error
    });

    if (typeof window === 'undefined') {
      console.error('Toast error:', JSON.stringify(classification.userMessage, null, 2));
    }
  }
  
  /**
   * Обрабатывает ошибку: классифицирует, логирует и показывает пользователю
   */
  public handleError(error: unknown, context?: string): ErrorClassification {
    const classification = this.classifyError(error, context);
    this.logError(error, classification, context);
    this.showError(classification, context, error);
    return classification;
  }
}

// Экспорт singleton экземпляра
export const errorHandler = ErrorHandler.getInstance();

// Делаем доступным в window для тестирования
if (typeof window !== 'undefined') {
  (window as unknown as { errorHandler: typeof errorHandler }).errorHandler = errorHandler;
}