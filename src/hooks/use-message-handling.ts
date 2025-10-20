import { useCallback, useRef } from 'react';
import { Message, SavePoint, PendingPlan, TodoHook } from '@/lib/types';
import { llmService } from '@/lib/services/llm';
import { vectorService } from '@/lib/services/vector';
import { routingLogger } from '@/lib/services/routing-logger';
import { errorHandler } from '@/lib/services/error-handler';
import { emitAgentError } from '@/lib/services/agent-event-system';
import { toast } from 'sonner';
import { OperatingMode, WorkspaceModeType } from '@/stores/mode-orchestrator-store';
import { modelManager } from '@/lib/services/model-manager';
import { ProcessedError } from '@/lib/errors';

interface UseMessageHandlingProps {
  currentModelId?: string;
  awaitingConfirmation: boolean;
  pendingPlan: PendingPlan | null;
  currentQuery: string;
  messages: Message[];
  currentMode: OperatingMode;
  currentWorkspaceMode: WorkspaceModeType;
  sidebarCollapsed: boolean;
  storeSetPendingPlan: (plan: PendingPlan | null) => void;
  storeSetAwaitingConfirmation: (awaiting: boolean) => void;
  storeSetCurrentQuery: (query: string) => void;
  storeSetWorkspaceMode: (mode: WorkspaceModeType) => void;
  storeUpdateSavePoints: (updater: (prev: SavePoint[]) => SavePoint[]) => void;
  todo: TodoHook;
  workRulesContext: string;
  todoListContext: string;
  stopListening: () => void;
  speak: (text: string) => void;
  handleAskMode: (text: string, modelId: string) => Promise<string>;
  handlePlanMode: (
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
  ) => Promise<string>;
  handleActMode: (
    text: string,
    modelId: string,
    workRulesContext: string,
    todoListContext: string,
    todo: TodoHook
  ) => Promise<string>;
  createMessage: (content: string, type: 'user' | 'assistant', isVoice?: boolean, workspaceMode?: WorkspaceModeType) => Message;
  appendMessageUnique: (msg: Message) => void;
  updateContextUsage: (messages: Message[], workRulesContext: string, todoListContext: string) => { totalTokens: number };
}

export function useMessageHandling({
  currentModelId,
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
}: UseMessageHandlingProps) {
  const cancelAnswerRef = useRef(false);

  const handleSendMessage = useCallback(async (text: string, mode: WorkspaceModeType, isVoice?: boolean) => {
    const logId = routingLogger.logApiCall(`app_msg_${Date.now()}`, 'POST', 'app/handleSendMessage', {
      mode,
      textLength: text.length,
      isVoice,
      currentMode,
      workspaceMode: mode
    });

    if (!text.trim()) return;

    storeSetCurrentQuery(text);
    storeSetWorkspaceMode(mode);
    cancelAnswerRef.current = false;

    const currentModel = modelManager.getCurrentModel('chat');
    if (!currentModel) {
      const error = new Error('Пожалуйста, выберите модель перед отправкой сообщения');
      routingLogger.logError(logId, error, { stage: 'model_validation' });
      errorHandler.handleError(error, 'Model validation');
      return false;
    }
    const modelId = currentModel.id;

    routingLogger.logModelSelection(modelId, modelId.startsWith('local') ? 'Local' : 'OpenRouter', `Model selected for ${mode} mode`);

    if (currentMode === 'workspace') {
      return false;
    }

    const userMessage = createMessage(text, 'user', isVoice, undefined);
    appendMessageUnique(userMessage);

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
      routingLogger.logError(logId, (error as Error), {
        stage: 'vector_storage',
        messageId: userMessage.id
      });
      console.error('Error storing message in vector DB:', JSON.stringify((error as Error), null, 2));
    }

    try {
      let responseText = '';

      if (mode === 'ask') {
        responseText = await handleAskMode(text, modelId);

      } else if (mode === 'plan') {
        responseText = await handlePlanMode(
          text,
          modelId,
          awaitingConfirmation,
          pendingPlan, // может быть null при первой генерации плана
          workRulesContext,
          todoListContext,
          currentQuery,
          storeSetPendingPlan,
          storeSetAwaitingConfirmation,
          todo
        );

      } else if (mode === 'act') {
        responseText = await handleActMode(
          text, 
          modelId,
          workRulesContext,
          todoListContext,
          todo
        );
      }

      if (cancelAnswerRef.current) {
        toast.info('Ответ прерван');
        return false;
      }
      
      const assistantMessage = createMessage(responseText, 'assistant', isVoice, undefined);
      appendMessageUnique(assistantMessage);

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
        routingLogger.logError(logId, (error as Error), {
          stage: 'vector_storage_assistant',
          messageId: assistantMessage.id
        });
        console.error('Error storing assistant message in vector DB:', JSON.stringify((error as Error), null, 2));
      }

      routingLogger.logApiResponse(logId, 200, 0, responseText.length);

      if (mode === 'act') {
        const allMessages = [...(messages || []), userMessage, assistantMessage];
        const contextData = updateContextUsage(allMessages, workRulesContext, todoListContext);
        const newSavePoint: SavePoint = {
          id: `save_${Date.now()}`,
          timestamp: new Date(),
          contextUsed: contextData.totalTokens,
          messagesCount: allMessages.length,
          description: `Step ${todo.getCompletedCount()}/${todo.getTotalCount()}`,
          data: {
            messages: allMessages,
            currentMode,
            currentWorkspaceMode,
            pendingPlan,
            sidebarCollapsed
          }
        };
        try {
          storeUpdateSavePoints(prev => [...prev, newSavePoint]);
        } catch (e) {
          console.error('Error saving savepoint:', JSON.stringify(e, null, 2));
        }
      }

      if (isVoice) {
        stopListening();
        if (!cancelAnswerRef.current) {
          speak(responseText);
        }
      }

      toast.success(`${mode.toUpperCase()} режим: задача выполнена`);
      return true;

    } catch (error) {
      routingLogger.logError(logId, error as Error, {
        stage: 'message_processing_error',
        mode,
        modelId,
        textLength: text.length
      });
      console.error('Error processing message:', JSON.stringify(error, null, 2));
      if (!(error instanceof ProcessedError)) {
        errorHandler.handleError(error as Error, 'Message processing');
      } else {
        emitAgentError({
          message: 'Ошибка при обработке сообщения',
          source: 'mode-orchestrator',
          scope: 'message-processing',
          error
        });
      }
      return false;
    }
  }, [
    currentModelId,
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
  ]);

  const cancelAnswer = useCallback(() => {
    cancelAnswerRef.current = true;
  }, []);

  return {
    handleSendMessage,
    cancelAnswer
  };
}