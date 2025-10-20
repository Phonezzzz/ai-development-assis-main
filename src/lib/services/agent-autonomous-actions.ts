import { AgentTask, AgentState, AgentMemory } from '@/lib/types';
import { agentEventSystem, AGENT_EVENTS } from './agent-event-system';
import { agentMemoryService } from './agent-memory';
import { vectorService } from './vector';
import { fileSystemService } from './file-system-service';

export interface AutonomousAction {
  id: string;
  type: 'file_operation' | 'code_execution' | 'api_call' | 'user_interaction';
  description: string;
  payload: unknown;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

class AgentAutonomousActions {
  private currentActions: Map<string, AutonomousAction> = new Map();

  // Инициировать автономное действие
  async initiateAction(
    task: AgentTask,
    actionType: AutonomousAction['type'],
    description: string,
    payload: Record<string, unknown>
  ): Promise<AutonomousAction> {
    const payloadWithTask: Record<string, unknown> = {
      taskId: task.id,
      ...(payload as Record<string, unknown>),
    };

    const action: AutonomousAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: actionType,
      description,
      payload: payloadWithTask as Record<string, unknown>,
      status: 'pending',
      createdAt: new Date()
    };

    this.currentActions.set(action.id, action);
    
    // Сохраняем в память
    await agentMemoryService.addMemory({
      context: `Инициировано автономное действие: ${description}`,
      type: 'action',
      importance: 5,
      metadata: {
        actionId: action.id,
        taskId: task.id,
        actionType,
        description,
        payload: payloadWithTask
      },
      sessionId: task.sessionId || 'default',
      timestamp: new Date()
    });

    agentEventSystem.emit(AGENT_EVENTS.AUTONOMOUS_ACTION_STARTED, action);
    
    return action;
  }

  // Выполнить файловую операцию
  async executeFileOperation(
    task: AgentTask,
    operation: 'read' | 'write' | 'create' | 'delete' | 'list',
    filePath: string,
    content?: string
  ): Promise<AutonomousAction> {
    const action = await this.initiateAction(
      task,
      'file_operation',
      `Файловая операция: ${operation} ${filePath}`,
      { operation, filePath, content }
    );

    try {
      action.status = 'executing';
      this.currentActions.set(action.id, action);

      // Реальные файловые операции через файловый сервис
      let result;
      switch (operation) {
        case 'read':
          result = await fileSystemService.readFile(filePath);
          break;
        case 'write':
          if (!content) {
            throw new Error('Для операции записи требуется содержимое файла');
          }
          result = await fileSystemService.writeFile(filePath, content);
          break;
        case 'create':
          if (!content) {
            throw new Error('Для операции создания требуется содержимое файла');
          }
          result = await fileSystemService.createFile(filePath, content);
          break;
        case 'delete':
          result = await fileSystemService.deleteFile(filePath);
          break;
        case 'list':
          result = await fileSystemService.listFiles(filePath);
          break;
      }

      action.status = 'completed';
      action.result = result as Record<string, unknown>;
      action.completedAt = new Date();
      this.currentActions.set(action.id, action);

      // Сохраняем результат в память
      await agentMemoryService.addMemory({
        context: `Автономное действие завершено: ${action.description}`,
        type: 'observation',
        importance: 4,
        metadata: {
          actionId: action.id,
          taskId: task.id,
          result,
          operation,
          filePath
        },
        sessionId: task.sessionId || 'default',
        timestamp: new Date()
      });

      agentEventSystem.emit(AGENT_EVENTS.AUTONOMOUS_ACTION_COMPLETED, action);
      
    } catch (error) {
      action.status = 'failed';
      action.error = error instanceof Error ? error.message : 'Unknown error';
      action.completedAt = new Date();
      this.currentActions.set(action.id, action);

      // Сохраняем ошибку в память
      await agentMemoryService.addMemory({
        context: `Ошибка автономного действия: ${action.description}`,
        type: 'observation',
        importance: 5,
        metadata: {
          actionId: action.id,
          taskId: task.id,
          error: action.error,
          operation,
          filePath
        },
        sessionId: task.sessionId || 'default',
        timestamp: new Date()
      });

      agentEventSystem.emit(AGENT_EVENTS.AUTONOMOUS_ACTION_FAILED, action);
    }

    return action;
  }

  // Выполнить выполнение кода
  async executeCode(
    task: AgentTask,
    code: string,
    language: string = 'javascript'
  ): Promise<AutonomousAction> {
    const action = await this.initiateAction(
      task,
      'code_execution',
      `Выполнение кода на ${language}`,
      { code, language }
    );

    try {
      action.status = 'executing';
      this.currentActions.set(action.id, action);

      // Симуляция выполнения кода
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // В реальной реализации здесь будет вызов API для выполнения кода
      const result = {
        output: 'Код выполнен успешно',
        executionTime: 1000,
        success: true
      };

      action.status = 'completed';
      action.result = result as Record<string, unknown>;
      action.completedAt = new Date();
      this.currentActions.set(action.id, action);

      await agentMemoryService.addMemory({
        context: `Код выполнен: ${action.description}`,
        type: 'observation',
        importance: 4,
        metadata: {
          actionId: action.id,
          taskId: task.id,
          result,
          language
        },
        sessionId: task.sessionId || 'default',
        timestamp: new Date()
      });

      agentEventSystem.emit(AGENT_EVENTS.AUTONOMOUS_ACTION_COMPLETED, action);
      
    } catch (error) {
      action.status = 'failed';
      action.error = error instanceof Error ? error.message : 'Unknown error';
      action.completedAt = new Date();
      this.currentActions.set(action.id, action);

      await agentMemoryService.addMemory({
        context: `Ошибка выполнения кода: ${action.description}`,
        type: 'observation',
        importance: 5,
        metadata: {
          actionId: action.id,
          taskId: task.id,
          error: action.error,
          language
        },
        sessionId: task.sessionId || 'default',
        timestamp: new Date()
      });

      agentEventSystem.emit(AGENT_EVENTS.AUTONOMOUS_ACTION_FAILED, action);
    }

    return action;
  }

  // Получить текущие активные действия
  getActiveActions(): AutonomousAction[] {
    return Array.from(this.currentActions.values()).filter(
      action => action.status === 'pending' || action.status === 'executing'
    );
  }

  // Получить историю действий
  getActionHistory(): AutonomousAction[] {
    return Array.from(this.currentActions.values()).filter(
      action => action.status === 'completed' || action.status === 'failed'
    );
  }

  // Очистить завершенные действия
  clearCompletedActions(): void {
    for (const [id, action] of this.currentActions) {
      if (action.status === 'completed' || action.status === 'failed') {
        this.currentActions.delete(id);
      }
    }
  }

  // Получить действие по ID
  getAction(actionId: string): AutonomousAction | undefined {
    return this.currentActions.get(actionId);
  }

  clearActionsByTask(taskId: string): void {
    for (const [id, action] of this.currentActions) {
      if (action.payload && typeof action.payload === 'object' && action.payload !== null
        && 'taskId' in action.payload && (action.payload as { taskId?: string }).taskId === taskId) {
        this.currentActions.delete(id);
      }
    }
  }

  clearAction(actionId: string): void {
    this.currentActions.delete(actionId);
  }
}

export const agentAutonomousActions = new AgentAutonomousActions();