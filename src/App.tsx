import { useState, useCallback, useMemo, memo, Suspense, lazy, useEffect, useRef } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { ModeSelector } from '@/components/ModeSelector';
import { ChatHistory } from '@/components/ChatHistory';
import { SettingsDialog } from '@/components/SettingsDialog';
import { WorkRulesDialog } from '@/components/WorkRulesDialog';
import { SmartContextPanel } from '@/components/SmartContextPanel';
const ChatMode = lazy(() =>
  import('@/components/modes/ChatMode').then(m => ({ default: m.ChatMode }))
);
const ImageCreatorMode = lazy(() =>
  import('@/components/modes/ImageCreatorMode').then(m => ({ default: m.ImageCreatorMode }))
);
const WorkspaceMode = lazy(() =>
  import('@/components/modes/WorkspaceMode').then(m => ({ default: m.WorkspaceMode }))
);
import { useVoiceRecognition } from '@/hooks/use-voice';
import { useTTS } from '@/hooks/use-tts';
import { useSmartContext } from '@/hooks/use-smart-context';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useImageCreator } from '@/hooks/use-image-creator';
import { useTodo } from '@/hooks/use-todo';
import { useWorkRules } from '@/hooks/use-work-rules';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { OperatingMode, Message, WorkspaceMode as WorkspaceModeType, PendingPlan, SavePoint } from '@/lib/types';
import { vectorService } from '@/lib/services/vector';
import { llmService } from '@/lib/services/llm';
import { CaretLeft, CaretRight, Images } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { validateConfig } from '@/lib/config';

