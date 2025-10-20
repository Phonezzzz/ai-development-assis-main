/**
 * PlanManager — управление генерацией и исполнением планов
 * Чистый TS модуль без React зависимостей, полностью типизирован
 * Собирает контекст перед каждым шагом: план + история + правила + требует JSON результата
 */

import type { PendingPlan, SavePoint, StepRunResult, PendingPlanTodo } from '@/lib/types';

/**
 * Нормализует и валидирует план
 * Приводит типы к корректным значениям, добавляет id и инициализирует status шагов
 */
function normalizePlan(data: any): PendingPlan {
  // Защита от пустого/неправильного объекта
  if (!data || typeof data !== 'object' || !Array.isArray(data.todos)) {
    throw new Error('Invalid plan payload: todos must be an array');
  }

  const plan = data as PendingPlan;

  // Добавляем id если его нет
  if (!plan.id) {
    plan.id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // Валидация и нормализация каждого шага
  for (let i = 0; i < plan.todos.length; i++) {
    const todo = plan.todos[i];

    // Проверяем обязательные поля
    if (!todo.title?.trim() || !todo.description?.trim() || !todo.instructions?.trim() || !todo.expectedResult?.trim()) {
      throw new Error(`Step ${i + 1} has empty required fields`);
    }

    // Инициализируем status если нет
    if (!todo.status) {
      todo.status = 'pending';
    }

    // Нормализуем priority
    if (todo.priority && !['high', 'medium', 'low'].includes(todo.priority)) {
      todo.priority = 'medium'; // значение по умолчанию
    }

    // Нормализуем estimatedTime
    if (todo.estimatedTime !== undefined) {
      const parsed = Number(todo.estimatedTime);
      if (isNaN(parsed) || parsed < 1) {
        todo.estimatedTime = 30; // минимум и по умолчанию
      } else {
        todo.estimatedTime = Math.ceil(parsed);
      }
    } else {
      todo.estimatedTime = 30;
    }
  }

  return plan;
}

/**
 * Безопасно извлекает JSON блок из текста ответа
 * Сначала пытается найти ```json...``` блок, затем ищет {}
 */
function extractJsonBlock(text: string): string {
  // Попытка 1: ищем ```json...``` блок
  const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonFenceMatch?.[1]) {
    return jsonFenceMatch[1].trim();
  }

  // Попытка 2: ищем просто ``` блок
  const fenceMatch = text.match(/```\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // Попытка 3: ищем первый { до последнего }
  const braceStart = text.indexOf('{');
  if (braceStart !== -1) {
    const braceEnd = text.lastIndexOf('}');
    if (braceEnd > braceStart) {
      return text.substring(braceStart, braceEnd + 1).trim();
    }
  }

  throw new Error('Could not extract JSON block from response');
}

/**
 * Зависимости для работы PlanManager
 * Используется dependency injection для тестируемости
 */
export interface PlanDeps {
  llm: {
    askQuestion(prompt: string, modelId: string): Promise<string>;
  };
  modelId: string; // явно передаём ID модели вместо хардкода
  savePoints?: {
    create(sp: Omit<SavePoint, 'id' | 'timestamp'>): Promise<void>;
  };
  todo?: {
    updateFromStep(input: { stepIndex: number; stepTitle: string; result: string }): Promise<void>;
  };
  store?: {
    setPlanStatus(status: 'planning' | 'ready' | 'executing' | 'done'): void;
    setCurrentStepIndex(index: number): void;
  };
  logger?: {
    info(msg: string): void;
    error(msg: string): void;
  };
  signal?: AbortSignal; // для отмены выполнения
  onStepStart?: (stepIndex: number) => void;
  onStepDone?: (stepIndex: number) => void;
  onError?: (stepIndex: number, error: unknown) => void;

  // Расширение: контекст и кастомизация
  workRulesText?: string; // Текущие правила работы из WorkRulesDialog/стора
  contextBuilder?: () => Promise<string>; // Опциональная функция для доп. контекста (список файлов, текущая ветка, и т.д.)
  summarizer?: (text: string) => Promise<string>; // Опциональная функция для сжатия длинных результатов
}

/**
 * Строит промпт для выполнения отдельного шага плана
 * Подсовывает модели: план, историю выполненных шагов, правила работы, доп. контекст
 * Требует JSON результат в строгом формате для автоматического обновления
 */
function buildStepPrompt(args: {
  planName: string;
  goal: string;
  todos: { title: string }[];
  history: { index: number; resultSummary: string }[]; // Только завершённые шаги
  current: { index: number; title: string; instructions: string; expectedResult: string };
  workRulesText?: string;
  extraContext?: string;
}): string {
  return `[ROLE]
Ты аккуратный исполнитель, строго следуешь инструкциям и не выходишь за границы текущего шага.

${args.workRulesText ? `[RULES]\n${args.workRulesText}\n` : ''}
[PLAN]
Название: ${args.planName}
Цель: ${args.goal}
Шаги: ${args.todos.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}

[PROGRESS]
${args.history.length > 0 ? args.history.map(h => `• Шаг ${h.index + 1}: ${h.resultSummary}`).join('\n') : 'Пока нет завершённых шагов'}

[NEXT STEP]
Номер: ${args.current.index + 1}
Название: ${args.current.title}
Инструкции: ${args.current.instructions}
Критерий готовности: ${args.current.expectedResult}

${args.extraContext ? `[EXTRA CONTEXT]\n${args.extraContext}\n` : ''}[OUTPUT FORMAT]
Верни ТОЛЬКО блок \`\`\`json\`\`\` строго по этой схеме (никаких комментариев или текста):
\`\`\`json
{
  "resultSummary": "2-3 предложения по факту выполненного шага, без лишней воды",
  "artifacts": ["имена/пути созданных артефактов, если есть"],
  "todoUpdate": { "done": true, "notes": "что изменили/куда положили результат" },
  "errors": []
}
\`\`\`

Если были ошибки — поле "errors": ["описание ошибки 1", "описание ошибки 2"]`.trim();
}

/**
 * Генерирует план из пользовательского запроса
 * FAIL-FAST: бросает ошибку если план не удалось построить
 *
 * @param input пользовательский текст с описанием задачи
 * @param deps зависимости (llm, logger)
 * @returns гарантированно валидный PendingPlan с id
 * @throws Error если генерация плана провалилась
 */
export async function buildPlanFromInput(
  input: string,
  deps: PlanDeps
): Promise<PendingPlan> {
  if (!input?.trim()) {
    throw new Error('Input text is required for plan generation');
  }

  deps.store?.setPlanStatus('planning');

  const prompt = `Ты архитектор проектов. Создай детальный план для: "${input}"

Важно:
- Создавай ТОЛЬКО планы, НЕ выполняй задачи
- План из 3-7 конкретных шагов
- Каждый шаг должен быть очень конкретным и выполнимым
- Предупреждай о возможных рисках

Создай план в формате JSON в блоке \`\`\`json...\`\`\`:
{
  "planName": "Название плана",
  "description": "Краткое описание проекта",
  "todos": [
    {
      "title": "Краткое название задачи",
      "description": "Подробное описание что нужно сделать",
      "instructions": "Пошаговые инструкции КАК это делать",
      "expectedResult": "Что должно получиться в итоге",
      "priority": "high|medium|low",
      "estimatedTime": число_минут
    }
  ]
}

После JSON добавь краткое текстовое объяснение.`;

  try {
    deps.logger?.info(`[PlanManager] Starting plan generation for input: ${input.substring(0, 50)}...`);

    const response = await deps.llm.askQuestion(prompt, deps.modelId);

    // Извлекаем JSON безопасно
    const jsonStr = extractJsonBlock(response);
    let parsedData: any;

    try {
      parsedData = JSON.parse(jsonStr);
    } catch (parseError) {
      const snippet = jsonStr.substring(0, 200);
      deps.logger?.error(`[PlanManager] JSON parse failed. Snippet: ${snippet}`);
      throw new Error(`Failed to parse JSON plan: ${parseError instanceof Error ? parseError.message : 'unknown error'}`);
    }

    // Валидация базовой структуры
    if (!parsedData.planName || !parsedData.todos || !Array.isArray(parsedData.todos)) {
      throw new Error('Invalid plan structure: missing planName or todos array');
    }

    if (parsedData.todos.length === 0) {
      throw new Error('Plan must contain at least one step');
    }

    // Нормализуем и валидируем план
    const planData = normalizePlan(parsedData);

    deps.logger?.info(`[PlanManager] Plan generated successfully: ${planData.planName} with ${planData.todos.length} steps`);
    deps.store?.setPlanStatus('ready');

    return planData;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    deps.logger?.error(`[PlanManager] Failed to generate plan: ${errorMsg}`);
    deps.store?.setPlanStatus('ready'); // вернуть в ready при ошибке
    throw error; // FAIL-FAST: не скрываем ошибку
  }
}

/**
 * Исполняет план последовательно, шаг за шагом
 * Перед каждым шагом собирает контекст: план + история + правила + доп. контекст
 * Требует JSON результат в строгом формате для автоматического обновления
 * После каждого шага: обновление плана, updateTodo, savePoint
 * FAIL-FAST: любая ошибка прерывает исполнение
 * Поддерживает возобновление с startIndex и отмену через AbortSignal
 *
 * @param plan валидный PendingPlan для исполнения
 * @param deps зависимости (llm, modelId, savePoints, todo, logger, store, signal, callbacks, workRulesText, contextBuilder, summarizer)
 * @param startIndex начальный индекс шага (по умолчанию 0)
 * @throws Error если исполнение провалилось на любом шаге или прервано
 */
export async function executePlan(
  plan: PendingPlan,
  deps: PlanDeps,
  startIndex = 0
): Promise<void> {
  if (!plan?.todos || plan.todos.length === 0) {
    throw new Error('Plan must contain at least one step for execution');
  }

  if (startIndex < 0 || startIndex >= plan.todos.length) {
    throw new Error(`Invalid startIndex: ${startIndex}. Plan has ${plan.todos.length} steps`);
  }

  deps.store?.setPlanStatus('executing');

  try {
    deps.logger?.info(
      `[PlanManager] Starting plan execution: ${plan.planName} (${startIndex + 1}/${plan.todos.length})`
    );

    for (let i = startIndex; i < plan.todos.length; i++) {
      // Проверяем сигнал отмены перед каждым шагом
      if (deps.signal?.aborted) {
        deps.logger?.info('[PlanManager] Plan execution aborted by signal');
        deps.store?.setPlanStatus('ready'); // мягкая остановка, возвращаем в ready
        deps.store?.setCurrentStepIndex(i); // сохраняем позицию для возобновления
        throw new Error('Plan execution aborted');
      }

      const step = plan.todos[i];
      deps.store?.setCurrentStepIndex(i);
      deps.onStepStart?.(i);

      try {
        deps.logger?.info(`[PlanManager] Executing step ${i + 1}/${plan.todos.length}: ${step.title}`);

        // Собираем историю из завершённых шагов
        const history = plan.todos
          .slice(0, i)
          .filter(t => t.status === 'done' && t.resultSummary)
          .map((t, idx) => ({ index: idx, resultSummary: t.resultSummary! }));

        // Опционально собираем дополнительный контекст
        let extraContext = '';
        if (deps.contextBuilder) {
          try {
            extraContext = await deps.contextBuilder();
          } catch (err) {
            deps.logger?.info(`[PlanManager] contextBuilder failed (non-critical): ${err}`);
            // Продолжаем без доп. контекста
          }
        }

        // Строим промпт для шага с полным контекстом
        const stepPrompt = buildStepPrompt({
          planName: plan.planName,
          goal: plan.description || '',
          todos: plan.todos.map(t => ({ title: t.title })),
          history,
          current: {
            index: i,
            title: step.title,
            instructions: step.instructions || '',
            expectedResult: step.expectedResult || ''
          },
          workRulesText: deps.workRulesText,
          extraContext
        });

        deps.logger?.info(`[PlanManager] Calling LLM for step ${i + 1}`);
        const rawResponse = await deps.llm.askQuestion(stepPrompt, deps.modelId);

        // Парсим JSON результат из ответа
        let stepResult: StepRunResult;
        try {
          const jsonStr = extractJsonBlock(rawResponse);
          stepResult = JSON.parse(jsonStr) as StepRunResult;
        } catch (parseErr) {
          const errorMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          deps.logger?.error(`[PlanManager] Failed to parse JSON result for step ${i + 1}: ${errorMsg}`);
          throw new Error(`JSON parse error at step ${i + 1}: ${errorMsg}`);
        }

        // Валидация полей результата
        if (!stepResult.resultSummary || typeof stepResult.resultSummary !== 'string') {
          throw new Error(`Step ${i + 1}: resultSummary is required and must be a string`);
        }

        // Сжимаем результат если нужно (макс 800 символов для контекста)
        let summary = stepResult.resultSummary;
        if (summary.length > 800) {
          if (deps.summarizer) {
            try {
              summary = await deps.summarizer(summary);
            } catch (err) {
              deps.logger?.info(`[PlanManager] summarizer failed (non-critical): ${err}`);
              // Обрезаем самостоятельно
              summary = summary.substring(0, 800);
            }
          } else {
            summary = summary.substring(0, 800);
          }
        }

        // Обновляем шаг в плане: статус и результат
        step.status = stepResult.todoUpdate?.done ? 'done' : 'pending';
        step.resultSummary = summary;
        step.startedAt = step.startedAt || Date.now();
        step.finishedAt = Date.now();

        // Обновляем todo список с результатом
        if (deps.todo) {
          await deps.todo.updateFromStep({
            stepIndex: i,
            stepTitle: step.title,
            result: summary
          });
          deps.logger?.info(`[PlanManager] Todo updated for step ${i + 1}`);
        }

        // Сохраняем компактный savepoint с прогрессом плана
        if (deps.savePoints) {
          const savePoint: Omit<SavePoint, 'id' | 'timestamp'> = {
            contextUsed: 0,
            messagesCount: 0,
            description: `Plan step ${i + 1}/${plan.todos.length}: ${step.title}`,
            data: {
              messages: [],
              currentMode: 'workspace',
              currentWorkspaceMode: 'act',
              pendingPlan: plan, // Весь план с прогрессом
              sidebarCollapsed: false
            }
          };

          await deps.savePoints.create(savePoint);
          deps.logger?.info(`[PlanManager] Savepoint created for step ${i + 1}`);
        }

        // Обновляем индекс после успешного шага
        deps.store?.setCurrentStepIndex(i + 1);
        deps.onStepDone?.(i);

      } catch (stepError) {
        const errorMsg = stepError instanceof Error ? stepError.message : String(stepError);
        deps.logger?.error(`[PlanManager] Step ${i + 1} failed: ${errorMsg}`);
        deps.onError?.(i, stepError);

        // Пометим шаг как failed
        step.status = 'failed';
        step.finishedAt = Date.now();

        // Сохраняем errorpoint перед броском
        if (deps.savePoints) {
          const errorSavePoint: Omit<SavePoint, 'id' | 'timestamp'> = {
            contextUsed: 0,
            messagesCount: 0,
            description: `Plan step ${i + 1} ERROR: ${step.title} - ${errorMsg}`,
            data: {
              messages: [],
              currentMode: 'workspace',
              currentWorkspaceMode: 'act',
              pendingPlan: plan,
              sidebarCollapsed: false
            }
          };

          try {
            await deps.savePoints.create(errorSavePoint);
          } catch (spError) {
            deps.logger?.error(`[PlanManager] Failed to save error checkpoint: ${spError}`);
          }
        }

        // currentStepIndex остаётся на шаге с ошибкой для возможности ретрая
        throw stepError; // FAIL-FAST: не продолжаем после ошибки
      }
    }

    deps.logger?.info(`[PlanManager] Plan execution completed: ${plan.planName}`);
    deps.store?.setPlanStatus('done');
    deps.store?.setCurrentStepIndex(-1); // Сигнализируем завершение
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Если это отмена - это не критичная ошибка
    if (errorMsg.includes('aborted')) {
      deps.logger?.info('[PlanManager] Plan execution was aborted');
      // Статус и индекс уже установлены в цикле
      return; // мягкий выход без переброса ошибки
    }

    // Для других ошибок возвращаем в ready для возможности повторить
    deps.logger?.error(`[PlanManager] Plan execution failed: ${errorMsg}`);
    deps.store?.setPlanStatus('ready');
    throw error;
  }
}
