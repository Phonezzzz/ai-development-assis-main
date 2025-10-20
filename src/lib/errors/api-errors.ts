import { AppError, ErrorType } from './base-errors';

export class ProcessedError extends AppError {
  readonly type = ErrorType.API;
  readonly userMessage = 'Ошибка уже обработана системой';
  readonly shouldRetry = false;

  constructor(message?: string) {
    super(message || 'Error already processed');
  }
}

export class ApiError extends AppError {
  readonly type = ErrorType.API;
  readonly userMessage = 'Ошибка при выполнении запроса к API';
  readonly shouldRetry = false;

  constructor(message?: string) {
    super(message || 'API request failed');
  }
}

export class AuthenticationError extends AppError {
  readonly type = ErrorType.AUTHENTICATION;
  readonly userMessage = 'Ошибка аутентификации. Проверьте ваши учетные данные';
  readonly shouldRetry = false;

  constructor(message?: string) {
    super(message || 'Authentication failed');
  }
}

export class ValidationError extends AppError {
  readonly type = ErrorType.VALIDATION;
  readonly userMessage = 'Ошибка валидации данных';
  readonly shouldRetry = false;

  constructor(message?: string) {
    super(message || 'Data validation failed');
  }
}