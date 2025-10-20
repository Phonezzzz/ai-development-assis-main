import { useCallback, useRef } from 'react';
import { orchestratorApi } from '@/lib/orchestrator/api';
import type { Message, PendingPlan, TodoHook } from '@/lib/types';
import type { WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { useTodo } from '@/hooks/use-todo';
import { useWorkRules } from '@/hooks/use-work-rules';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useVoice } from '@/hooks/useVoice';

interface MessageHandlerCallbacks {
  onAppendMessage: (msg: Message) => void;
  onSetProcessing: (processing: boolean) => void;
  onSetCurrentQuery: (query: string) => void;
  onSetWorkspaceMode: (mode: WorkspaceModeType) => void;
  onSetAwaitingConfirmation: (awaiting: boolean) => void;
  onSetPendingPlan: (plan: PendingPlan | null) => void;
}

export function useShellMessageHandler(
  currentMode: string,
  currentQuery: string,
  awaitingConfirmation: boolean,
  pendingPlan: PendingPlan | null,
  callbacks: MessageHandlerCallbacks,
) {
  const cancelAnswerRef = useRef(false);
  const todo = useTodo();
  const workRules = useWorkRules();
  const { currentModel } = useModelSelection('chat');
  const { tts: { speak } } = useVoice();

  const workRulesContext = workRules.formatRulesForPrompt();
  const todoListContext = (() => {
    const currentTodoList = todo.currentList;
    if (!currentTodoList) return '';

    const currentTodoItem = todo.getCurrentItem();
    const nextTodoItem = todo.getNextItem();
    const completedTodoCount = todo.getCompletedCount();
    const totalTodoCount = todo.getTotalCount();

    const currentTitle = currentTodoItem ? `"${currentTodoItem.title}"` : 'Нет';
    const nextTitle = nextTodoItem ? `"${nextTodoItem.title}"` : 'Нет';

    return [
      `\n## 📋 ТЕКУЩИЙ TODO СПИСОК: "${currentTodoList.name}"\n`,
      `Прогресс: ${completedTodoCount}/${totalTodoCount} задач выполнено\n`,
      `Текущая задача: ${currentTitle}\n`,
      `Следующая задача: ${nextTitle}\n`,
    ].join('');
  })();

  const createMessage = useCallback(
    (
      content: string,
      type: 'user' | 'assistant',
      isVoice?: boolean,
      workspaceMode?: WorkspaceModeType,
    ): Message => {
      if (!crypto.randomUUID) {
        throw new Error('crypto.randomUUID not supported in this browser');
      }
      const uid = crypto.randomUUID();
      const scope = workspaceMode ? 'ws' : 'chat';

      console.log(`[DEBUG] Создание сообщения: type=${type}, scope=${scope}, content=${content.substring(0, 50)}...`);

      return {
        id: `${scope}_msg_${uid}_${type}`,
        type,
        content,
        timestamp: new Date(),
        isVoice,
        workspaceMode,
      };
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (text: string, mode: WorkspaceModeType, isVoice?: boolean) => {
      const logId = orchestratorApi.logging.logApiCall(
        `app_msg_${Date.now()}`,
        'POST',
        'app/handleSendMessage',
        {
          mode,
          textLength: text.length,
          isVoice,
          currentMode,
          workspaceMode: mode,
        },
      );

      if (!text.trim()) return;

      callbacks.onSetCurrentQuery(text);
      callbacks.onSetWorkspaceMode(mode);
      callbacks.onSetProcessing(true);
      cancelAnswerRef.current = false;

      const modelId = (() => {
        try {
          const raw = window.localStorage.getItem('selected-model:chat');
          if (raw) return JSON.parse(raw);
        } catch (error) {
          console.warn('Ошибка чтения selected-model:chat из localStorage:', JSON.stringify(error, null, 2));
          throw error;
        }
        if (!currentModel || !currentModel.id) {
          throw new Error('Current model is not set');
        }
        return currentModel.id;
      })();

      if (!modelId) {
        const error = new Error('Пожалуйста, выберите модель перед отправкой сообщения');
        orchestratorApi.logging.logError(logId, error, { stage: 'model_validation' });
        orchestratorApi.errors.handle(error, 'Model validation');
        callbacks.onSetProcessing(false);
        return;
      }

      orchestratorApi.logging.logModelSelection(
        modelId,
        modelId.startsWith('local') ? 'Local' : 'OpenRouter',
        `Model selected for ${mode} mode`,
      );

      if (currentMode === 'workspace') {
        callbacks.onSetProcessing(false);
        return;
      }

      const userMessage = createMessage(text, 'user', isVoice, undefined);
      callbacks.onAppendMessage(userMessage);

      try {
        await orchestratorApi.vector.addDocument({
          id: userMessage.id,
          content: text,
          metadata: {
            type: 'user_message',
            workspaceMode: mode,
            timestamp: userMessage.timestamp.toISOString(),
            isVoice: isVoice || false,
          },
        });
      } catch (error) {
        orchestratorApi.logging.logError(logId, error instanceof Error ? error : String(error), {
          stage: 'vector_storage',
          messageId: userMessage.id,
        });
        console.error('Error storing message in vector DB:', JSON.stringify(error, null, 2));
        throw error;
      }

      try {
        let responseText = '';

        if (mode === 'ask') {
          responseText = await orchestratorApi.llm.askQuestion(text, modelId);
        } else if (mode === 'plan') {
          if (awaitingConfirmation && pendingPlan) {
            const answer = text.trim().toLowerCase();
            if (
              answer.startsWith('да') ||
              answer.startsWith('yes') ||
              answer.startsWith(' подтверждение')
            ) {
              let currentList = todo.currentList;
              if (!currentList) {
                currentList = await todo.createTodoList(
                  pendingPlan.planName || 'Новый план',
                  pendingPlan.description,
                );
              }
              for (const todoData of pendingPlan.todos || []) {
                await todo.addTodoItem(todoData.title, {
                  description: todoData.description,
                  instructions: todoData.instructions,
                  expectedResult: todoData.expectedResult,
                  priority: todoData.priority || 'medium',
                  workspaceMode: 'act',
                  estimatedTime: todoData.estimatedTime || 30,
                });
              }
              callbacks.onSetAwaitingConfirmation(false);
              callbacks.onSetPendingPlan(null);
              responseText = `✅ План подтверждён и создан TODO список: ${
                pendingPlan.planName
              }\n\nДобавлено задач: ${(pendingPlan.todos || []).length}.\nПереключитесь в режим ACT для выполнения задач.`;
            } else if (
              answer.startsWith('нет') ||
              answer.startsWith('no') ||
              answer.startsWith('отмена')
            ) {
              callbacks.onSetAwaitingConfirmation(false);
              callbacks.onSetPendingPlan(null);
              responseText =
                '❎ План отклонён. Опишите пожелания или отправьте новый запрос для генерации другого плана.';
            } else {
              const prompt = `Ты архитектор проектов. Обнови план, учитывая изменения: "${text}"

Исходная задача пользователя: "${currentQuery || ''}"
${workRulesContext}${todoListContext}

Требуемый формат JSON:
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
              const planResponse = await orchestratorApi.llm.askQuestion(prompt, modelId);
              try {
                const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const planData = JSON.parse(jsonMatch[0]);
                  callbacks.onSetPendingPlan(planData);
                  callbacks.onSetAwaitingConfirmation(true);
                  responseText = `📝 Обновленный план "${planData.planName}" подготовлен.\n\n${planData.description}\n\nШаги:\n${planData.todos
                    .map((t: { title: string }, i: number) => `${i + 1}. ${t.title}`)
                    .join(
                      '\n',
                    )}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>";`;
                } else {
                  responseText = planResponse;
                }
              } catch (error) {
                console.error('Error parsing updated plan JSON:', JSON.stringify(error, null, 2));
                throw error;
              }
            }
          } else {
            const prompt = `Ты архитектор проектов. Создай детальный TODO план для: "${text}"

ВАЖНО:
- Создавай ТОЛЬКО планы, НЕ выполняй задачи!
- Анализируй альтернативные подходы и советуй оптимальные решения
- Предупреждай о возможных рисках и последствиях
- Если есть несколько способов решения - укажи лучший и объясни почему
- Предлагай улучшения архитектуры и подходов${workRulesContext}${todoListContext}

Создай план из 3-7 конкретных шагов в формате JSON:

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

После создания JSON плана, также создай читаемый текст с описанием плана.`;

            const planResponse = await orchestratorApi.llm.askQuestion(prompt, modelId);

            try {
              const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const planData = JSON.parse(jsonMatch[0]);
                callbacks.onSetPendingPlan(planData);
                callbacks.onSetAwaitingConfirmation(true);
                responseText = `📝 Предложен план "${planData.planName}".\n\n${planData.description}\n\nШаги:\n${planData.todos
                  .map((t: { title: string }, i: number) => `${i + 1}. ${t.title}`)
                  .join(
                    '\n',
                  )}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>";`;
              } else {
                responseText = planResponse;
              }
            } catch (error) {
              console.error('Error parsing plan JSON:', JSON.stringify(error, null, 2));
              throw error;
            }
          }
        } else if (mode === 'act') {
          // For 'act' mode - simplified response for now
          const currentItem = todo.getCurrentItem();
          const nextItem = todo.getNextItem();

          let contextPrompt = '';
          if (currentItem) {
            contextPrompt = `\nТекущая задача: "${currentItem.title}"\nОписание: ${currentItem.description}`;
          }
          if (nextItem) {
            contextPrompt += `\nСледующая задача: "${nextItem.title}"`;
          }

          responseText = await orchestratorApi.llm.askQuestion(`${text}${contextPrompt}`, modelId);
        }

        if (responseText.trim()) {
          const assistantMessage = createMessage(responseText, 'assistant');
          callbacks.onAppendMessage(assistantMessage);

          if (isVoice) {
            try {
              await speak(responseText.substring(0, 500));
            } catch (error) {
              console.error('Error speaking response:', error);
            }
          }
        }
      } catch (error) {
        orchestratorApi.logging.logError(
          logId,
          error instanceof Error ? error : String(error),
          { stage: 'llm_response' },
        );
        console.error('Error getting LLM response:', JSON.stringify(error, null, 2));
        throw error;
      } finally {
        callbacks.onSetProcessing(false);
      }
    },
    [
      currentMode,
      currentQuery,
      awaitingConfirmation,
      pendingPlan,
      todo,
      workRulesContext,
      todoListContext,
      callbacks,
      createMessage,
      currentModel,
      speak,
    ],
  );

  return {
    handleSendMessage,
    createMessage,
    cancelAnswerRef,
  };
}
