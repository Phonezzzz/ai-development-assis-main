import { useCallback } from 'react';
import { toast } from 'sonner';
import type { Message } from '@/lib/types';
import { useContextTracker } from '@/hooks/use-context-tracker';

const CONTEXT_LIMITS = {
  DEFAULT: 8000,
  CHAT: 4000,
  WORKSPACE: 12000,
  IMAGE: 2000,
};

export function useMessageContext() {
  const { getContextBreakdown } = useContextTracker();

  const calculateMessagePriority = useCallback(
    (message: Message, index: number, totalMessages: number): number => {
      let priority = 0;

      if (message.type === 'user') priority += 20;
      if (message.type === 'assistant') priority += 10;

      if (message.workspaceMode === 'act') priority += 30;
      if (message.workspaceMode === 'plan') priority += 25;
      if (message.workspaceMode === 'ask') priority += 15;

      const recencyFactor = (index / totalMessages) * 40;
      priority += recencyFactor;

      const content = message.content.toLowerCase();
      if (
        content.includes('задача завершена') ||
        content.includes('todo') ||
        content.includes('план')
      )
        priority += 20;
      if (content.includes('ошибка') || content.includes('error')) priority += 15;
      if (content.includes('важно') || content.includes('important')) priority += 10;

      return priority;
    },
    [],
  );

  const trimMessagesIfNeeded = useCallback(
    (allMessages: Message[], maxTokens: number = CONTEXT_LIMITS.DEFAULT): Message[] => {
      if (allMessages.length <= 5) return allMessages;

      const breakdown = getContextBreakdown();
      if (breakdown.total <= maxTokens) return allMessages;

      const prioritizedMessages = allMessages
        .map((msg, index) => ({
          ...msg,
          priority: calculateMessagePriority(msg, index, allMessages.length),
        }))
        .sort((a, b) => b.priority - a.priority);

      const keepRatio = 0.7;
      const keepCount = Math.max(5, Math.floor(allMessages.length * keepRatio));

      const keptMessages = prioritizedMessages
        .slice(0, keepCount)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      console.log(`Контекст обрезан: ${allMessages.length} -> ${keptMessages.length} сообщений`);
      toast.info(
        `Контекст обрезан для оптимизации: ${allMessages.length} → ${keptMessages.length} сообщений`,
      );

      return keptMessages;
    },
    [calculateMessagePriority, getContextBreakdown],
  );

  return {
    calculateMessagePriority,
    trimMessagesIfNeeded,
    CONTEXT_LIMITS,
  };
}
