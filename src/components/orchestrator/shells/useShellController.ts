import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useVoice } from '@/hooks/useVoice';
import { useWorkRules } from '@/hooks/use-work-rules';
import { useTodo } from '@/hooks/use-todo';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { useImageCreator } from '@/hooks/use-image-creator';
import { useShellUIState } from '@/hooks/useShellUIState';
import { useMessageContext } from '@/hooks/useMessageContext';
import { useShellSavePoints } from '@/hooks/useShellSavePoints';
import { useShellMessageHandler } from '@/hooks/useShellMessageHandler';
import { orchestratorApi } from '@/lib/orchestrator/api';
import type { Message, WorkspaceMode } from '@/lib/types';
import { useModeOrchestratorStore } from '@/stores/mode-orchestrator-store';
import type { WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { emitAgentError, emitAgentWarning } from '@/lib/services/agent-event-system';

export interface ShellController {
  currentMode: string;
  currentWorkspaceMode: WorkspaceModeType;
  sidebarCollapsed: boolean;
  showImageGallery: boolean;
  showRoutingMonitor: boolean;
  showTestSuite: boolean;
  messages: Message[];
  isProcessing: boolean;
  handleModeChange: (mode: string) => void;
  handleSidebarToggle: () => void;
  handleToggleGallery: () => void;
  handleToggleRoutingMonitor: () => void;
  handleToggleTestSuite: () => void;
  handleSendMessage: (text: string, mode: WorkspaceModeType, isVoice?: boolean) => Promise<void>;
  handleClearHistory: () => void;
  handleLoadSession: (sessionMessages: Message[]) => void;
  handleNewChat: () => void;
}

export function useShellController(): ShellController {
  // Extract UI state management
  const {
    uiState,
    handleModeChange,
    handleSidebarToggle,
    handleToggleGallery,
    handleToggleRoutingMonitor,
    handleToggleTestSuite,
    storeSetWorkspaceMode,
    storeSetSidebarCollapsed,
  } = useShellUIState();

  // Get message context utilities
  const { trimMessagesIfNeeded } = useMessageContext();

  // Get voice utilities
  const { stt: { stopListening } } = useVoice();

  // Get store data
  const messages = useModeOrchestratorStore((state) => state.chat.messages);
  const awaitingConfirmation = useModeOrchestratorStore(
    (state) => state.chat.awaitingConfirmation,
  );
  const currentQuery = useModeOrchestratorStore((state) => state.chat.currentQuery);
  const pendingPlan = useModeOrchestratorStore((state) => state.chat.pendingPlan);
  const savePoints = useModeOrchestratorStore((state) => state.chat.savePoints);

  const {
    setMessages: storeSetMessages,
    updateMessages: storeUpdateMessages,
    clearMessages: storeClearMessages,
    setAwaitingConfirmation: storeSetAwaitingConfirmation,
    setCurrentQuery: storeSetCurrentQuery,
    updateSavePoints: storeUpdateSavePoints,
    setPendingPlan: storeSetPendingPlan,
    setCurrentMode: storeSetCurrentMode,
    setShowImageGallery: storeSetShowImageGallery,
  } = useModeOrchestratorStore((state) => state.actions);

  const [isProcessing, setIsProcessing] = useState(false);

  const workRules = useWorkRules();
  const todo = useTodo();
  const { contextData, updateContextUsage } = useContextTracker();
  const { startNewImageChat } = useImageCreator();

  // Extract save points management
  const { createManualSavePoint, restoreFromSavePoint } = useShellSavePoints(
    messages || [],
    uiState.currentMode as any,
    uiState.currentWorkspaceMode,
    pendingPlan,
    uiState.sidebarCollapsed,
    contextData?.totalTokens || 0,
  );

  // Prepare callbacks for message handler
  const messageHandlerCallbacks = useMemo(
    () => ({
      onAppendMessage: (msg: Message) => {
        storeUpdateMessages((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((m) => m.id === msg.id)) return list;
          return [...list, msg];
        });
      },
      onSetProcessing: setIsProcessing,
      onSetCurrentQuery: storeSetCurrentQuery,
      onSetWorkspaceMode: storeSetWorkspaceMode,
      onSetAwaitingConfirmation: storeSetAwaitingConfirmation,
      onSetPendingPlan: storeSetPendingPlan,
    }),
    [storeUpdateMessages, storeSetCurrentQuery, storeSetWorkspaceMode, storeSetAwaitingConfirmation, storeSetPendingPlan],
  );

  // Extract message handling
  const { handleSendMessage: baseHandleSendMessage } = useShellMessageHandler(
    uiState.currentMode,
    currentQuery,
    awaitingConfirmation,
    pendingPlan,
    messageHandlerCallbacks,
  );

  // Initialize data migration
  useEffect(() => {
    const initializeDataMigration = async () => {
      try {
        console.log('🔄 Инициализация миграции данных...');
        const migrationResult = await orchestratorApi.data.migrate();

        if (migrationResult.success) {
          if (migrationResult.cleanedItems.length > 0) {
            console.log(`✅ Миграция завершена. Очищено элементов: ${migrationResult.cleanedItems.length}`);
            toast.success(
              `Данные обновлены: очищено ${migrationResult.cleanedItems.length} элементов`,
              {
                duration: 3000,
                description: migrationResult.cleanedItems.slice(0, 3).join(', '),
              },
            );
          }

          if (migrationResult.errors.length > 0) {
            console.warn('⚠️ Ошибки миграции:', JSON.stringify(migrationResult.errors, null, 2));
            emitAgentWarning({
              message: 'Некоторые данные не удалось очистить',
              description: `${migrationResult.errors.length} ошибок`,
              source: 'useShellController',
              scope: 'data-migration',
              context: { errors: migrationResult.errors },
            });
          }
        } else {
          console.error('❌ Ошибка миграции данных:', JSON.stringify(migrationResult.errors, null, 2));
          emitAgentError({
            message: 'Ошибка при обновлении данных',
            description: 'Проверьте консоль для деталей',
            source: 'useShellController',
            scope: 'data-migration',
            context: { errors: migrationResult.errors },
          });
        }
      } catch (error) {
        console.error('❌ Критическая ошибка миграции:', JSON.stringify(error, null, 2));
        emitAgentError({
          message: 'Критическая ошибка при инициализации данных',
          source: 'useShellController',
          scope: 'data-migration',
          error: error as Error,
        });
        throw error;
      }
    };

    initializeDataMigration();
  }, []);

  // Check data integrity
  useEffect(() => {
    const checkDataIntegrity = () => {
      try {
        const migrationInfo = orchestratorApi.data.getMigrationInfo();
        console.log('📊 Информация о миграции:', JSON.stringify(migrationInfo, null, 2));

        const modelKeys = [
          'selected-model:chat',
          'selected-model:workspace',
          'selected-model:image-creator',
          'model-reasoning-config',
        ];

        let integrityIssues = 0;
        modelKeys.forEach((key) => {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              JSON.parse(value);
            }
          } catch (error) {
            console.warn(`⚠️ Обнаружен некорректный ключ: ${key}`, JSON.stringify(error, null, 2));
            integrityIssues++;
            throw error;
          }
        });

        if (integrityIssues > 0) {
          console.warn(`⚠️ Обнаружено проблем с целостностью данных: ${integrityIssues}`);
          emitAgentWarning({
            message: 'Обнаружены проблемы с данными моделей',
            description: 'Рекомендуется очистить данные в настройках',
            source: 'useShellController',
            scope: 'data-integrity',
            context: { integrityIssues },
            action: {
              label: 'Настройки',
              onClick: () => {
                console.log('Открыть настройки для очистки данных');
              },
            },
          });
        }
      } catch (error) {
        console.error('❌ Ошибка проверки целостности данных:', JSON.stringify(error, null, 2));
        throw error;
      }
    };

    const timeoutId = setTimeout(checkDataIntegrity, 2000);
    return () => clearTimeout(timeoutId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        stopListening();
      } catch (error) {
        console.error('Ошибка остановки STT при размонтировании:', JSON.stringify(error, null, 2));
        throw error;
      }
    };
  }, [stopListening]);

  // Deduplicate messages
  useEffect(() => {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const seen = new Set<string>();
    const deduped: Message[] = [];
    let needsUpdate = false;

    for (const msg of messages) {
      if (!msg.id) {
        console.error('Message missing id:', msg);
        throw new Error('Message must have an id');
      }
      if (seen.has(msg.id)) {
        needsUpdate = true;
        continue;
      }
      seen.add(msg.id);
      deduped.push(msg);
    }

    if (needsUpdate || deduped.length !== messages.length) {
      storeSetMessages(deduped);
    }
  }, [messages, storeSetMessages]);

  // Restore from save points on initialization
  useEffect(() => {
    const initializeAppState = () => {
      try {
        if (Array.isArray(savePoints) && savePoints.length > 0) {
          const latestSavePoint = savePoints[savePoints.length - 1];

          if (latestSavePoint.data) {
            console.log('🔄 Попытка восстановления состояния из последней точки сохранения');
            restoreFromSavePoint(latestSavePoint);
          } else {
            console.log('ℹ️ Точки сохранения найдены, но не содержат данных для восстановления');
          }
        }
      } catch (error) {
        console.error('❌ Ошибка при инициализации состояния приложения:', JSON.stringify(error, null, 2));
        throw error;
      }
    };

    initializeAppState();
  }, [savePoints, restoreFromSavePoint]);

  // Simple handlers
  const handleClearHistory = useCallback(() => {
    storeClearMessages();
    toast.success('История чата очищена');
  }, [storeClearMessages]);

  const handleLoadSession = useCallback(
    (sessionMessages: Message[]) => {
      console.log('Loading session with', sessionMessages.length, 'messages');

      setIsProcessing(false);
      storeSetAwaitingConfirmation(false);
      storeSetCurrentQuery('');

      storeSetMessages(sessionMessages);

      const hasImageMessages = sessionMessages.some(
        (msg) => msg.type === 'assistant' && msg.content && msg.content.includes('🎨'),
      );
      const hasWorkspaceMessages = sessionMessages.some(
        (msg) => msg.workspaceMode && msg.workspaceMode !== 'ask',
      );

      if (hasImageMessages) {
        storeSetCurrentMode('image-creator');
        storeSetShowImageGallery(false);
      } else if (hasWorkspaceMessages) {
        storeSetCurrentMode('workspace');
        const msgWithWorkspace = sessionMessages.find((msg) => msg.workspaceMode);
        const workspaceMode = msgWithWorkspace ? msgWithWorkspace.workspaceMode : 'ask';
        storeSetWorkspaceMode(workspaceMode as WorkspaceModeType);
      } else {
        storeSetCurrentMode('chat');
      }

      setTimeout(() => {
        console.log('Messages state updated:', JSON.stringify(sessionMessages.length, null, 2));
      }, 100);
    },
    [
      storeSetMessages,
      storeSetCurrentMode,
      storeSetWorkspaceMode,
      storeSetShowImageGallery,
      storeSetAwaitingConfirmation,
      storeSetCurrentQuery,
    ],
  );

  const handleNewChat = useCallback(() => {
    storeClearMessages();
    setIsProcessing(false);
    storeSetAwaitingConfirmation(false);
    storeSetCurrentQuery('');
    storeSetPendingPlan(null);

    startNewImageChat();

    storeSetWorkspaceMode('ask');

    toast.success('Новый чат создан');
  }, [
    storeClearMessages,
    storeSetAwaitingConfirmation,
    storeSetCurrentQuery,
    storeSetPendingPlan,
    startNewImageChat,
    storeSetWorkspaceMode,
  ]);

  useEffect(() => {
    console.log('🔍 useShellController useEffect triggered - messages:', messages ? messages.length : 0);
  }, [messages]);

  return {
    currentMode: uiState.currentMode,
    currentWorkspaceMode: uiState.currentWorkspaceMode,
    sidebarCollapsed: uiState.sidebarCollapsed,
    showImageGallery: uiState.showImageGallery,
    showRoutingMonitor: uiState.showRoutingMonitor,
    showTestSuite: uiState.showTestSuite,
    messages: messages || [],
    isProcessing,
    handleModeChange,
    handleSidebarToggle,
    handleToggleGallery,
    handleToggleRoutingMonitor,
    handleToggleTestSuite,
    handleSendMessage: baseHandleSendMessage,
    handleClearHistory,
    handleLoadSession,
    handleNewChat,
  };
}
