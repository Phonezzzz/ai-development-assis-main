export interface RoutingLogEntry {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'routing';
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'model-selection' | 'routing' | 'api-call' | 'performance' | 'error';
  message: string;
  data?: unknown;
  duration?: number;
  requestId?: string;
  model?: string;
  provider?: string;
  endpoint?: string;
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  modelUsage: Record<string, number>;
  providerUsage: Record<string, number>;
  errorTypes: Record<string, number>;
}

export interface RoutingStats {
  requests: RoutingLogEntry[];
  metrics: RequestMetrics;
  lastUpdated: Date;
}

class RoutingLogger {
  private static instance: RoutingLogger;
  private logs: RoutingLogEntry[] = [];
  private maxLogs = 1000;
  private storageKey = 'routing-logs';
  private metrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    modelUsage: {},
    providerUsage: {},
    errorTypes: {}
  };

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): RoutingLogger {
    if (!RoutingLogger.instance) {
      RoutingLogger.instance = new RoutingLogger();
    }
    return RoutingLogger.instance;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        if (Array.isArray(data.logs)) {
          this.logs = data.logs.map((log: { id: string; timestamp: string; type: string; level: string; category: string; message: string; data?: unknown; requestId?: string; duration?: number }) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          }));
        } else {
          this.logs = [];
        }
        this.metrics = data.metrics || this.metrics;
      }
    } catch (error) {
      console.error('Failed to load routing logs from storage:', JSON.stringify(error, null, 2));
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        logs: this.logs,
        metrics: this.metrics,
        lastUpdated: new Date()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save routing logs to storage:', JSON.stringify(error, null, 2));
    }
  }

  private addLog(entry: Omit<RoutingLogEntry, 'id' | 'timestamp'>): string {
    const logEntry: RoutingLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date()
    };

    this.logs.unshift(logEntry);
    
    // Ограничиваем количество логов
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.updateMetrics(logEntry);
    this.saveToStorage();

    // Вывод в консоль для отладки
    console.log(`[RoutingLogger] ${entry.level.toUpperCase()} [${entry.category}] ${entry.message}`, entry.data);

    return logEntry.id;
  }

  private generateId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMetrics(entry: RoutingLogEntry): void {
    switch (entry.type) {
      case 'request':
        this.metrics.totalRequests++;
        if (entry.model) {
          this.metrics.modelUsage[entry.model] = (this.metrics.modelUsage[entry.model] || 0) + 1;
        }
        if (entry.provider) {
          this.metrics.providerUsage[entry.provider] = (this.metrics.providerUsage[entry.provider] || 0) + 1;
        }
        break;
      case 'response':
        if (entry.duration) {
          const totalResponseTime = this.metrics.averageResponseTime * (this.metrics.successfulRequests || 1);
          this.metrics.successfulRequests++;
          this.metrics.averageResponseTime = (totalResponseTime + entry.duration) / this.metrics.successfulRequests;
        }
        break;
      case 'error':
        this.metrics.failedRequests++;
        if (entry.data && typeof entry.data === 'object' && 'errorType' in entry.data) {
          const errorData = entry.data as Record<string, unknown>;
          this.metrics.errorTypes[errorData.errorType as string] = (this.metrics.errorTypes[errorData.errorType as string] || 0) + 1;
        }
        break;
    }
  }

  // Методы логирования
  logModelSelection(model: string, provider: string, reason?: string): string {
    return this.addLog({
      type: 'routing',
      level: 'info',
      category: 'model-selection',
      message: `Model selected: ${model}`,
      data: { model, provider, reason },
      model,
      provider
    });
  }

  logRoutingDecision(requestId: string, model: string, endpoint: string, isLocal: boolean): string {
    return this.addLog({
      type: 'routing',
      level: 'info',
      category: 'routing',
      message: `Routing to ${isLocal ? 'LOCAL' : 'OPENROUTER'}: ${model}`,
      data: { requestId, model, endpoint, isLocal },
      requestId,
      model,
      endpoint
    });
  }

  logApiCall(requestId: string, method: string, url: string, payload?: unknown): string {
    return this.addLog({
      type: 'request',
      level: 'info',
      category: 'api-call',
      message: `API Call: ${method} ${url}`,
      data: { requestId, method, url, payload },
      requestId
    });
  }

  logApiResponse(requestId: string, status: number, duration: number, responseSize?: number): string {
    return this.addLog({
      type: 'response',
      level: 'info',
      category: 'api-call',
      message: `API Response: ${status} (${duration}ms)`,
      data: { requestId, status, responseSize },
      requestId,
      duration
    });
  }

  logError(requestId: string, error: Error | string, context?: unknown): string {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
    
    return this.addLog({
      type: 'error',
      level: 'error',
      category: 'error',
      message: `Error: ${errorMessage}`,
      data: { 
        requestId, 
        error: errorMessage, 
        errorType, 
        stack: error instanceof Error ? error.stack : undefined,
        context 
      },
      requestId
    });
  }

  logPerformance(requestId: string, operation: string, duration: number, details?: unknown): string {
    return this.addLog({
      type: 'request',
      level: 'debug',
      category: 'performance',
      message: `Performance: ${operation} took ${duration}ms`,
      data: { requestId, operation, duration, ...(details as Record<string, unknown>) },
      requestId,
      duration
    });
  }

  logDebug(message: string, data?: unknown): string {
    return this.addLog({
      type: 'routing',
      level: 'debug',
      category: 'routing',
      message,
      data
    });
  }

  logWarning(message: string, data?: unknown): string {
    return this.addLog({
      type: 'routing',
      level: 'warn',
      category: 'routing',
      message,
      data
    });
  }

  // Методы для анализа и диагностики
  getLogs(filter?: {
    type?: RoutingLogEntry['type'];
    level?: RoutingLogEntry['level'];
    category?: RoutingLogEntry['category'];
    model?: string;
    provider?: string;
    requestId?: string;
    startTime?: Date;
    endTime?: Date;
    search?: string;
  }): RoutingLogEntry[] {
    let filteredLogs = [...this.logs];

    if (filter) {
      if (filter.type) {
        filteredLogs = filteredLogs.filter(log => log.type === filter.type);
      }
      if (filter.level) {
        filteredLogs = filteredLogs.filter(log => log.level === filter.level);
      }
      if (filter.category) {
        filteredLogs = filteredLogs.filter(log => log.category === filter.category);
      }
      if (filter.model) {
        filteredLogs = filteredLogs.filter(log => log.model === filter.model);
      }
      if (filter.provider) {
        filteredLogs = filteredLogs.filter(log => log.provider === filter.provider);
      }
      if (filter.requestId) {
        filteredLogs = filteredLogs.filter(log => log.requestId === filter.requestId);
      }
      if (filter.startTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filter.endTime!);
      }
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        filteredLogs = filteredLogs.filter(log => 
          log.message.toLowerCase().includes(searchLower) ||
          JSON.stringify(log.data).toLowerCase().includes(searchLower)
        );
      }
    }

    return filteredLogs;
  }

  getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  getStats(): RoutingStats {
    return {
      requests: this.logs,
      metrics: this.metrics,
      lastUpdated: new Date()
    };
  }

  getRequestById(requestId: string): RoutingLogEntry[] {
    return this.logs.filter(log => log.requestId === requestId);
  }

  getRecentLogs(count: number = 50): RoutingLogEntry[] {
    return this.logs.slice(0, count);
  }

  getErrors(count: number = 50): RoutingLogEntry[] {
    return this.logs
      .filter(log => log.type === 'error')
      .slice(0, count);
  }

  getSlowRequests(thresholdMs: number = 5000): RoutingLogEntry[] {
    return this.logs
      .filter(log => log.duration && log.duration > thresholdMs)
      .slice(0, 50);
  }

  clearLogs(): void {
    this.logs = [];
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      modelUsage: {},
      providerUsage: {},
      errorTypes: {}
    };
    this.saveToStorage();
  }

  exportLogs(): string {
    const exportData = {
      logs: this.logs,
      metrics: this.metrics,
      exportedAt: new Date(),
      version: '1.0'
    };
    return JSON.stringify(exportData, null, 2);
  }

  importLogs(jsonData: string): {
    success: boolean;
    imported: number;
    skipped: number;
    errors: Array<{index: number; reason: string}>
  } {
    const result = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [] as Array<{index: number; reason: string}>
    };

    let data: unknown;
    try {
      data = JSON.parse(jsonData);
    } catch (error) {
      const message = `Неверный формат JSON: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message);
      throw new Error(message);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Недоступный источник: data не является объектом');
    }

    const dataObj = data as Record<string, unknown>;

    if (!dataObj.logs || !Array.isArray(dataObj.logs)) {
      throw new Error('Неверный формат: logs должен быть массивом');
    }

    const logs = dataObj.logs;
    const importedLogs: RoutingLogEntry[] = [];

    logs.forEach((log, index) => {
      try {
        if (!log || typeof log !== 'object') {
          result.errors.push({ index, reason: 'Запись не является объектом' });
          result.skipped++;
          return;
        }

        const logEntry = log as Record<string, unknown>;

        if (!logEntry.id || typeof logEntry.id !== 'string') {
          result.errors.push({ index, reason: 'Отсутствует поле id' });
          result.skipped++;
          return;
        }

        if (!logEntry.timestamp) {
          result.errors.push({ index, reason: 'Отсутствует поле timestamp' });
          result.skipped++;
          return;
        }

        importedLogs.push({
          ...logEntry,
          timestamp: new Date(String(logEntry.timestamp))
        } as RoutingLogEntry);

        result.imported++;
      } catch (error) {
        result.errors.push({
          index,
          reason: error instanceof Error ? error.message : String(error)
        });
        result.skipped++;
      }
    });

    if (importedLogs.length === 0 && result.errors.length > 0) {
      throw new Error(`Невозможность записи: все ${logs.length} записей содержат ошибки`);
    }

    this.logs = importedLogs;
    this.metrics = (dataObj.metrics || this.metrics) as RequestMetrics;

    try {
      this.saveToStorage();
    } catch (error) {
      const message = `Ошибка записи в localStorage: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message);
      throw new Error(message);
    }

    result.success = true;
    return result;
  }
}

export const routingLogger = RoutingLogger.getInstance();