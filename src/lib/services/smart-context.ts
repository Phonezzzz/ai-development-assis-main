import { vectorService, VectorDocument, VectorSearchOptions } from './vector';
import { Message } from '@/lib/types';
import { serviceHealth } from './service-health';
import { toast } from 'sonner';

export interface ContextDocument {
  id: string;
  content: string;
  type: 'message' | 'file' | 'plan' | 'code' | 'error';
  timestamp: Date;
  metadata?: Record<string, unknown>;
  relevanceScore?: number;
}

export interface SmartContextOptions {
  maxResults?: number;
  includeHistory?: boolean;
  includeFiles?: boolean;
  includePlans?: boolean;
  minRelevanceScore?: number;
  timeWindow?: number; // hours
}

export interface ContextAnalysisResult {
  relevantDocuments: ContextDocument[];
  suggestedQuestions: string[];
  keyTopics: string[];
  contextSummary: string;
}

class SmartContextService {
  private readonly DEFAULT_OPTIONS: SmartContextOptions = {
    maxResults: 10,
    includeHistory: true,
    includeFiles: true,
    includePlans: true,
    minRelevanceScore: 0.6,
    timeWindow: 24, // 24 hours
  };

  /**
   * Упрощенный поиск при недоступности векторного сервиса
   */
  private async fallbackSearch(
    query: string,
    mode: string,
    options: SmartContextOptions
  ): Promise<ContextAnalysisResult> {
    // Возвращаем пустой результат с предупреждением
    console.warn('Используется упрощенный режим поиска (fallback)');
    
    return {
      relevantDocuments: [],
      suggestedQuestions: [],
      keyTopics: [],
      contextSummary: 'Векторный поиск недоступен. Используется упрощенный режим.',
    };
  }

  /**
   * Ищет релевантный контекст для заданного запроса
   * @returns Массив релевантных фрагментов с score для каждого
   * @throws Error при ошибках I/O, таймаутах, неверной конфигурации
   */
  async findRelevantContext(
    query: string,
    mode: string,
    options: SmartContextOptions = {}
  ): Promise<Array<{ id: string; text: string; score: number }>> {
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

    // Поиск релевантных документов
    const searchOptions: VectorSearchOptions = {
      limit: mergedOptions.maxResults,
      threshold: mergedOptions.minRelevanceScore,
      filter: this.buildFilter(mergedOptions, mode),
    };

    // Явная проверка доступности векторного поиска
    const isVectorSearchAvailable = await serviceHealth.checkService(
      'vector-search',
      async () => vectorService.isAvailable()
    );

    if (!isVectorSearchAvailable) {
      const error = new Error('Векторный поиск недоступен');
      console.error('Vector search unavailable:', error);
      toast.warning('Векторный поиск недоступен');
      throw error;
    }

    const vectorResults = await vectorService.search(query, searchOptions);

    // Если нет совпадений - возвращаем пустой массив
    if (!vectorResults || vectorResults.length === 0) {
      return [];
    }

    // Преобразуем в упорядоченный список с score
    return vectorResults.map(doc => ({
      id: doc.id,
      text: doc.content,
      score: doc.similarity || 0
    })).sort((a, b) => b.score - a.score); // Сортируем по убыванию score
  }

