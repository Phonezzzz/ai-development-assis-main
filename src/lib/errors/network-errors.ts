import { AppError, ErrorType } from './base-errors';

export class NetworkError extends AppError {
  readonly type = ErrorType.NETWORK;
  readonly userMessage = 'Не удалось подключиться к серверу';
  readonly shouldRetry = true;

  constructor(message?: string) {
    super(message || 'Network connection failed');
  }
}

export class TimeoutError extends AppError {
  readonly type = ErrorType.TIMEOUT;
  readonly userMessage = 'Превышено время ожидания ответа от сервера';
  readonly shouldRetry = true;

  constructor(message?: string) {
    super(message || 'Request timeout exceeded');
  }
}