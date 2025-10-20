import { useState, useCallback, useEffect, useMemo } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { Message } from '@/lib/types';
import { measureOperation } from '@/lib/services/performance-monitor';

interface ContextTracker {
  totalTokens: number;
  messagesTokens: number;
  systemTokens: number;
  fileContextTokens: number;
  lastCalculated: Date;
}

export function useContextTracker() {
  const [contextData, setContextData] = useKV<ContextTracker>('context-tracker', {
    totalTokens: 0,
    messagesTokens: 0,
    systemTokens: 0,
    fileContextTokens: 0,
    lastCalculated: new Date()
  });

  // Примерная оценка токенов для текста (1 токен ≈ 4 символа для русского текста)
  const estimateTokens = useMemo(() => (text: string): number => {
    if (!text) return 0;

    // Для русского текста: примерно 1 токен на 3-4 символа
    // Для английского: примерно 1 токен на 4-5 символов
    // Используем консервативную оценку 3.5 символа на токен
    return Math.ceil(text.length / 3.5);
  }, []);

  // Подсчет токенов для сообщений
  const calculateMessagesTokens = useMemo(() => (messages: Message[]): number => {
    return messages.reduce((total, message) => {
      // Базовые токены сообщения (метаданные)
      const metadataTokens = 10;

      // Токены контента
      const contentTokens = estimateTokens(message.content);

      return total + metadataTokens + contentTokens;
    }, 0);
  }, [estimateTokens]);

  // Подсчет системных токенов (промпты, правила работы и т.д.)
  const calculateSystemTokens = useMemo(() => (
    workRulesText: string = '',
    todoContext: string = '',
    modelInstructions: string = ''
  ): number => {
    const workRulesTokens = estimateTokens(workRulesText);
    const todoTokens = estimateTokens(todoContext);
    const instructionsTokens = estimateTokens(modelInstructions);

    // Базовые системные токены для форматирования и структуры
    const baseSystemTokens = 500;

    return baseSystemTokens + workRulesTokens + todoTokens + instructionsTokens;
  }, [estimateTokens]);

  // Подсчет токенов для файлового контекста
  const calculateFileContextTokens = useMemo(() => (
    selectedFiles: string[] = [],
    fileContents: Record<string, string> = {}
  ): number => {
    return selectedFiles.reduce((total, fileId) => {
      const content = fileContents[fileId] || '';
      return total + estimateTokens(content);
    }, 0);
  }, [estimateTokens]);

  // Обновление общего подсчета контекста
  const updateContextUsage = useCallback((
    messages: Message[],
    workRulesText: string = '',
    todoContext: string = '',
    modelInstructions: string = '',
    selectedFiles: string[] = [],
    fileContents: Record<string, string> = {}
  ) => {
    return measureOperation('context:update-usage', () => {
      const messagesTokens = calculateMessagesTokens(messages);
      const systemTokens = calculateSystemTokens(workRulesText, todoContext, modelInstructions);
      const fileContextTokens = calculateFileContextTokens(selectedFiles, fileContents);

      const totalTokens = messagesTokens + systemTokens + fileContextTokens;

      const newContextData: ContextTracker = {
        totalTokens,
        messagesTokens,
        systemTokens,
        fileContextTokens,
        lastCalculated: new Date()
      };

      setContextData(newContextData);
      return newContextData;
    }, {
      data: {
        messageCount: messages.length,
        selectedFileCount: selectedFiles.length
      },
      onSuccessData: (context) => ({
        totalTokens: context.totalTokens,
        messagesTokens: context.messagesTokens,
        systemTokens: context.systemTokens,
        fileContextTokens: context.fileContextTokens
      })
    });
  }, [
    calculateMessagesTokens,
    calculateSystemTokens,
    calculateFileContextTokens,
    setContextData
  ]);

  // Получение текущего использования контекста
  const getCurrentUsage = useCallback((): number => {
    return contextData.totalTokens;
  }, [contextData]);

  // Получение детальной информации о распределении токенов
  const getContextBreakdown = useCallback(() => {
    return {
      total: contextData.totalTokens,
      messages: contextData.messagesTokens,
      system: contextData.systemTokens,
      files: contextData.fileContextTokens,
      lastCalculated: contextData.lastCalculated
    };
  }, [contextData]);

  // Проверка, приближается ли лимит контекста
  const checkContextLimit = useCallback((maxTokens: number) => {
    const current = getCurrentUsage();
    const percentage = (current / maxTokens) * 100;

    return {
      percentage,
      isNearLimit: percentage > 80,
      isAtLimit: percentage > 95,
      remainingTokens: Math.max(0, maxTokens - current),
      estimatedMessagesLeft: Math.floor((maxTokens - current) / 500) // Предполагаем ~500 токенов на сообщение
    };
  }, [getCurrentUsage]);

  // Очистка старых данных контекста
  const resetContext = useCallback(() => {
    setContextData({
      totalTokens: 0,
      messagesTokens: 0,
      systemTokens: 0,
      fileContextTokens: 0,
      lastCalculated: new Date()
    });
  }, [setContextData]);

  return useMemo(() => ({
    // Данные
    contextData,
    getCurrentUsage,
    getContextBreakdown,

    // Вычисления
    estimateTokens,
    updateContextUsage,
    checkContextLimit,

    // Утилиты
    resetContext
  }), [
    // Зависимости для стабильности возвращаемого объекта
    contextData,
    getCurrentUsage,
    getContextBreakdown,
    estimateTokens,
    updateContextUsage,
    checkContextLimit,
    resetContext
  ]);
}