  /**
   * Добавляет сообщение в контекстную базу
   * @throws Error при ошибках записи в векторную БД
   */
  async addMessageToContext(message: Message): Promise<void> {
    const document: VectorDocument = {
      id: message.id,
      content: message.content,
      metadata: {
        type: 'message',
        messageType: message.type,
        agentType: message.agentType,
        isVoice: message.isVoice || false,
        timestamp: message.timestamp.toISOString(),
      },
    };

    try {
      await vectorService.addDocument(document);
    } catch (error) {
      console.error('Error adding message to context:', error);
      throw new Error(`Failed to add message to context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Добавляет файл проекта в контекстную базу
   * @throws Error при ошибках записи
   */
  async addFileToContext(
    filepath: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const document: VectorDocument = {
      id: `file_${filepath}`,
      content: `Файл: ${filepath}\n\nСодержимое:\n${content}`,
      metadata: {
        type: 'file',
        filepath,
        fileType: this.getFileType(filepath),
        size: content.length,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      await vectorService.addDocument(document);
    } catch (error) {
      console.error('Error adding file to context:', error);
      throw new Error(`Failed to add file to context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Добавляет план в контекстную базу
   * @throws Error при ошибках записи
   */
  async addPlanToContext(
    planId: string,
    description: string,
    steps: string[],
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const content = `План: ${description}\n\nШаги:\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;

    const document: VectorDocument = {
      id: `plan_${planId}`,
      content,
      metadata: {
        type: 'plan',
        planId,
        stepCount: steps.length,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      await vectorService.addDocument(document);
    } catch (error) {
      console.error('Error adding plan to context:', error);
      throw new Error(`Failed to add plan to context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Добавляет код в контекстную базу
   * @throws Error при ошибках записи
   */
  async addCodeToContext(
    codeId: string,
    code: string,
    language: string,
    description?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const content = `${description ? `Описание: ${description}\n\n` : ''}Код (${language}):\n\`\`\`${language}\n${code}\n\`\`\``;

    const document: VectorDocument = {
      id: `code_${codeId}`,
      content,
      metadata: {
        type: 'code',
        language,
        codeLength: code.length,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      await vectorService.addDocument(document);
    } catch (error) {
      console.error('Error adding code to context:', error);
      throw new Error(`Failed to add code to context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Добавляет ошибку в контекстную базу
   * @throws Error при ошибках записи
   */
  async addErrorToContext(
    errorId: string,
    errorMessage: string,
    stackTrace?: string,
    resolution?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const content = `Ошибка: ${errorMessage}${stackTrace ? `\n\nСтек вызовов:\n${stackTrace}` : ''}${resolution ? `\n\nРешение:\n${resolution}` : ''}`;

    const document: VectorDocument = {
      id: `error_${errorId}`,
      content,
      metadata: {
        type: 'error',
        severity: this.getErrorSeverity(errorMessage),
        resolved: !!resolution,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      await vectorService.addDocument(document);
    } catch (error) {
      console.error('Error adding error to context:', error);
      throw new Error(`Failed to add error to context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Очищает старые документы из контекстной базы
   */
  async cleanupOldContext(maxAgeHours: number = 168): Promise<void> {
    // В реальной реализации здесь бы был запрос к векторной БД
    // для удаления старых документов
    console.log(`Cleanup of documents older than ${maxAgeHours} hours would be performed here`);
  }

  /**
   * Создает фильтр для поиска
   */
  private buildFilter(options: SmartContextOptions, mode: string): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    
    // Фильтр по типам документов
    const allowedTypes: string[] = [];
    if (options.includeHistory) allowedTypes.push('message');
    if (options.includeFiles) allowedTypes.push('file', 'code');
    if (options.includePlans) allowedTypes.push('plan');
    
    if (allowedTypes.length > 0) {
      filter.type = { $in: allowedTypes };
    }

    // Фильтр по времени
    if (options.timeWindow) {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - options.timeWindow);
      filter.timestamp = { $gte: cutoffTime.toISOString() };
    }

    return filter;
  }

  /**
   * Преобразует результаты поиска
   */
  private transformSearchResults(
    results: Array<{ id: string; content: string; metadata: Record<string, unknown>; score: number }>,
    options: SmartContextOptions
  ): ContextDocument[] {
    return results.map(result => {
      const type = result.metadata ? result.metadata.type : undefined;
      const validTypes = ['message', 'file', 'plan', 'code', 'error'] as const;
      const documentType = typeof type === 'string' && (validTypes as readonly string[]).includes(type)
        ? type as ContextDocument['type']
        : 'message';
      
      return {
        id: result.id,
        content: result.content,
        type: documentType,
        timestamp: new Date((result.metadata ? result.metadata.timestamp : undefined) as string || Date.now()),
        metadata: result.metadata,
        relevanceScore: result.score,
      };
    });
  }

  /**
   * Извлекает ключевые темы из документов
   */
  private extractKeyTopics(documents: ContextDocument[]): string[] {
    const topicCounts = new Map<string, number>();
    
    documents.forEach(doc => {
      // Простое извлечение ключевых слов
      const words = doc.content
        .toLowerCase()
        .replace(/[^\w\s\u0400-\u04FF]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3);
      
      words.forEach(word => {
        topicCounts.set(word, (topicCounts.get(word) || 0) + 1);
      });
    });

    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  /**
   * Генерировал предлагаемые вопросы
   */
  private async generateSuggestedQuestions(
    query: string, 
    documents: ContextDocument[], 
    mode: string
  ): Promise<string[]> {
    // В реальной реализации здесь бы использовался LLM для генерации вопросов
    const suggestions: string[] = [];
    
    if (mode === 'plan') {
      suggestions.push(
        'Можете детализировать план?',
        'Есть ли альтернативные подходы?',
        'Какие риски нужно учесть?'
      );
    } else if (mode === 'act') {
      suggestions.push(
        'Показать примеры кода',
        'Объяснить шаги выполнения',
        'Протестировать решение'
      );
    }

    // Добавляем предложения на основе контекста
    const fileTypes = new Set(documents
      .filter(doc => doc.type === 'file')
      .map(doc => doc.metadata ? doc.metadata.fileType : undefined)
      .filter(Boolean));

    if (fileTypes.has('typescript') || fileTypes.has('javascript')) {
      suggestions.push('Показать TypeScript примеры');
    }
    
    if (fileTypes.has('css')) {
      suggestions.push('Помочь со стилями');
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Генерирует краткое описание контекста
   */
  private generateContextSummary(documents: ContextDocument[], keyTopics: string[]): string {
    if (documents.length === 0) {
      return 'Релевантный контекст не найден';
    }

    const typeCounts = documents.reduce((acc, doc) => {
      acc[doc.type] = (acc[doc.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const parts: string[] = [];
    
    if (typeCounts.message) {
      parts.push(`${typeCounts.message} сообщений`);
    }
    if (typeCounts.file) {
      parts.push(`${typeCounts.file} файлов`);
    }
    if (typeCounts.plan) {
      parts.push(`${typeCounts.plan} планов`);
    }
    if (typeCounts.code) {
      parts.push(`${typeCounts.code} фрагментов кода`);
    }

    let summary = `Найдено ${parts.join(', ')}`;
    
    if (keyTopics.length > 0) {
      summary += `. Основные темы: ${keyTopics.slice(0, 3).join(', ')}`;
    }

    return summary;
  }

  /**
   * Определяет тип файла по расширению
   */
  private getFileType(filepath: string): string {
    const ext = filepath.split('.').pop();
    const extLower = ext ? ext.toLowerCase() : '';
    
    const typeMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'css': 'css',
      'scss': 'scss',
      'html': 'html',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
    };

    return typeMap[extLower] || 'text';
  }

  /**
   * Определяет серьезность ошибки
   */
  private getErrorSeverity(errorMessage: string): 'low' | 'medium' | 'high' | 'critical' {
    const lowKeywords = ['warning', 'deprecated', 'notice'];
    const mediumKeywords = ['error', 'fail', 'invalid'];
    const highKeywords = ['exception', 'crash', 'fatal', 'critical'];
    const criticalKeywords = ['security', 'vulnerability', 'exploit'];

    const message = errorMessage.toLowerCase();

    if (criticalKeywords.some(keyword => message.includes(keyword))) {
      return 'critical';
    }
    if (highKeywords.some(keyword => message.includes(keyword))) {
      return 'high';
    }
    if (mediumKeywords.some(keyword => message.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }
}

export const smartContextService = new SmartContextService();