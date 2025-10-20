import { useCallback, useRef, useState } from 'react';
import type { PendingPlan } from '@/lib/types';
import type { PlanDeps } from '@/lib/services/PlanManager';
import { buildPlanFromInput, executePlan } from '@/lib/services/PlanManager';

type PlanStatus = 'idle' | 'planning' | 'ready' | 'executing' | 'done';

interface UsePlanExecutionOptions {
  depsFactory: () => Omit<PlanDeps, 'signal'>;
}

interface UsePlanExecutionReturn {
  status: PlanStatus;
  error: string | null;
  plan: (text: string) => Promise<PendingPlan>;
  act: (plan: PendingPlan, startIndex?: number) => Promise<void>;
  cancel: () => void;
}

/**
 * Hook для управления жизненным циклом выполнения плана
 * Обеспечивает чистую связку между компонентами и PlanManager
 *
 * @example
 * const { status, plan, act, cancel } = usePlanExecution(() => ({
 *   llm: { askQuestion: llmService.ask },
 *   modelId: 'gpt-4',
 *   // ... остальные deps
 * }));
 */
export function usePlanExecution({
  depsFactory,
}: UsePlanExecutionOptions): UsePlanExecutionReturn {
  const [status, setStatus] = useState<PlanStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController>(new AbortController());

  // Собираем deps с текущим AbortSignal
  const depsWithSignal = useCallback((): PlanDeps => {
    return {
      ...depsFactory(),
      signal: abortRef.current.signal,
    };
  }, [depsFactory]);

  // Генерирует план из пользовательского запроса
  const plan = useCallback(async (text: string): Promise<PendingPlan> => {
    setError(null);
    setStatus('planning');

    try {
      const result = await buildPlanFromInput(text, depsWithSignal());
      setStatus('ready');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus('ready');
      throw err; // FAIL-FAST: пробрасываем ошибку дальше
    }
  }, [depsWithSignal]);

  // Выполняет план с возможностью resumption
  const act = useCallback(
    async (planData: PendingPlan, startIndex: number = 0): Promise<void> => {
      setError(null);
      setStatus('executing');

      try {
        await executePlan(planData, depsWithSignal(), startIndex);
        setStatus('done');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Если это отмена - это нормально, возвращаемся в ready для resumption
        if (message.includes('aborted')) {
          setStatus('ready');
          return;
        }

        // Для других ошибок - логируем и переходим в ready для ретрая
        setError(message);
        setStatus('ready');
        throw err; // FAIL-FAST: пробрасываем ошибку дальше
      }
    },
    [depsWithSignal]
  );

  // Отменяет текущее выполнение
  const cancel = useCallback(() => {
    // Вызываем abort на текущем controller
    abortRef.current.abort();
    // Создаём новый для возможных будущих операций
    abortRef.current = new AbortController();
    // Статус уже будет установлен в 'ready' внутри executePlan при обработке abort
    setStatus('ready');
    setError(null);
  }, []);

  return { status, error, plan, act, cancel };
}
