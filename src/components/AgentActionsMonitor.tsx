import { useState, useEffect } from 'react';
import { agentEventSystem, AGENT_EVENTS } from '@/lib/services/agent-event-system';
import { agentAutonomousActions, AutonomousAction } from '@/lib/services/agent-autonomous-actions';
import { Play, CheckCircle, XCircle, Clock, File, Code, Globe, User } from '@phosphor-icons/react';

interface AgentActionsMonitorProps {
  className?: string;
}

export function AgentActionsMonitor({ className = '' }: AgentActionsMonitorProps) {
  const [activeActions, setActiveActions] = useState<AutonomousAction[]>([]);
  const [actionHistory, setActionHistory] = useState<AutonomousAction[]>([]);

  useEffect(() => {
    // Загружаем начальные данные
    setActiveActions(agentAutonomousActions.getActiveActions());
    setActionHistory(agentAutonomousActions.getActionHistory());

    // Подписываемся на события
    const handleActionStarted = (action: AutonomousAction) => {
      setActiveActions(prev => [...prev, action]);
    };

    const handleActionCompleted = (action: AutonomousAction) => {
      setActiveActions(prev => prev.filter(a => a.id !== action.id));
      setActionHistory(prev => [action, ...prev.slice(0, 9)]); // Сохраняем последние 10 действий
    };

    const handleActionFailed = (action: AutonomousAction) => {
      setActiveActions(prev => prev.filter(a => a.id !== action.id));
      setActionHistory(prev => [action, ...prev.slice(0, 9)]);
    };

    agentEventSystem.on(AGENT_EVENTS.AUTONOMOUS_ACTION_STARTED, handleActionStarted);
    agentEventSystem.on(AGENT_EVENTS.AUTONOMOUS_ACTION_COMPLETED, handleActionCompleted);
    agentEventSystem.on(AGENT_EVENTS.AUTONOMOUS_ACTION_FAILED, handleActionFailed);

    return () => {
      agentEventSystem.off(AGENT_EVENTS.AUTONOMOUS_ACTION_STARTED, handleActionStarted);
      agentEventSystem.off(AGENT_EVENTS.AUTONOMOUS_ACTION_COMPLETED, handleActionCompleted);
      agentEventSystem.off(AGENT_EVENTS.AUTONOMOUS_ACTION_FAILED, handleActionFailed);
    };
  }, []);

  const getActionIcon = (type: AutonomousAction['type']) => {
    switch (type) {
      case 'file_operation':
        return <File size={16} className="text-blue-500" />;
      case 'code_execution':
        return <Code size={16} className="text-green-500" />;
      case 'api_call':
        return <Globe size={16} className="text-purple-500" />;
      case 'user_interaction':
        return <User size={16} className="text-orange-500" />;
      default:
        return <Play size={16} className="text-gray-500" />;
    }
  };

  const getStatusIcon = (status: AutonomousAction['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      case 'executing':
        return <Play size={16} className="text-blue-500 animate-pulse" />;
      case 'pending':
        return <Clock size={16} className="text-yellow-500" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  const getStatusText = (status: AutonomousAction['status']) => {
    switch (status) {
      case 'completed':
        return 'Завершено';
      case 'failed':
        return 'Ошибка';
      case 'executing':
        return 'Выполняется';
      case 'pending':
        return 'Ожидание';
      default:
        return 'Неизвестно';
    }
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Автономные действия</h3>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>Активные: {activeActions.length}</span>
          <span>История: {actionHistory.length}</span>
        </div>
      </div>

      {/* Активные действия */}
      {activeActions.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium mb-2 text-blue-600">Активные действия</h4>
          <div className="space-y-2">
            {activeActions.map((action) => (
              <div
                key={action.id}
                className="p-3 border border-blue-200 bg-blue-50 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getActionIcon(action.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{action.description}</span>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(action.status)}
                        <span className="text-xs text-blue-600">
                          {getStatusText(action.status)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Создано: {formatTimestamp(action.createdAt)}
                    </div>
                    {action.payload ? (
                      <div className="mt-1 text-xs text-gray-600">
                        <pre className="whitespace-pre-wrap break-words">
                          {String(JSON.stringify(action.payload, null, 2))}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* История действий */}
      {actionHistory.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 text-gray-600">История действий</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {actionHistory.map((action) => (
              <div
                key={action.id}
                className={`p-2 border rounded-lg text-xs ${
                  action.status === 'completed'
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getActionIcon(action.type)}
                    <span className="font-medium truncate flex-1">
                      {action.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(action.status)}
                    <span className={action.status === 'completed' ? 'text-green-600' : 'text-red-600'}>
                      {getStatusText(action.status)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-1 text-muted-foreground">
                  <span>{formatTimestamp(action.createdAt)}</span>
                  {action.completedAt && (
                    <span>Завершено: {formatTimestamp(action.completedAt)}</span>
                  )}
                </div>
                {action.error && (
                  <div className="mt-1 text-red-600">
                    <strong>Ошибка:</strong> {action.error}
                  </div>
                )}
                {action.result && action.status === 'completed' ? (
                  <div className="mt-1 text-green-700">
                    <pre className="whitespace-pre-wrap break-words">
                      {String(JSON.stringify(action.result, null, 2))}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Сообщение об отсутствии действий */}
      {activeActions.length === 0 && actionHistory.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Нет активных или завершенных действий
        </div>
      )}

      {/* Кнопка очистки истории */}
      {actionHistory.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <button
            onClick={() => {
              agentAutonomousActions.clearCompletedActions();
              setActionHistory([]);
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Очистить историю действий
          </button>
        </div>
      )}
    </div>
  );
}