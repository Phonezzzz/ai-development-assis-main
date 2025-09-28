import { useState, useCallback, useEffect } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { smartContextService, ContextAnalysisResult, SmartContextOptions } from '@/lib/services/smart-context';
import { WorkMode, Message } from '@/lib/types';

export interface UseSmartContextOptions {
  autoSearch?: boolean;
  debounceMs?: number;
  maxResults?: number;
}

export interface SmartContextState {
  isLoading: boolean;
  context: ContextAnalysisResult | null;
  error: string | null;
  lastQuery: string | null;
}

export function useSmartContext(options: UseSmartContextOptions = {}) {
  const {
    autoSearch = false,
    debounceMs = 500,
    maxResults = 10,
  } = options;

  // Состояние контекста
  const [state, setState] = useState<SmartContextState>({
    isLoading: false,
    context: null,
    error: null,
    lastQuery: null,
  });

  // Кэш контекста для быстрого доступа
  const [contextCache, setContextCache] = useKV<Record<string, ContextAnalysisResult>>('context-cache', {});

  // Debounce timer
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  /**
   * Поиск релевантного контекста
   */
  const searchContext = useCallback(async (
    query: string, 
    mode: WorkMode, 
    searchOptions: SmartContextOptions = {}
  ) => {
    if (!query.trim()) {
      setState(prev => ({ ...prev, context: null, lastQuery: null }));
      return;
    }

    // Проверяем кэш
    const cacheKey = `${query}-${mode}-${JSON.stringify(searchOptions)}`;
    const cachedResult = contextCache[cacheKey];
    if (cachedResult) {
      setState(prev => ({
        ...prev,
        context: cachedResult,
        lastQuery: query,
        error: null,
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const context = await smartContextService.findRelevantContext(
        query, 
        mode, 
        { maxResults, ...searchOptions }
      );

      // Сохраняем в кэш
      setContextCache(prev => ({
        ...prev,
        [cacheKey]: context,
      }));

      setState(prev => ({
        ...prev,
        isLoading: false,
        context,
        lastQuery: query,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Ошибка поиска контекста',
      }));
    }
  }, [maxResults]);

  /**
   * Поиск с дебаунсом
   */
  const debouncedSearch = useCallback((
    query: string, 
    mode: WorkMode, 
    searchOptions: SmartContextOptions = {}
  ) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      searchContext(query, mode, searchOptions);
    }, debounceMs);

    setDebounceTimer(timer);
  }, [searchContext, debounceMs]);

  /**
   * Добавляет сообщение в контекст
   */
  const addMessageToContext = useCallback(async (message: Message) => {
    try {
      await smartContextService.addMessageToContext(message);
      // Очищаем кэш, чтобы следующий поиск учел новое сообщение
      setContextCache({});
    } catch (error) {
      console.error('Error adding message to context:', error);
    }
  }, [setContextCache]);

  /**
   * Добавляет файл в контекст
   */
  const addFileToContext = useCallback(async (
    filepath: string, 
    content: string, 
    metadata: Record<string, any> = {}
  ) => {
    try {
      await smartContextService.addFileToContext(filepath, content, metadata);
      setContextCache({});
    } catch (error) {
      console.error('Error adding file to context:', error);
    }
  }, [setContextCache]);

  /**
   * Добавляет план в контекст
   */
  const addPlanToContext = useCallback(async (
    planId: string,
    description: string,
    steps: string[],
    metadata: Record<string, any> = {}
  ) => {
    try {
      await smartContextService.addPlanToContext(planId, description, steps, metadata);
      setContextCache({});
    } catch (error) {
      console.error('Error adding plan to context:', error);
    }
  }, [setContextCache]);

  /**
   * Добавляет код в контекст
   */
  const addCodeToContext = useCallback(async (
    codeId: string,
    code: string,
    language: string,
    description?: string,
    metadata: Record<string, any> = {}
  ) => {
    try {
      await smartContextService.addCodeToContext(codeId, code, language, description, metadata);
      setContextCache({});
    } catch (error) {
      console.error('Error adding code to context:', error);
    }
  }, [setContextCache]);

  /**
   * Добавляет ошибку в контекст
   */
  const addErrorToContext = useCallback(async (
    errorId: string,
    errorMessage: string,
    stackTrace?: string,
    resolution?: string,
    metadata: Record<string, any> = {}
  ) => {
    try {
      await smartContextService.addErrorToContext(errorId, errorMessage, stackTrace, resolution, metadata);
      setContextCache({});
    } catch (error) {
      console.error('Error adding error to context:', error);
    }
  }, [setContextCache]);

  /**
   * Очищает кэш контекста
   */
  const clearContextCache = useCallback(() => {
    setContextCache({});
    setState(prev => ({ ...prev, context: null, lastQuery: null, error: null }));
  }, [setContextCache]);

  /**
   * Получает быстрые предложения на основе контекста
   */
  const getQuickSuggestions = useCallback((query: string, mode: WorkMode): string[] => {
    if (!state.context) return [];

    const { suggestedQuestions, keyTopics } = state.context;
    const suggestions = [...suggestedQuestions];

    // Добавляем предложения на основе ключевых тем
    keyTopics.slice(0, 3).forEach(topic => {
      if (mode === 'plan') {
        suggestions.push(`Создать план для ${topic}`);
      } else if (mode === 'act') {
        suggestions.push(`Реализовать ${topic}`);
      }
    });

    return suggestions.slice(0, 8);
  }, [state.context]);

  /**
   * Получает контекстную информацию для отображения
   */
  const getContextInfo = useCallback(() => {
    if (!state.context) return null;

    const { relevantDocuments, contextSummary } = state.context;
    
    return {
      summary: contextSummary,
      documentCount: relevantDocuments.length,
      types: relevantDocuments.reduce((acc, doc) => {
        acc[doc.type] = (acc[doc.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      avgRelevance: relevantDocuments.length > 0 
        ? relevantDocuments.reduce((sum, doc) => sum + (doc.relevanceScore || 0), 0) / relevantDocuments.length
        : 0,
    };
  }, [state.context]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  return {
    // Состояние
    isLoading: state.isLoading,
    context: state.context,
    error: state.error,
    lastQuery: state.lastQuery,

    // Методы поиска
    searchContext: autoSearch ? debouncedSearch : searchContext,
    debouncedSearch,
    
    // Методы добавления контекста
    addMessageToContext,
    addFileToContext,
    addPlanToContext,
    addCodeToContext,
    addErrorToContext,
    
    // Утилиты
    clearContextCache,
    getQuickSuggestions,
    getContextInfo,
  };
}