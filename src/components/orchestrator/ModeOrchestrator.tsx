import React, { useCallback, useMemo, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ModeSelector } from '@/components/ModeSelector';
import { useVoice } from '@/hooks/useVoice';
import { Message, PendingPlan, TodoHook, SavePoint } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWorkRules } from '@/hooks/use-work-rules';
import { useTodo } from '@/hooks/use-todo';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { useImageCreator } from '@/hooks/use-image-creator';
import { useModeOrchestratorStore, OperatingMode, WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { useMessageHandling } from '@/hooks/use-message-handling';
import { useModeOrchestratorState } from '@/hooks/use-mode-orchestrator-state';
import { ModeSidebar } from './ModeSidebar';
import { ModeContent } from './ModeContent';
import { llmService } from '@/lib/services/llm';
import { buildPlanFromInput, executePlan, type PlanDeps } from '@/lib/services/PlanManager';

export function ModeOrchestrator() {
  const currentMode = useModeOrchestratorStore(state => state.ui.currentMode);
  const currentWorkspaceMode = useModeOrchestratorStore(state => state.ui.currentWorkspaceMode);
  const sidebarCollapsed = useModeOrchestratorStore(state => state.ui.sidebarCollapsed);
  const showImageGallery = useModeOrchestratorStore(state => state.ui.showImageGallery);
  const showRoutingMonitor = useModeOrchestratorStore(state => state.ui.showRoutingMonitor);
  const showTestSuite = useModeOrchestratorStore(state => state.ui.showTestSuite);
  const messages = useModeOrchestratorStore(state => state.chat.messages);
  const awaitingConfirmation = useModeOrchestratorStore(state => state.chat.awaitingConfirmation);
  const currentQuery = useModeOrchestratorStore(state => state.chat.currentQuery);
  const pendingPlan = useModeOrchestratorStore(state => state.chat.pendingPlan);
  const savePoints = useModeOrchestratorStore(state => state.chat.savePoints);
  const actions = useModeOrchestratorStore(state => state.actions);
  const {
    setCurrentMode: storeSetCurrentMode,
    setWorkspaceMode: storeSetWorkspaceMode,
    toggleSidebar: storeToggleSidebar,
    setSidebarCollapsed: storeSetSidebarCollapsed,
    setShowImageGallery: storeSetShowImageGallery,
    setShowRoutingMonitor: storeSetShowRoutingMonitor,
    setShowTestSuite: storeSetShowTestSuite,
    setMessages: storeSetMessages,
    updateMessages: storeUpdateMessages,
    clearMessages: storeClearMessages,
    setAwaitingConfirmation: storeSetAwaitingConfirmation,
    setCurrentQuery: storeSetCurrentQuery,
    updateSavePoints: storeUpdateSavePoints,
    setPendingPlan: storeSetPendingPlan,
    clearSavePoints: storeClearSavePoints,
    setCurrentStepIndex: storeSetCurrentStepIndex,
  } = actions;
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    tts: { speak },
    stt: { stopListening }
  } = useVoice();
  const { currentModel } = useModelSelection('chat');

  const todo = useTodo();
  const currentTodoList = todo.currentList;
  const completedTodoCount = todo.getCompletedCount();
  const totalTodoCount = todo.getTotalCount();
  const currentTodoItem = todo.getCurrentItem();
  const nextTodoItem = todo.getNextItem();
  const {
    contextData,
    updateContextUsage,
    checkContextLimit,
    getContextBreakdown
  } = useContextTracker();
  const { startNewImageChat } = useImageCreator();

  const workRules = useWorkRules();
  const workRulesContext = useMemo(() => workRules.formatRulesForPrompt(), [workRules]);

  const todoListContext = useMemo(() => {
    if (!currentTodoList) {
      return '';
    }

    const currentTitle = currentTodoItem ? `"${currentTodoItem.title}"` : 'Нет';
    const nextTitle = nextTodoItem ? `"${nextTodoItem.title}"` : 'Нет';

    return (
      `\n## 📋 ТЕКУЩИЙ TODO СПИСОК: "${currentTodoList.name}"\n` +
      `Прогресс: ${completedTodoCount}/${totalTodoCount} задач выполнено\n` +
      `Текущая задача: ${currentTitle}\n` +
      `Следующая задача: ${nextTitle}\n`
    );
  }, [currentTodoList, completedTodoCount, totalTodoCount, currentTodoItem, nextTodoItem]);

  const appendMessageUnique = useCallback((msg: Message) => {
    storeUpdateMessages(prev => {
      const list = Array.isArray(prev) ? prev : [];
      if (list.some(m => m && m.id === msg.id)) return list;
      return [...list, msg];
    });
  }, [storeUpdateMessages]);

  const createMessage = useCallback((content: string, type: 'user' | 'assistant', isVoice?: boolean, workspaceMode?: WorkspaceModeType): Message => {
    const uid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
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
  }, []);

  const handleAskMode = useCallback(async (text: string, modelId: string): Promise<string> => {
    return await llmService.askQuestion(text, modelId);
  }, []);

  const handlePlanMode = useCallback(async (
    text: string,
    modelId: string,
    isConfirmation: boolean,
    planData: PendingPlan | null,
    workRulesContext: string,
    todoListContext: string,
    currentQuery: string,
    storeSetPendingPlan: (plan: PendingPlan | null) => void,
    storeSetAwaitingConfirmation: (awaiting: boolean) => void,
    todo: TodoHook
  ): Promise<string> => {
    // Режим подтверждения: пользователь решает что-то с существующим планом
    if (isConfirmation && planData) {
      const answer = text.trim().toLowerCase();

      // Подтверждение плана
      if (answer.startsWith('да') || answer.startsWith('yes') || answer.startsWith('подтверждение')) {
        let currentList = todo.currentList;
        if (!currentList) {
          currentList = await todo.createTodoList(planData.planName || 'Новый план', planData.description);
        }
        for (const todoData of planData.todos || []) {
          await todo.addTodoItem(todoData.title, {
            description: todoData.description,
            instructions: todoData.instructions,
            expectedResult: todoData.expectedResult,
            priority: todoData.priority || 'medium',
            workspaceMode: 'act',
            estimatedTime: todoData.estimatedTime || 30,
          });
        }
        storeSetAwaitingConfirmation(false);
        storeSetPendingPlan(null);
        return `✅ План подтверждён и создан TODO список: ${planData.planName}\n\nДобавлено задач: ${(planData.todos || []).length}.\nПереключитесь в режим ACT для выполнения задач.`;
      }

      // Отклонение плана
      if (answer.startsWith('нет') || answer.startsWith('no') || answer.startsWith('отмена')) {
        storeSetAwaitingConfirmation(false);
        storeSetPendingPlan(null);
        return '❎ План отклонён. Опишите пожелания или отправьте новый запрос для генерации другого плана.';
      }

      // Редактирование плана: пользователь просит изменения
      const editPrompt = `Ты архитектор проектов. Обнови план, учитывая изменения пользователя: "${text}"

ИСХОДНЫЙ ПЛАН: "${planData.planName}"
${planData.description}

ИСХОДНАЯ ЗАДАЧА: "${currentQuery || ''}"
${workRulesContext}${todoListContext}

Верни ТОЛЬКО JSON блок (никаких комментариев):
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
}`;

      try {
        const editResponse = await llmService.askQuestion(editPrompt, modelId);
        const jsonMatch = editResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const updatedPlanData = JSON.parse(jsonMatch[0]);
          storeSetPendingPlan(updatedPlanData);
          storeSetAwaitingConfirmation(true);
          return `📝 Обновленный план "${updatedPlanData.planName}" подготовлен.\n\n${updatedPlanData.description}\n\nШаги:\n${updatedPlanData.todos.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n')}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>";`;
        }
        return editResponse;
      } catch (error) {
        console.error('Error updating plan:', error);
        return 'Ошибка при обновлении плана. Пожалуйста, опишите изменения ещё раз.';
      }
    }

    // Режим генерации плана: создаём новый план через PlanManager
    try {
      const deps = {
        llm: {
          askQuestion: (prompt: string, model: string) => llmService.askQuestion(prompt, model)
        },
        modelId,
        logger: {
          info: (msg: string) => console.log(`[PlanManager] ${msg}`),
          error: (msg: string) => console.error(`[PlanManager] ${msg}`)
        },
        workRulesText: workRulesContext,
        contextBuilder: async () => todoListContext || ''
      };

      const newPlan = await buildPlanFromInput(text, deps);
      storeSetPendingPlan(newPlan);
      storeSetAwaitingConfirmation(true);

      return `📝 Предложен план: **${newPlan.planName}**\n\n${newPlan.description}\n\n**Шаги:**\n${newPlan.todos.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n')}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>";`;
    } catch (error) {
      console.error('Error generating plan:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `❌ Ошибка при создании плана: ${errorMsg}\n\nПожалуйста, опишите задачу более подробно или попробуйте снова.`;
    }
  }, []);

  // Создаём AbortController для отмены выполнения плана
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleActMode = useCallback(async (
    text: string,
    modelId: string,
    workRulesContext: string,
    todoListContext: string,
    todo: TodoHook
  ): Promise<string> => {
    try {
      // Проверяем наличие плана
      if (!pendingPlan) {
        return '❌ Нет активного плана. Сначала создайте план в режиме PLAN.';
      }

      // Определяем начальный индекс для возобновления
      const currentStepIndex = useModeOrchestratorStore.getState().chat.currentStepIndex ?? 0;
      const startIndex = Math.max(0, currentStepIndex);

      console.log(`[ActMode] Starting/resuming plan execution from step ${startIndex + 1}/${pendingPlan.todos.length}`);

      // Создаём AbortController для возможности отмены
      abortControllerRef.current = new AbortController();

      // Собираем deps для executePlan
      const deps: PlanDeps = {
        llm: {
          askQuestion: (prompt: string, model: string) => llmService.askQuestion(prompt, model)
        },
        modelId,
        savePoints: {
          create: async (sp) => {
            const savePoint: SavePoint = {
              id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              timestamp: new Date(),
              ...sp
            };
            storeUpdateSavePoints(prev => [...prev, savePoint]);
          }
        },
        todo: {
          updateFromStep: async (input) => {
            const currentList = todo.currentList;
            if (currentList && input.result) {
              // Находим текущий item в списке и обновляем его
              const todoItem = currentList.items.find(
                item => item.title === input.stepTitle
              );
              if (todoItem) {
                await todo.updateTodoItem(todoItem.id, {
                  status: 'completed',
                  result: input.result,
                  actualTime: 30
                });
              }
            }
          }
        },
        store: {
          setPlanStatus: (status) => {
            // Статус плана обновляется в store при необходимости
            console.log(`[PlanManager] Plan status: ${status}`);
          },
          setCurrentStepIndex: (index) => {
            storeSetCurrentStepIndex(index);
            console.log(`[PlanManager] Current step index: ${index}`);
          }
        },
        logger: {
          info: (msg: string) => console.log(`[PlanManager] ${msg}`),
          error: (msg: string) => console.error(`[PlanManager] ${msg}`)
        },
        signal: abortControllerRef.current.signal,
        workRulesText: workRulesContext,
        contextBuilder: async () => {
          try {
            // Собираем краткий контекст: текущий TODO, правила, прогресс
            const currentItem = todo.getCurrentItem();
            const completedCount = todo.getCompletedCount();
            const totalCount = todo.getTotalCount();

            let context = '';
            if (currentItem) {
              context += `Текущая задача: ${currentItem.title}\n`;
            }
            if (completedCount >= 0 && totalCount > 0) {
              context += `Прогресс: ${completedCount}/${totalCount} завершено\n`;
            }
            if (todoListContext) {
              context += todoListContext;
            }
            return context || '';
          } catch (err) {
            console.error('[contextBuilder] Error:', err);
            return '';
          }
        },
        onStepStart: (stepIndex) => {
          console.log(`[ActMode] Started step ${stepIndex + 1}`);
        },
        onStepDone: (stepIndex) => {
          console.log(`[ActMode] Completed step ${stepIndex + 1}`);
        },
        onError: (stepIndex, error) => {
          console.error(`[ActMode] Error at step ${stepIndex + 1}:`, error);
        }
      };

      // Выполняем план
      await executePlan(pendingPlan, deps, startIndex);

      return `✅ **План успешно выполнен!**\n\nВсе ${pendingPlan.todos.length} шагов завершены.\n\nРезультаты сохранены в TODO списке и savepoints.`;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Если это отмена - это не критичная ошибка
      if (errorMsg.includes('aborted')) {
        return `⏸️ **Выполнение плана прервано.**\n\nВы можете продолжить с текущего шага, введя текст для возобновления.`;
      }

      console.error('Error in act mode:', error);
      return `❌ **Ошибка при выполнении плана:** ${errorMsg}\n\nПожалуйста, проверьте логи и попробуйте снова.`;
    }
  }, [pendingPlan, storeUpdateSavePoints, storeSetCurrentStepIndex, workRulesContext, todoListContext, todo]);

  const { handleSendMessage } = useMessageHandling({
    currentModelId: currentModel ? currentModel.id : undefined,
    awaitingConfirmation,
    pendingPlan,
    currentQuery,
    messages,
    currentMode,
    currentWorkspaceMode,
    sidebarCollapsed,
    storeSetPendingPlan,
    storeSetAwaitingConfirmation,
    storeSetCurrentQuery,
    storeSetWorkspaceMode,
    storeUpdateSavePoints,
    todo,
    workRulesContext,
    todoListContext,
    stopListening,
    speak,
    handleAskMode,
    handlePlanMode,
    handleActMode,
    createMessage,
    appendMessageUnique,
    updateContextUsage
  });

  const { isDevelopment } = useModeOrchestratorState();

  const handleModeChange = useCallback((mode: OperatingMode) => {
    storeSetCurrentMode(mode);
  }, [storeSetCurrentMode]);

  const handleSidebarToggle = useCallback(() => {
    storeToggleSidebar();
  }, [storeToggleSidebar]);

  const handleToggleGallery = useCallback(() => {
    storeSetShowImageGallery(!showImageGallery);
  }, [storeSetShowImageGallery, showImageGallery]);

  const handleToggleRoutingMonitor = useCallback(() => {
    storeSetShowRoutingMonitor(!showRoutingMonitor);
  }, [storeSetShowRoutingMonitor, showRoutingMonitor]);

  const handleToggleTestSuite = useCallback(() => {
    storeSetShowTestSuite(!showTestSuite);
  }, [storeSetShowTestSuite, showTestSuite]);

  const handleClearHistory = useCallback(() => {
    storeClearMessages();
    toast.success('История чата очищена');
  }, [storeClearMessages]);

  const handleLoadSession = useCallback((sessionMessages: Message[]) => {
    console.log('Loading session with', sessionMessages.length, 'messages');

    setIsProcessing(false);
    storeSetAwaitingConfirmation(false);
    storeSetCurrentQuery('');

    storeSetMessages(sessionMessages);

    const hasImageMessages = sessionMessages.some(msg => msg.type === 'assistant' && msg.content && msg.content.includes('🎨'));
    const hasWorkspaceMessages = sessionMessages.some(msg => msg.workspaceMode && msg.workspaceMode !== 'ask');

    if (hasImageMessages) {
      storeSetCurrentMode('image-creator');
      storeSetShowImageGallery(false);
    } else if (hasWorkspaceMessages) {
      storeSetCurrentMode('workspace');
      const msgWithMode = sessionMessages.find(msg => msg.workspaceMode);
      const workspaceMode = msgWithMode && msgWithMode.workspaceMode ? msgWithMode.workspaceMode : 'ask';
      storeSetWorkspaceMode(workspaceMode as WorkspaceModeType);
    } else {
      storeSetCurrentMode('chat');
    }

    setTimeout(() => {
      console.log('Messages state updated:', JSON.stringify(sessionMessages.length, null, 2));
    }, 100);
  }, [storeSetMessages, storeSetCurrentMode, storeSetWorkspaceMode, storeSetShowImageGallery, storeSetAwaitingConfirmation, storeSetCurrentQuery]);

  const handleNewChat = useCallback(() => {
    storeClearMessages();
    setIsProcessing(false);
    storeSetAwaitingConfirmation(false);
    storeSetCurrentQuery('');
    storeSetPendingPlan(null);

    startNewImageChat();

    storeSetWorkspaceMode('ask');

    toast.success('Новый чат создан');
  }, [storeClearMessages, storeSetCurrentMode, storeSetWorkspaceMode, storeSetShowImageGallery, storeSetAwaitingConfirmation, storeSetCurrentQuery]);

  const header = (
    <ModeSelector
      currentMode={currentMode}
      onModeChange={handleModeChange}
    />
  );

  const sidebar = (
    <ModeSidebar
      collapsed={sidebarCollapsed}
      onToggleCollapse={handleSidebarToggle}
      title="AI Assistant"
      messages={messages || []}
      onLoadSession={handleLoadSession}
      onNewChat={handleNewChat}
      onClearHistory={handleClearHistory}
      showRoutingMonitor={showRoutingMonitor}
      showTestSuite={showTestSuite}
      isDevelopment={isDevelopment}
      onToggleRoutingMonitor={handleToggleRoutingMonitor}
      onToggleTestSuite={handleToggleTestSuite}
    />
  );

  const mainContent = (
    <ModeContent
      currentMode={currentMode}
      messages={messages || []}
      onSendMessage={handleSendMessage}
      isProcessing={isProcessing}
      showImageGallery={showImageGallery}
      onToggleGallery={handleToggleGallery}
      showTestSuite={showTestSuite}
      showRoutingMonitor={showRoutingMonitor}
      isDevelopment={isDevelopment}
    />
  );

  return (
    <ModeShell
      sidebar={sidebar}
      header={header}
      content={mainContent}
      mainClassName={currentMode === 'workspace' ? 'workspace-offset' : undefined}
    />
  );
}

interface ModeShellProps {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
  mainClassName?: string;
}

function ModeShell({ sidebar, header, content, mainClassName }: ModeShellProps) {
  return (
    <div className="flex h-screen bg-black text-white dark">
      {sidebar}
      <div className={cn('flex-1 flex flex-col overflow-hidden relative bg-neutral-1', mainClassName)}>
        <div className="mode-buttons">
          {header}
        </div>
        <div className="flex-1 overflow-hidden">
          {content}
        </div>
      </div>
    </div>
  );
}