function App() {
  // Use hooks inside a try-catch to prevent resolver issues
  const [currentMode, setCurrentMode] = useKV<OperatingMode>('current-mode', 'chat');
  const [messages, setMessages] = useKV<Message[]>('chat-messages', []);
  let reload = 0;
  if (messages && Array.isArray(messages)) {
    const seen = new Set<string>();
    const deduped: Message[] = [];
    for (const msg of messages) {
      if (!msg?.id) continue;
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      deduped.push(msg);
    }
    if (deduped.length !== messages.length) {
      setMessages(deduped);
      reload = 1;
    }
  }
  const [isProcessing, setIsProcessing] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentWorkspaceMode, setCurrentWorkspaceMode] = useState<WorkspaceModeType>('ask');
  const [sidebarCollapsed, setSidebarCollapsed] = useKV<boolean>('sidebar-collapsed', false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  
  // Hooks
  const voiceRecognition = useVoiceRecognition();
  const { speak: ttsSpeak, stop: ttsStop, ttsState } = useTTS();
  const { addMessageToContext } = useSmartContext();
  const { currentModel } = useModelSelection();
  const { startNewImageChat, hasActiveSession } = useImageCreator();
  const todo = useTodo();
  const workRules = useWorkRules();
  const { updateContextUsage } = useContextTracker();
  const [pendingPlan, setPendingPlan] = useKV<PendingPlan | null>('pending-plan', null);
  const [savePoints, setSavePoints] = useKV<SavePoint[]>('context-save-points', []);
  const cancelAnswerRef = useRef(false);

  // Initialize work rules on app start
  useEffect(() => {
    workRules.initializeDefaultRules();
  }, [workRules]);

  // Validate environment/config on app start and warn user
  useEffect(() => {
    try {
      const { isValid, errors } = validateConfig();
      if (!isValid) {
        const message = ['⚠️ Обнаружены проблемы конфигурации:', ...errors.map(e => `• ${e}`)].join('\n');
        toast.error(message, { duration: 8000 });
      }
    } catch (e) {
      console.error('Config validation failed:', e);
      toast.error('Ошибка проверки конфигурации окружения');
    }
  }, []);
  // Останавливаем TTS при размонтировании приложения
  useEffect(() => {
    return () => {
      try { ttsStop(); } catch {}
    };
  }, [ttsStop]);

  useEffect(() => {
    setMessages(prev => {
      if (!Array.isArray(prev)) return prev;
      const seen = new Set<string>();
      const deduped: Message[] = [];
      for (const msg of prev) {
        if (!msg?.id) continue;
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        deduped.push(msg);
      }
      return deduped.length === prev.length ? prev : deduped;
    });
  }, [setMessages]);

  const { speak } = voiceRecognition;

  // Универсальный аппендер сообщений с дедупликацией по id
  const appendMessageUnique = useCallback((msg: Message) => {
    setMessages(prev => {
      const list = Array.isArray(prev) ? prev : [];
      // Быстрая проверка наличия
      if (list.some(m => m?.id === msg.id)) return list;
      return [...list, msg];
    });
  }, [setMessages]);

  const createMessage = useCallback((content: string, type: 'user' | 'assistant', isVoice?: boolean, workspaceMode?: WorkspaceModeType): Message => {
    // Разделение идентификаторов по скоупам: chat vs ws
    const uid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const scope = workspaceMode ? 'ws' : 'chat';
    return {
      id: `${scope}_msg_${uid}_${type}`,
      type,
      content,
      timestamp: new Date(),
      isVoice,
      workspaceMode,
    };
  }, []);

  // Мемоизируем зависимости для предотвращения лишних перерендеров
  const workRulesContext = useMemo(() => workRules.formatRulesForPrompt(), [workRules]);
  const todoListContext = useMemo(() => {
    return todo.currentList ?
      `\n## 📋 ТЕКУЩИЙ TODO СПИСОК: "${todo.currentList.name}"\n` +
      `Прогресс: ${todo.getCompletedCount()}/${todo.getTotalCount()} задач выполнено\n` +
      `Текущая задача: ${todo.getCurrentItem() ? `"${todo.getCurrentItem()?.title}"` : 'Нет'}\n` +
      `Следующая задача: ${todo.getNextItem() ? `"${todo.getNextItem()?.title}"` : 'Нет'}\n`
      : '';
  }, [todo.currentList, todo.getCompletedCount(), todo.getTotalCount(), todo.getCurrentItem(), todo.getNextItem()]);

  const handleSendMessage = useCallback(async (text: string, mode: WorkspaceModeType, isVoice?: boolean) => {
    if (!text.trim()) return;

    setCurrentQuery(text);
    setCurrentWorkspaceMode(mode);
    setIsProcessing(true);
    cancelAnswerRef.current = false;

    // Читаем актуальную модель прямо из KV (localStorage), чтобы не зависеть от перерендеров
    const modelId = (() => {
      try {
        const raw = window.localStorage.getItem('selected-model:chat');
        if (raw) return JSON.parse(raw);
      } catch {}
      return currentModel?.id || 'openai/gpt-4o-mini';
    })();

    // ВАЖНО: WorkspaceMode теперь использует локальную ленту (workspaceChat) и свой обработчик.
    // Если текущий экран — workspace, не пишем в глобальный 'chat-messages' и выходим.
    if (currentMode === 'workspace') {
      setIsProcessing(false);
      return;
    }

    // ChatMode: не ставим workspaceMode, чтобы WorkspaceMode не «подхватывал» эти сообщения
    const userMessage = createMessage(text, 'user', isVoice, undefined);
    appendMessageUnique(userMessage);

    // Store user message in vector database with context
    try {
      await vectorService.addDocument({
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
      console.error('Error storing message in vector DB:', error);
    }

    try {
      let responseText = '';

      if (mode === 'ask') {
        // ASK режим - прямой вопрос к ИИ без планирования и действий
        responseText = await llmService.askQuestion(text, modelId);

      } else if (mode === 'plan') {
        // PLAN режим — создание плана БЕЗ выполнения, с подтверждением
        if (awaitingConfirmation && pendingPlan) {
          const answer = text.trim().toLowerCase();
          if (answer.startsWith('да') || answer.startsWith('yes') || answer.startsWith('подтверж')) {
            // Подтверждено — создаем TODO список
            let currentList = todo.currentList;
            if (!currentList) {
              currentList = await todo.createTodoList(pendingPlan.planName || 'Новый план', pendingPlan.description);
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
            setAwaitingConfirmation(false);
            setPendingPlan(null);
            responseText = `✅ План подтверждён и создан TODO список: ${pendingPlan.planName}\n\nДобавлено задач: ${(pendingPlan.todos || []).length}.\nПереключитесь в режим ACT для выполнения задач.`;
          } else if (answer.startsWith('нет') || answer.startsWith('no') || answer.startsWith('отмена')) {
            setAwaitingConfirmation(false);
            setPendingPlan(null);
            responseText = '❎ План отклонён. Опишите пожелания или отправьте новый запрос для генерации другого плана.';
          } else {
            // Изменения — перегенерировать с учётом фидбэка
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
            const planResponse = await llmService.askQuestion(prompt, modelId);
            try {
              const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const planData = JSON.parse(jsonMatch[0]);
                setPendingPlan(planData);
                setAwaitingConfirmation(true);
                responseText = `📝 Обновленный план "${planData.planName}" подготовлен.\n\n${planData.description}\n\nШаги:\n${planData.todos.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n')}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>"`;
              } else {
                responseText = planResponse;
              }
            } catch (error) {
              console.error('Error parsing updated plan JSON:', error);
              responseText = planResponse;
            }
          }
        } else {
          // Генерация первого варианта плана
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

          const planResponse = await llmService.askQuestion(prompt, modelId);

          try {
            const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const planData = JSON.parse(jsonMatch[0]);
              setPendingPlan(planData);
              setAwaitingConfirmation(true);
              responseText = `📝 Предложен план "${planData.planName}".\n\n${planData.description}\n\nШаги:\n${planData.todos.map((t: any, i: number) => `${i + 1}. ${t.title}`).join('\n')}\n\nПодтверждаете план? Ответьте: "да" | "нет" | "изменения: <текст>"`;
            } else {
              responseText = planResponse;
            }
          } catch (error) {
            console.error('Error parsing plan JSON:', error);
            responseText = planResponse;
          }
        }

      } else if (mode === 'act') {
        // ACT режим - выполнение задач из TODO списка
        const currentItem = todo.getCurrentItem();
        const nextItem = todo.getNextItem();

        let contextPrompt = '';
        let taskToExecute = text;

        if (text.toLowerCase().includes('следующая задача') || text.toLowerCase().includes('next') || text.toLowerCase().includes('продолжить')) {
          // Пользователь хочет перейти к следующей задаче
          if (currentItem) {
            await todo.updateTodoItem(currentItem.id, { status: 'completed', result: 'Задача завершена по запросу пользователя' });
          }
          if (nextItem) {
            await todo.setCurrentTodoInProgress(nextItem.id);
            taskToExecute = nextItem.title;
            contextPrompt = `Выполни следующую задачу из TODO списка: "${nextItem.title}"
Описание: ${nextItem.description || 'Нет описания'}
Инструкции: ${nextItem.instructions || 'Нет инструкций'}
Ожидаемый результат: ${nextItem.expectedResult || 'Не указан'}`;
          } else {
            responseText = '🎉 **Все задачи выполнены!** TODO список завершен.';
          }
        } else if (currentItem) {
          // Есть текущая задача - работаем с ней
          contextPrompt = `Продолжай работу над текущей задачей: "${currentItem.title}"
Описание: ${currentItem.description || 'Нет описания'}
Инструкции: ${currentItem.instructions || 'Нет инструкций'}
Ожидаемый результат: ${currentItem.expectedResult || 'Не указан'}

Пользователь говорит: "${text}"`;
        } else if (nextItem) {
          // Нет текущей задачи, но есть следующая
          await todo.setCurrentTodoInProgress(nextItem.id);
          contextPrompt = `Начинаю работу над задачей: "${nextItem.title}"
Описание: ${nextItem.description || 'Нет описания'}
Инструкции: ${nextItem.instructions || 'Нет инструкций'}
Ожидаемый результат: ${nextItem.expectedResult || 'Не указан'}

Дополнительно: ${text}`;
        } else {
          // Нет задач в TODO
          contextPrompt = `Выполни задачу: "${text}"

Примечание: В TODO списке нет активных задач. Работаю в свободном режиме.`;
        }

        if (!responseText) {
          const prompt = `Ты разработчик в режиме ACT. ${contextPrompt}${workRulesContext}${todoListContext}

Используй доступные инструменты для:
- Чтения и редактирования файлов
- Выполнения команд
- Создания новых компонентов
- Тестирования изменений

ОБЯЗАТЕЛЬНО СОБЛЮДАЙ ВСЕ ПРАВИЛА РАБОТЫ ВЫШЕ!

После выполнения:
1. Опиши что сделал
2. Покажи результат
3. Укажи если задача завершена

Если задача выполнена, скажи "ЗАДАЧА ЗАВЕРШЕНА" в конце ответа.`;

          responseText = await llmService.askQuestion(prompt, modelId);

          // Автоматически отмечаем задачу как выполненную если ИИ сказал что завершил
          if (responseText.includes('ЗАДАЧА ЗАВЕРШЕНА') && currentItem) {
            await todo.updateTodoItem(currentItem.id, {
              status: 'completed',
              result: 'Задача выполнена автоматически',
              actualTime: 30 // Примерное время выполнения
            });

            const nextTask = todo.getNextItem();
            if (nextTask) {
              responseText += `\n\n📋 **Следующая задача:** ${nextTask.title}\nНапишите "следующая задача" для продолжения.`;
            } else {
              responseText += '\n\n🎉 **Все задачи из TODO списка выполнены!**';
            }
          }
        }
      }

      // ChatMode ответ: также без workspaceMode
      if (cancelAnswerRef.current) {
        toast.info('Ответ прерван');
        return;
      }
      const assistantMessage = createMessage(responseText, 'assistant', isVoice, undefined);
      appendMessageUnique(assistantMessage);

      // Store assistant response in vector database
      try {
        await vectorService.addDocument({
          id: assistantMessage.id,
          content: responseText,
          metadata: {
            type: 'assistant_message',
            workspaceMode: mode,
            timestamp: assistantMessage.timestamp.toISOString(),
            isVoice: isVoice || false,
          },
        });
      } catch (error) {
        console.error('Error storing assistant message in vector DB:', error);
      }

      // Auto savepoint after each ACT step
      if (mode === 'act') {
        const allMessages = [...(messages || []), userMessage, assistantMessage];
        const contextData = updateContextUsage(allMessages, workRulesContext, todoListContext);
        const newSavePoint = {
          id: `save_${Date.now()}`,
          timestamp: new Date(),
          contextUsed: contextData.totalTokens,
          messagesCount: allMessages.length,
          description: `Step ${todo.getCompletedCount()}/${todo.getTotalCount()}`
        };
        try {
          setSavePoints(prev => [...(prev || []), newSavePoint]);
        } catch (e) {
          console.error('Error saving savepoint:', e);
        }
      }

      if (isVoice) {
        ttsStop();
        // Не озвучиваем, если отменили ответ
        if (!cancelAnswerRef.current) {
          ttsSpeak(responseText);
        }
      }

      toast.success(`${mode.toUpperCase()} режим: задача выполнена`);

    } catch (error) {
      console.error('Error processing message:', error);
      toast.error('Ошибка при обработке сообщения');
    } finally {
      setIsProcessing(false);
    }
  }, [appendMessageUnique, createMessage, ttsStop, ttsSpeak, llmService, vectorService, workRulesContext, todoListContext, todo, currentModel?.id]);


  const handleClearHistory = useCallback(() => {
    setMessages([]);
    toast.success('История чата очищена');
  }, [setMessages]);

  const handleLoadSession = useCallback((sessionMessages: Message[]) => {
    console.log('Loading session with', sessionMessages.length, 'messages');

    // Сначала очищаем состояние
    setIsProcessing(false);
    setAwaitingConfirmation(false);
    setCurrentQuery('');

    // Загружаем сообщения
    setMessages(sessionMessages);

    // Определяем режим на основе сообщений
    const hasImageMessages = sessionMessages.some(msg => msg.type === 'assistant' && msg.content?.includes('🎨'));
    const hasWorkspaceMessages = sessionMessages.some(msg => msg.workspaceMode && msg.workspaceMode !== 'ask');

    // Переключаемся в соответствующий режим
    if (hasImageMessages) {
      setCurrentMode('image-creator');
      setShowImageGallery(false);
    } else if (hasWorkspaceMessages) {
      setCurrentMode('workspace');
      // Определяем режим workspace на основе сообщений
      const workspaceMode = sessionMessages.find(msg => msg.workspaceMode)?.workspaceMode || 'ask';
      setCurrentWorkspaceMode(workspaceMode);
    } else {
      setCurrentMode('chat');
    }

    // Принудительно обновляем интерфейс
    setTimeout(() => {
      console.log('Messages state updated:', sessionMessages.length);
    }, 100);
  }, [setMessages, setCurrentMode, setCurrentWorkspaceMode]);

  const handleNewChat = useCallback(() => {
    // Очищаем все состояния для нового чата
    setMessages([]);
    setIsProcessing(false);
    setAwaitingConfirmation(false);
    setCurrentQuery('');

    // Очищаем состояние Image Creator
    startNewImageChat();

    // Очищаем состояние Workspace
    setCurrentWorkspaceMode('ask');

    toast.success('Новый чат создан');
  }, [setMessages, startNewImageChat, setCurrentWorkspaceMode]);

  const renderMode = () => {
    switch (currentMode) {
      case 'chat':
        return (
          <ChatMode
            messages={messages || []}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
          />
        );
      case 'image-creator':
        return (
          <ImageCreatorMode
            messages={messages}
            onSendMessage={handleSendMessage}
            isProcessing={isProcessing}
            showGallery={showImageGallery}
            onToggleGallery={() => setShowImageGallery(!showImageGallery)}
          />
        );
      case 'workspace':
        return (
          <WorkspaceMode
            messages={messages}
            // onSendMessage не передаём — WorkspaceMode обрабатывает чат локально
            isProcessing={isProcessing}
            currentMode={currentWorkspaceMode}
            onModeChange={setCurrentWorkspaceMode}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen text-foreground flex flex-col relative bg-transparent">
      {/* Header */}
      <header className="bg-card p-4 relative z-10 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🧠</div>
            <div>
              <h1 className="text-2xl font-bold">Agent Slavik</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isProcessing && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  cancelAnswerRef.current = true;
                  setIsProcessing(false);
                  ttsStop();
                }}
                className="gap-2"
              >
                ⏹️ Остановить ответ
              </Button>
            )}
            {currentMode === 'image-creator' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImageGallery(!showImageGallery)}
                className="gap-2"
                title="Галерея изображений"
              >
                <Images size={16} />
              </Button>
            )}
            <SettingsDialog />
            <WorkRulesDialog />
            <ModeSelector
              currentMode={currentMode || 'chat'}
              onModeChange={setCurrentMode}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-0' : 'w-80'} transition-all duration-300 bg-card flex flex-col relative z-10 flex-shrink-0 overflow-hidden`}>
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            {!sidebarCollapsed && (
              <>
                <ChatHistory
                  messages={messages || []}
                  onClearHistory={handleClearHistory}
                  onNewChat={handleNewChat}
                  onLoadSession={handleLoadSession}
                />
                
                {/* Smart Context - only show in workspace mode */}
                {currentMode === 'workspace' && currentQuery && (
                  <SmartContextPanel
                    query={currentQuery}
                    mode={currentWorkspaceMode}
                    onSuggestionClick={(suggestion) => {
                      handleSendMessage(suggestion, currentWorkspaceMode);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </aside>

        {/* Sidebar Toggle Button */}
        <div className="flex flex-col justify-center relative z-10 group">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="rounded-l-none border-l-0 h-12 w-6 p-0 opacity-30 group-hover:opacity-60 hover:opacity-90 transition-all duration-300 bg-background/50 border-transparent hover:border-muted backdrop-blur-sm"
          >
            {sidebarCollapsed ? (
              <CaretRight size={16} />
            ) : (
              <CaretLeft size={16} />
            )}
          </Button>
        </div>

        {/* Main View */}
        <main className="flex-1 min-w-0 bg-transparent relative z-10 flex flex-col">
          <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Загрузка модуля...</div>}>
            {renderMode()}
          </Suspense>
        </main>
      </div>

      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(39, 39, 42, 0.9)',
            color: 'oklch(0.9 0.05 280)',
            border: '1px solid oklch(0.3 0.05 245)',
            backdropFilter: 'blur(8px)',
          },
        }}
      />
    </div>
  );
}

export default App;
