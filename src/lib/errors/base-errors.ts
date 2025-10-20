export enum ErrorType {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  API = 'API',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN'
}

export abstract class AppError extends Error {
  abstract readonly type: ErrorType;
  abstract readonly userMessage: string;
  abstract readonly shouldRetry: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}