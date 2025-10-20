import { useState, useCallback, useRef, useMemo } from 'react';
import { AgentState, AgentTask, AgentMemory, AgentSession, Message, WorkspaceMode } from '@/lib/types';
import { agentMemoryService } from '@/lib/services/agent-memory';
import { agentEventSystem, AGENT_EVENTS } from '@/lib/services/agent-event-system';
import { vectorService } from '@/lib/services/vector';
import { smartContextService } from '@/lib/services/smart-context';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { toast } from 'sonner';

// Context Document Interface
interface ContextDocument {
  id: string;
  content: string;
  type: 'message' | 'file' | 'plan' | 'code';
  metadata?: Record<string, unknown>;
  similarity?: number;
  timestamp: Date;
}

// Context Analysis Result
interface ContextAnalysis {
  keyTopics: string[];
  suggestedTags: string[];
  contextSummary: string;
  relevantDocuments: ContextDocument[];
  tokenEstimate: number;
}

// Smart Context State
interface SmartContextState {
  isAnalyzing: boolean;
  analysis: ContextAnalysis | null;
  error: string | null;
  lastAnalyzedQuery: string | null;
}

// Combined Agent Hook
export function useAgent() {
  // Agent State
  const [agentState, setAgentStateInternal] = useState<AgentState>('idle');
  const [currentSession, setCurrentSession] = useState<AgentSession | null>(null);
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [memory, setMemory] = useState<AgentMemory[]>([]);
  const [contextUsed, setContextUsed] = useState(0);

  // Добавляем недостающие состояния
  const [isInitialized, setIsInitialized] = useState(false);
  const [tasks, setTasks] = useState<AgentTask[]>([]);

  // Smart Context State
  const [smartContextState, setSmartContextState] = useState<SmartContextState>({
    isAnalyzing: false,
    analysis: null,
    error: null,
    lastAnalyzedQuery: null
  });

  // Context Tracker Integration
  const { 
    updateContextUsage, 
    checkContextLimit, 
    getContextBreakdown,
    estimateTokens: estimateTokensFromTracker 
  } = useContextTracker();

  const sessionRef = useRef<string | null>(null);

  // Константы для лимитов контекста агента
  const AGENT_CONTEXT_LIMITS = {
    DEFAULT: 12000,
    PLANNING: 8000,
    EXECUTION: 16000,
    MEMORY: 4000
  };

  // Получение лимита контекста для режима
  const getContextLimitForMode = useCallback((mode: WorkspaceMode): number => {
    switch (mode) {
      case 'plan':
        return AGENT_CONTEXT_LIMITS.PLANNING;
      case 'act':
        return AGENT_CONTEXT_LIMITS.EXECUTION;
      case 'ask':
      default:
        return AGENT_CONTEXT_LIMITS.DEFAULT;
    }
  }, []);

  // Обновление использования контекста для агента
  const updateAgentContextUsage = useCallback((
    messages: Message[],
    workRulesText: string = '',
    todoContext: string = '',
    modelInstructions: string = '',
    selectedFiles: string[] = [],
    fileContents: Record<string, string> = {}
  ) => {
    return updateContextUsage(
      messages,
      workRulesText,
      todoContext,
      modelInstructions,
      selectedFiles,
      fileContents
    );
  }, [updateContextUsage]);

  // Проверка лимита контекста для агента
  const checkAgentContextLimit = useCallback((mode: WorkspaceMode = 'ask') => {
    const limit = getContextLimitForMode(mode);
    return checkContextLimit(limit);
  }, [checkContextLimit, getContextLimitForMode]);

  // Smart Context Functions
  const analyzeContext = useCallback(async (query: string, mode: WorkspaceMode = 'ask') => {
    if (!query.trim()) return null;

    setSmartContextState(prev => ({
      ...prev,
      isAnalyzing: true,
      error: null,
      lastAnalyzedQuery: query
    }));

    try {
      // Search for relevant context
      const searchResults = await vectorService.search(query, {
        limit: 10,
        filter: {
          sessionId: sessionRef.current || undefined
        }
      });

      // Convert search results to context documents
      const documents: ContextDocument[] = searchResults.map(doc => {
        if (!doc.metadata || !doc.metadata.type) {
          throw new Error(`Document ${doc.id} missing type in metadata`);
        }
        if (!doc.metadata.timestamp) {
          throw new Error(`Document ${doc.id} missing timestamp in metadata`);
        }

        const validTypes = ['message', 'file', 'plan', 'code'] as const;
        const docType = doc.metadata.type as string;
        if (!(validTypes as readonly string[]).includes(docType)) {
          throw new Error(`Document ${doc.id} has invalid type: ${docType}`);
        }

        return {
          id: doc.id,
          content: doc.content,
          type: docType as 'message' | 'file' | 'plan' | 'code',
          metadata: doc.metadata,
          similarity: doc.similarity,
          timestamp: new Date(String(doc.metadata.timestamp))
        };
      });

      // Analyze context using smart context service
      const contextResult = await smartContextService.findRelevantContext(query, mode);

      // Извлекаем ключевые темы из результатов
      const allTexts = contextResult.map(r => r.text).join(' ');
      const words = allTexts.toLowerCase().match(/\b\w{4,}\b/g) || [];
      const wordFreq: Record<string, number> = {};
      words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
      const keyTopics = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

      const contextSummary = `Найдено ${contextResult.length} релевантных фрагментов`;
      const tokenEstimate = estimateTokens(documents);

      const analysis: ContextAnalysis = {
        keyTopics,
        suggestedTags: [],
        contextSummary,
        relevantDocuments: documents,
        tokenEstimate
      };

      setSmartContextState(prev => ({
        ...prev,
        isAnalyzing: false,
        analysis,
        error: null
      }));

      return analysis;

    } catch (error) {
      console.error('Error analyzing context:', JSON.stringify(error, null, 2));
      
      setSmartContextState(prev => ({
        ...prev,
        isAnalyzing: false,
        error: error instanceof Error ? error.message : 'Ошибка анализа контекста',
        analysis: null
      }));

      return null;
    }
  }, []);

  // Функция для оптимизации контекста агента
  const optimizeAgentContext = useCallback(async (query: string, mode: WorkspaceMode = 'ask') => {
    const contextLimit = getContextLimitForMode(mode);
    const currentUsage = getContextBreakdown();
    
    if (currentUsage.total > contextLimit * 0.8) {
      // Контекст приближается к лимиту - выполняем оптимизацию
      const analysis = await analyzeContext(query, mode);
      
      if (analysis) {
        // Приоритизируем документы по релевантности
        const prioritizedDocs = analysis.relevantDocuments
          .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
          .slice(0, Math.max(5, Math.floor(analysis.relevantDocuments.length * 0.6)));
        
        return {
          optimized: true,
          documents: prioritizedDocs,
          tokensSaved: analysis.tokenEstimate - estimateTokensFromTracker(prioritizedDocs.map(d => d.content).join(' ')),
          contextSummary: analysis.contextSummary
        };
      }
    }
    
    return {
      optimized: false,
      documents: [],
      tokensSaved: 0,
      contextSummary: 'Контекст в пределах нормы'
    };
  }, [analyzeContext, getContextBreakdown, estimateTokensFromTracker, getContextLimitForMode]);

  // Agent Functions
  const createSession = useCallback(async (name: string, description?: string) => {
    const sessionId = `session_${Date.now()}`;
    sessionRef.current = sessionId;

    const session: AgentSession = {
      id: sessionId,
      name,
      description,
      state: 'idle',
      tasks: [],
      memory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      contextWindow: 8192,
      contextUsed: 0
    };

    setCurrentSession(session);
    setTasks([]); // Инициализируем пустой массив задач
    setAgentStateInternal('idle');
    setIsInitialized(true); // Устанавливаем флаг инициализации
    
    agentEventSystem.emit(AGENT_EVENTS.SESSION_CREATED, { session });
    
    return session;
  }, []);

  const updateAgentState = useCallback((newState: AgentState, reason?: string) => {
    const previousState = agentState;
    setAgentStateInternal(newState);
    
    agentEventSystem.emit(AGENT_EVENTS.STATE_CHANGED, {
      previousState,
      currentState: newState,
      reason,
      timestamp: new Date(),
      sessionId: sessionRef.current
    });
  }, [agentState]);

  // setAgentState для совместимости с WorkspaceAgentMode.tsx
  const setAgentState = useCallback((newState: AgentState) => {
    updateAgentState(newState);
  }, [updateAgentState]);

  const addTask = useCallback(async (task: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId'>) => {
    if (!currentSession) {
      throw new Error('No active session');
    }

    const newTask: AgentTask = {
      ...task,
      id: `task_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionId: currentSession.id
    };

    setCurrentTask(newTask);
    setTasks(prev => [...prev, newTask]); // Обновляем состояние tasks
    setCurrentSession(prev => prev ? {
      ...prev,
      tasks: [...prev.tasks, newTask],
      currentTask: newTask,
      updatedAt: new Date()
    } : null);

    updateAgentState('planning');
    
    agentEventSystem.emit(AGENT_EVENTS.TASK_STARTED, { task: newTask });
    
    return newTask;
  }, [currentSession, updateAgentState]);

  const completeTask = useCallback(async (taskId: string, result?: string) => {
    if (!currentTask || currentTask.id !== taskId) {
      return;
    }

    const completedTask: AgentTask = {
      ...currentTask,
      status: 'completed',
      result,
      completedAt: new Date(),
      updatedAt: new Date(),
      actualTime: currentTask.actualTime || 0
    };

    setCurrentTask(null);
    setTasks(prev => prev.map(t => t.id === taskId ? completedTask : t)); // Обновляем состояние tasks
    setCurrentSession(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? completedTask : t),
      currentTask: undefined,
      updatedAt: new Date()
    } : null);

    updateAgentState('idle');
    
    agentEventSystem.emit(AGENT_EVENTS.TASK_COMPLETED, { task: completedTask });
    
    return completedTask;
  }, [currentTask, updateAgentState]);

  // startTask - аналог addTask для совместимости с WorkspaceAgentMode
  const startTask = useCallback(async (taskData: Omit<AgentTask, 'id' | 'createdAt' | 'updatedAt' | 'sessionId' | 'status'>) => {
    return addTask({
      ...taskData,
      status: 'in_progress' as const
    });
  }, [addTask]);

  // updateTask - обновление существующей задачи
  const updateTask = useCallback(async (taskId: string, updates: Partial<AgentTask>) => {
    if (!currentSession) {
      throw new Error('No active session');
    }

    setCurrentSession(prev => {
      if (!prev) return prev;
      
      const updatedTasks = prev.tasks.map(task => 
        task.id === taskId 
          ? { ...task, ...updates, updatedAt: new Date() }
          : task
      );

      // Если обновляется текущая задача, обновляем и её
      if (currentTask && currentTask.id === taskId) {
        setCurrentTask({ ...currentTask, ...updates, updatedAt: new Date() });
      }

      return {
        ...prev,
        tasks: updatedTasks,
        updatedAt: new Date()
      };
    });

    // Эмитируем событие обновления задачи
    agentEventSystem.emit(AGENT_EVENTS.TASK_UPDATED, { 
      taskId, 
      updates,
      timestamp: new Date(),
      sessionId: sessionRef.current
    });
  }, [currentSession, currentTask]);

  // failTask - отметка задачи как неудачной
  const failTask = useCallback(async (taskId: string, error?: string) => {
    if (!currentTask || currentTask.id !== taskId) {
      return;
    }

    const failedTask: AgentTask = {
      ...currentTask,
      status: 'failed',
      error,
      updatedAt: new Date(),
      actualTime: currentTask.actualTime || 0
    };

    setCurrentTask(null);
    setCurrentSession(prev => prev ? {
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? failedTask : t),
      currentTask: undefined,
      updatedAt: new Date()
    } : null);

    updateAgentState('error', `Task failed: ${error}`);
    
    agentEventSystem.emit(AGENT_EVENTS.TASK_FAILED, { task: failedTask });
    
    return failedTask;
  }, [currentTask, updateAgentState]);

  // clearSessionMemory - очистка памяти сессии
  const clearSessionMemory = useCallback(async () => {
    if (!sessionRef.current) {
      throw new Error('No active session');
    }

    try {
      // Очищаем память в сервисе
      await agentMemoryService.clearSession(sessionRef.current);
      
      // Очищаем локальное состояние
      setMemory([]);
      setContextUsed(0);
      
      // Сбрасываем состояние агента
      setAgentStateInternal('idle');
      setCurrentTask(null);
      
      agentEventSystem.emit(AGENT_EVENTS.SESSION_CLEARED, { 
        sessionId: sessionRef.current 
      });
      
    } catch (error) {
      console.error('Error clearing session memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }, []);

  // Добавляем вычисляемые свойства
  const hasActiveTask = useCallback(() => {
    return currentTask !== null && currentTask.status === 'in_progress';
  }, [currentTask]);

  const progress = useCallback(() => {
    if (!currentSession || currentSession.tasks.length === 0) return 0;
    
    const completedTasks = currentSession.tasks.filter(task => task.status === 'completed').length;
    return (completedTasks / currentSession.tasks.length) * 100;
  }, [currentSession]);

  const addMemory = useCallback(async (memory: Omit<AgentMemory, 'id' | 'timestamp' | 'sessionId'>) => {
    if (!sessionRef.current) {
      throw new Error('No active session');
    }

    const newMemory: AgentMemory = {
      ...memory,
      id: `memory_${Date.now()}`,
      timestamp: new Date(),
      sessionId: sessionRef.current
    };

    // Store in memory service - используем правильный метод addMemory
    await agentMemoryService.addMemory(newMemory);
    
    setMemory(prev => [...prev, newMemory]);
    
    agentEventSystem.emit(AGENT_EVENTS.MEMORY_ADDED, { memory: newMemory });
    
    return newMemory;
  }, []);

  const addMessageToContext = useCallback(async (message: Message) => {
    if (!sessionRef.current) return;

    try {
      // Store message in vector database for context
      await vectorService.addDocument({
        id: message.id,
        content: message.content,
        metadata: {
          type: 'message',
          messageType: message.type,
          workspaceMode: message.workspaceMode,
          timestamp: message.timestamp.toISOString(),
          sessionId: sessionRef.current,
          isVoice: message.isVoice || false
        }
      });

      // Update context usage with context tracker
      const tokenEstimate = estimateTokensFromTracker(message.content);
      setContextUsed(prev => prev + tokenEstimate);

    } catch (error) {
      console.error('Error adding message to context:', JSON.stringify(error, null, 2));
    }
  }, [estimateTokensFromTracker]);

  const clearContextAnalysis = useCallback(() => {
    setSmartContextState({
      isAnalyzing: false,
      analysis: null,
      error: null,
      lastAnalyzedQuery: null
    });
  }, []);

  const getRelevantContext = useCallback(async (query: string, limit: number = 5) => {
    try {
      const results = await vectorService.search(query, {
        limit,
        filter: {
          sessionId: sessionRef.current || undefined
        }
      });

      return results.map(doc => {
        if (!doc.metadata || !doc.metadata.type) {
          throw new Error(`Document ${doc.id} missing type in metadata`);
        }
        if (!doc.metadata.timestamp) {
          throw new Error(`Document ${doc.id} missing timestamp in metadata`);
        }

        return {
          id: doc.id,
          content: doc.content,
          type: doc.metadata.type as string,
          metadata: doc.metadata,
          similarity: doc.similarity,
          timestamp: new Date(String(doc.metadata.timestamp))
        };
      });

    } catch (error) {
      console.error('Error getting relevant context:', JSON.stringify(error, null, 2));
      return [];
    }
  }, []);

  // Helper Functions
  const generateContextSummary = (documents: ContextDocument[], keyTopics: string[]): string => {
    if (documents.length === 0) return 'Нет доступного контекста';

    const typeCounts = documents.reduce((acc, doc) => {
      acc[doc.type] = (acc[doc.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const parts: string[] = [];
    if (typeCounts.message) parts.push(`${typeCounts.message} сообщений`);
    if (typeCounts.file) parts.push(`${typeCounts.file} файлов`);
    if (typeCounts.plan) parts.push(`${typeCounts.plan} планов`);
    if (typeCounts.code) parts.push(`${typeCounts.code} блоков кода`);

    let summary = parts.join(', ');
    
    if (keyTopics.length > 0) {
      summary += `. Ключевые темы: ${keyTopics.slice(0, 3).join(', ')}`;
    }

    return summary;
  };

  const estimateTokens = (documents: ContextDocument[]): number => {
    return documents.reduce((total, doc) => {
      return total + Math.ceil(doc.content.length / 4);
    }, 0);
  };

  const getMemoryStats = useCallback(async () => {
    if (!sessionRef.current) {
      return {
        totalMemories: 0,
        memoryByType: {},
        oldestMemory: undefined,
        newestMemory: undefined
      };
    }

    try {
      return await agentMemoryService.getMemoryStats(sessionRef.current);
    } catch (error) {
      console.error('Error getting memory stats:', JSON.stringify(error, null, 2));
      return {
        totalMemories: 0,
        memoryByType: {},
        oldestMemory: undefined,
        newestMemory: undefined
      };
    }
  }, []);

  return useMemo(() => ({
    // Agent State
    agentState,
    currentSession,
    currentTask,
    memory,
    contextUsed,
    
    // Добавляем недостающие состояния
    tasks,
    isInitialized,
    progress: progress(),
    hasActiveTask: hasActiveTask(),

    // Agent Actions
    createSession,
    updateAgentState,
    setAgentState,
    addTask,
    startTask,
    updateTask,
    completeTask,
    failTask,
    addMemory,
    addMessageToContext,
    clearSessionMemory,
    getMemoryStats, // Добавляем недостающий метод

    // Smart Context
    smartContext: smartContextState,
    analyzeContext,
    clearContextAnalysis,
    getRelevantContext,

    // Context Tracker Integration
    optimizeAgentContext,
    updateAgentContextUsage,
    checkAgentContextLimit,
    getContextLimitForMode
  }), [
    // Зависимости для стабильности возвращаемого объекта
    agentState,
    currentSession,
    currentTask,
    memory,
    contextUsed,
    tasks,
    isInitialized,
    progress,
    hasActiveTask,
    smartContextState,
    createSession,
    updateAgentState,
    setAgentState,
    addTask,
    startTask,
    updateTask,
    completeTask,
    failTask,
    addMemory,
    addMessageToContext,
    clearSessionMemory,
    getMemoryStats,
    analyzeContext,
    clearContextAnalysis,
    getRelevantContext,
    optimizeAgentContext,
    updateAgentContextUsage,
    checkAgentContextLimit,
    getContextLimitForMode
  ]);
}
