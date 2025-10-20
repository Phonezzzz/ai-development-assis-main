import { useState, useCallback, useEffect } from 'react';
import { Message, WorkspaceMode as WorkspaceModeType } from '@/lib/types';
import { ModernChatInput } from '@/components/ModernChatInput';
import { ChatHistory } from '@/components/ChatHistory';
import { WorkModeSelector } from '@/components/WorkModeSelector';
import { useAgent } from '@/hooks/useAgent';
import { agentAutonomousActions } from '@/lib/services/agent-autonomous-actions';
import { Button } from '@/components/ui/button';
import { Play, Trash, CheckCircle } from '@phosphor-icons/react';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { useModelSelection } from '@/hooks/use-model-selection';
import { ContextUsageBar } from '@/components/ContextUsageBar';
import { useKV } from '@/shims/spark-hooks';
import type { SavePoint } from '@/lib/types';

interface WorkspaceAgentModeProps {
  messages: Message[];
  onSendMessage: (text: string, mode: WorkspaceModeType, isVoice?: boolean) => void;
  isProcessing: boolean;
}

export function WorkspaceAgentMode({ messages, onSendMessage, isProcessing }: WorkspaceAgentModeProps) {
  const [currentWorkspaceMode, setCurrentWorkspaceMode] = useState<WorkspaceModeType>('ask');
  const [workspaceChat, setWorkspaceChat] = useState<Message[]>([]);
  const [savePoints, setSavePoints] = useKV<SavePoint[]>('context-save-points', []);

  const {
    agentState,
    currentSession,
    currentTask,
    tasks,
    memory,
    isInitialized,
    startTask,
    updateTask,
    completeTask,
    failTask,
    addMemory,
    setAgentState,
    getMemoryStats,
    clearSessionMemory,
    hasActiveTask,
    progress
  } = useAgent();

  const { getCurrentUsage } = useContextTracker();
  const { currentModel } = useModelSelection('workspace');

  const getTaskId = (): string => {
    return currentTask ? currentTask.id : 'unknown';
  };

  // Инициализация агента при монтировании
  useEffect(() => {
    if (!isInitialized) {
      // Агент автоматически инициализируется в хуке useAgent
      console.log('WorkspaceAgentMode: Агент инициализирован');
    }
  }, [isInitialized]);

  // Обработка отправки сообщения с интеграцией агента
  const handleSendMessage = useCallback(async (text: string, isVoice?: boolean) => {
    if (!text.trim()) return;

    // Создаем пользовательское сообщение
    const userMessage: Message = {
      id: `ws_msg_${Date.now()}_user`,
      type: 'user',
      content: text,
      timestamp: new Date(),
      isVoice,
      workspaceMode: currentWorkspaceMode,
    };

    setWorkspaceChat(prev => [...prev, userMessage]);

    // Обработка в зависимости от режима workspace
    if (currentWorkspaceMode === 'plan') {
      // В режиме планирования создаем задачу для агента
      try {
        const taskData = {
          title: `План: ${text.substring(0, 50)}...`,
          description: text,
          goal: text,
          priority: 'medium' as const,
          estimatedTime: 30
        };

        await startTask(taskData);
        
        // Добавляем сообщение агента о начале планирования
        const agentMessage: Message = {
          id: `ws_msg_${Date.now()}_agent`,
          type: 'assistant',
          content: `🤖 Начинаю планирование задачи: "${text}"\n\nСостояние агента: ${agentState}`,
          timestamp: new Date(),
          workspaceMode: currentWorkspaceMode,
        };

        setWorkspaceChat(prev => [...prev, agentMessage]);
        
        // Сохраняем в память агента
        await addMemory({
          context: `Пользователь запросил планирование: ${text}`,
          type: 'observation',
          importance: 3,
          metadata: { workspaceMode: currentWorkspaceMode }
        });

      } catch (error) {
        console.error('Ошибка создания задачи:', JSON.stringify(error, null, 2));
        const errorMessage: Message = {
          id: `ws_msg_${Date.now()}_error`,
          type: 'assistant',
          content: `❌ Ошибка при создании задачи: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          timestamp: new Date(),
          workspaceMode: currentWorkspaceMode,
        };
        setWorkspaceChat(prev => [...prev, errorMessage]);
      }

    } else if (currentWorkspaceMode === 'act') {
      // В режиме выполнения создаем задачу и инициируем автономные действия
      try {
        const taskData = {
          title: `Выполнение: ${text.substring(0, 50)}...`,
          description: text,
          goal: text,
          priority: 'high' as const,
          estimatedTime: 60
        };

        await startTask(taskData);
        
        // Сообщение о начале выполнения
        const agentMessage: Message = {
          id: `ws_msg_${Date.now()}_agent`,
          type: 'assistant',
          content: `🚀 Начинаю выполнение задачи: "${text}"\n\nСостояние: ${agentState}`,
          timestamp: new Date(),
          workspaceMode: currentWorkspaceMode,
        };

        setWorkspaceChat(prev => [...prev, agentMessage]);

        // Инициируем автономные действия на основе задачи
        if (text.toLowerCase().includes('файл') || text.toLowerCase().includes('file')) {
          // Автономное действие с файлом
          if (currentTask) {
            const action = await agentAutonomousActions.executeFileOperation(
              currentTask,
              'read',
              '/example/file.txt'
            );
            
            const actionMessage: Message = {
              id: `ws_msg_${Date.now()}_action`,
              type: 'assistant',
              content: `📁 Автономное действие: ${action.description}\nСтатус: ${action.status}`,
              timestamp: new Date(),
              workspaceMode: currentWorkspaceMode,
            };
            setWorkspaceChat(prev => [...prev, actionMessage]);
          }
        }

        // Сохраняем в память агента
        await addMemory({
          context: `Пользователь запросил выполнение: ${text}`,
          type: 'action',
          importance: 4,
          metadata: {
            workspaceMode: currentWorkspaceMode,
            taskId: getTaskId()
          }
        });

      } catch (error) {
        console.error('Ошибка выполнения задачи:', JSON.stringify(error, null, 2));
        const errorMessage: Message = {
          id: `ws_msg_${Date.now()}_error`,
          type: 'assistant',
          content: `❌ Ошибка при выполнении задачи: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          timestamp: new Date(),
          workspaceMode: currentWorkspaceMode,
        };
        setWorkspaceChat(prev => [...prev, errorMessage]);
      }

    } else {
      // В режиме ask используем стандартную обработку
      onSendMessage(text, currentWorkspaceMode, isVoice);
    }
  }, [currentWorkspaceMode, onSendMessage, agentState, startTask, addMemory]);

  // Обработчик изменения режима workspace
  const handleWorkspaceModeChange = useCallback((mode: WorkspaceModeType) => {
    setCurrentWorkspaceMode(mode);
    
    // Добавляем системное сообщение при смене режима
    const systemMessage: Message = {
      id: `ws_msg_${Date.now()}_system`,
      type: 'assistant',
      content: `🔄 Переключен в режим: ${getModeDescription(mode)}`,
      timestamp: new Date(),
      workspaceMode: mode,
    };
    
    setWorkspaceChat(prev => [...prev, systemMessage]);
  }, []);

  // Функция для получения описания режима
  const getModeDescription = (mode: WorkspaceModeType): string => {
    switch (mode) {
      case 'ask':
        return '💬 Вопросы и ответы';
      case 'plan':
        return '📋 Планирование задач';
      case 'act':
        return '🚀 Автономное выполнение';
      default:
        return mode;
    }
  };

  // Обработчик запуска автономного действия
  const handleStartAutonomousAction = useCallback(async () => {
    if (!currentTask) {
      const errorMessage: Message = {
        id: `ws_msg_${Date.now()}_error`,
        type: 'assistant',
        content: '❌ Нет активной задачи для автономного выполнения',
        timestamp: new Date(),
        workspaceMode: currentWorkspaceMode,
      };
      setWorkspaceChat(prev => [...prev, errorMessage]);
      return;
    }

    try {
      // Пример автономного действия - чтение файла
      const action = await agentAutonomousActions.executeFileOperation(
        currentTask,
        'read',
        '/example/project-structure.json'
      );

      const actionMessage: Message = {
        id: `ws_msg_${Date.now()}_action`,
        type: 'assistant',
        content: `робот Автономное действие запущено: ${action.description}`,
        timestamp: new Date(),
        workspaceMode: currentWorkspaceMode,
      };
      setWorkspaceChat(prev => [...prev, actionMessage]);

    } catch (error) {
      console.error('Ошибка автономного действия:', JSON.stringify(error, null, 2));
      const errorMessage: Message = {
        id: `ws_msg_${Date.now()}_error`,
        type: 'assistant',
        content: `❌ Ошибка автономного действия: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        timestamp: new Date(),
        workspaceMode: currentWorkspaceMode,
      };
      setWorkspaceChat(prev => [...prev, errorMessage]);
    }
  }, [currentTask, currentWorkspaceMode]);

  // Обработчик завершения текущей задачи
  const handleCompleteCurrentTask = useCallback(async () => {
    if (!currentTask) return;

    try {
      await completeTask(currentTask.id, 'Задача завершена пользователем');
      
      const message: Message = {
        id: `ws_msg_${Date.now()}_system`,
        type: 'assistant',
        content: `✅ Задача "${currentTask.title}" завершена`,
        timestamp: new Date(),
        workspaceMode: currentWorkspaceMode,
      };
      setWorkspaceChat(prev => [...prev, message]);
    } catch (error) {
      console.error('Ошибка завершения задачи:', JSON.stringify(error, null, 2));
    }
  }, [currentTask, currentWorkspaceMode, completeTask]);

  // Обработчик сброса сессии
  const handleResetSession = useCallback(async () => {
    try {
      await clearSessionMemory();
      setWorkspaceChat([]);
      
      const message: Message = {
        id: `ws_msg_${Date.now()}_system`,
        type: 'assistant',
        content: '🔄 Сессия агента сброшена. Память очищена.',
        timestamp: new Date(),
        workspaceMode: currentWorkspaceMode,
      };
      setWorkspaceChat(prev => [...prev, message]);
    } catch (error) {
      console.error('Ошибка сброса сессии:', JSON.stringify(error, null, 2));
    }
  }, [clearSessionMemory, currentWorkspaceMode]);

  // Адаптер для ModernChatInput
  const handleChatInputSubmit = useCallback((text: string, mode: WorkspaceModeType, isVoice?: boolean) => {
    handleSendMessage(text, isVoice);
  }, [handleSendMessage]);

  // Расчет прогресса выполнения задач
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Расчет использования контекста
  const currentContextUsage = getCurrentUsage();

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок и управление */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Автономный Агент</h2>
          <WorkModeSelector
            selectedMode={currentWorkspaceMode}
            onModeSelect={handleWorkspaceModeChange}
          />
        </div>
        
        <div className="flex items-center gap-2">
          {hasActiveTask && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCompleteCurrentTask}
              className="flex items-center gap-2"
            >
              <CheckCircle size={16} />
              Завершить задачу
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleStartAutonomousAction}
            disabled={!hasActiveTask}
            className="flex items-center gap-2"
          >
            <Play size={16} />
            Автономное действие
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetSession}
            className="flex items-center gap-2"
          >
            <Trash size={16} />
            Сбросить
          </Button>
        </div>
      </div>

      {/* Прогресс выполнения и использования контекста */}
      <div className="border-b p-3 space-y-2 bg-muted/20">
        {/* Прогресс выполнения задач */}
        {tasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Прогресс выполнения задач</span>
              <span>{completedTasks}/{totalTasks} ({Math.round(taskProgress)}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div
                className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                style={{ width: `${taskProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Контекстная шкала с сегментами от savepoint'ов */}
        <ContextUsageBar
          currentContextUsage={currentContextUsage}
          onRestoreToSavePoint={(savePointId) => {
            // TODO: Реализовать восстановление до savepoint
            console.log('Restore to save point:', JSON.stringify(savePointId, null, 2));
          }}
          className="border-0 p-0 bg-transparent shadow-none"
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Основной чат */}
        <div className="flex-1 flex flex-col">
          {/* Убраны вкладки, теперь отображаем все в одном потоке */}
          <div className="flex-1 overflow-hidden">
            <ChatHistory
              messages={workspaceChat}
              onClearHistory={() => {}}
              onNewChat={() => {}}
            />
          </div>

          {/* Панель ввода */}
          <div className="border-t p-4">
            <ModernChatInput
              onSubmit={handleChatInputSubmit}
              placeholder={
                currentWorkspaceMode === 'ask' 
                  ? 'Задайте вопрос...' 
                  : currentWorkspaceMode === 'plan'
                  ? 'Опишите задачу для планирования...'
                  : 'Опишите задачу для выполнения...'
              }
              showModeSelector={false}
              scope="workspace"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
