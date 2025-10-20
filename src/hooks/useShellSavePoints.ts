import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { orchestratorApi } from '@/lib/orchestrator/api';
import { emitAgentError, emitAgentWarning } from '@/lib/services/agent-event-system';
import type { Message, SavePoint, PendingPlan } from '@/lib/types';
import { useModeOrchestratorStore } from '@/stores/mode-orchestrator-store';
import type { OperatingMode, WorkspaceModeType } from '@/stores/mode-orchestrator-store';

interface SavePointData {
  messages: Message[];
  currentMode: OperatingMode;
  currentWorkspaceMode: WorkspaceModeType;
  pendingPlan: PendingPlan | null;
  sidebarCollapsed: boolean;
}

export function useShellSavePoints(
  messages: Message[],
  currentMode: OperatingMode,
  currentWorkspaceMode: WorkspaceModeType,
  pendingPlan: PendingPlan | null,
  sidebarCollapsed: boolean,
  contextTokens: number,
) {
  const savePoints = useModeOrchestratorStore((state) => state.chat.savePoints);
  const {
    setMessages: storeSetMessages,
    setCurrentMode: storeSetCurrentMode,
    setWorkspaceMode: storeSetWorkspaceMode,
    setPendingPlan: storeSetPendingPlan,
    setSidebarCollapsed: storeSetSidebarCollapsed,
    updateSavePoints: storeUpdateSavePoints,
  } = useModeOrchestratorStore((state) => state.actions);

  const restoreFromSavePoint = useCallback(
    (savePoint: SavePoint) => {
      if (!savePoint.data) {
        console.warn('SavePoint does not contain data for restoration');
        emitAgentError({
          message: 'Точка сохранения не содержит данных для восстановления',
          source: 'useShellSavePoints',
          scope: 'restore-savepoint',
          context: { savePointId: savePoint.id },
        });
        return false;
      }

      try {
        const data = savePoint.data as SavePointData;
        const {
          messages: savedMessages,
          currentMode: savedMode,
          currentWorkspaceMode: savedWorkspaceMode,
          pendingPlan: savedPlan,
          sidebarCollapsed: savedSidebar,
        } = data;

        if (savedMessages && Array.isArray(savedMessages)) {
          storeSetMessages(
            savedMessages.map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            })),
          );
        }

        if (savedMode) {
          storeSetCurrentMode(savedMode);
        }

        if (savedWorkspaceMode) {
          storeSetWorkspaceMode(savedWorkspaceMode);
        }

        if (savedPlan !== undefined) {
          storeSetPendingPlan(savedPlan);
        }

        if (savedSidebar !== undefined) {
          storeSetSidebarCollapsed(savedSidebar);
        }

        console.log('✅ Состояние восстановлено из точки сохранения:', JSON.stringify(savePoint.description, null, 2));
        toast.success(`Состояние восстановлено: ${savePoint.description}`);
        return true;
      } catch (error) {
        console.error('❌ Ошибка восстановления состояния:', JSON.stringify(error, null, 2));
        emitAgentError({
          message: 'Ошибка восстановления состояния',
          source: 'useShellSavePoints',
          scope: 'restore-savepoint',
          error: error as Error,
        });
        throw error;
      }
    },
    [
      storeSetMessages,
      storeSetCurrentMode,
      storeSetWorkspaceMode,
      storeSetPendingPlan,
      storeSetSidebarCollapsed,
    ],
  );

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

  const createManualSavePoint = useCallback(
    (description: string = 'Ручное сохранение') => {
      const newSavePoint: SavePoint = {
        id: `save_${Date.now()}`,
        timestamp: new Date(),
        contextUsed: contextTokens,
        messagesCount: messages ? messages.length : 0,
        description,
        data: {
          messages: messages || [],
          currentMode,
          currentWorkspaceMode,
          pendingPlan,
          sidebarCollapsed,
        },
      };

      try {
        storeUpdateSavePoints((prev: SavePoint[]) => [...prev, newSavePoint]);
        toast.success(`Состояние сохранено: ${description}`);
        return newSavePoint;
      } catch (error) {
        console.error('❌ Ошибка сохранения состояния:', JSON.stringify(error, null, 2));
        emitAgentError({
          message: 'Ошибка сохранения состояния',
          source: 'useShellSavePoints',
          scope: 'save-state',
          error: error as Error,
        });
        throw error;
      }
    },
    [
      contextTokens,
      messages,
      currentMode,
      currentWorkspaceMode,
      pendingPlan,
      sidebarCollapsed,
      storeUpdateSavePoints,
    ],
  );

  return {
    createManualSavePoint,
    restoreFromSavePoint,
  };
}
