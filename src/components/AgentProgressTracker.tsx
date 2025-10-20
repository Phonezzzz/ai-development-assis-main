import { AgentTask } from '@/lib/types';
import { CheckCircle, Clock, Play, XCircle } from '@phosphor-icons/react';

interface AgentProgressTrackerProps {
  tasks: AgentTask[];
  currentTask: AgentTask | null;
  onTaskUpdate: (taskId: string, updates: Partial<AgentTask>) => void;
  className?: string;
}

export function AgentProgressTracker({ tasks, currentTask, onTaskUpdate, className = '' }: AgentProgressTrackerProps) {
  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const getCurrentTaskId = (): string | null => {
    return currentTask ? currentTask.id : null;
  };

  const getStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'in_progress':
        return <Play size={16} className="text-blue-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-gray-500" />;
    }
  };

  const getStatusText = (status: AgentTask['status']) => {
    switch (status) {
      case 'completed':
        return 'Завершено';
      case 'in_progress':
        return 'В процессе';
      case 'failed':
        return 'Ошибка';
      default:
        return 'Ожидание';
    }
  };

  const getPriorityColor = (priority: AgentTask['priority']) => {
    switch (priority) {
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatTime = (minutes?: number) => {
    if (!minutes) return 'Не указано';
    return `${minutes} мин`;
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Прогресс выполнения</h3>
        <div className="text-sm text-muted-foreground">
          {completedTasks}/{totalTasks} задач
        </div>
      </div>

      {/* Прогресс бар */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span>Общий прогресс</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Список задач */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Нет активных задач
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className={`p-3 border rounded-lg ${
                task.id === getCurrentTaskId()
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-border bg-background'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(task.status)}
                    <span className="font-medium text-sm truncate">
                      {task.title}
                    </span>
                  </div>
                  
                  {task.description && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {task.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className={getPriorityColor(task.priority)}>
                      Приоритет: {task.priority === 'high' ? 'Высокий' : 
                                 task.priority === 'medium' ? 'Средний' : 'Низкий'}
                    </span>
                    <span>Время: {formatTime(task.estimatedTime)}</span>
                    <span>{getStatusText(task.status)}</span>
                  </div>

                  {task.result && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                      <strong>Результат:</strong> {task.result}
                    </div>
                  )}

                  {task.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <strong>Ошибка:</strong> {task.error}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1 ml-2">
                  {task.status === 'pending' && (
                    <button
                      onClick={() => onTaskUpdate(task.id, { status: 'in_progress' })}
                      className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                      title="Начать задачу"
                    >
                      <Play size={14} />
                    </button>
                  )}
                  
                  {task.status === 'in_progress' && (
                    <button
                      onClick={() => onTaskUpdate(task.id, { status: 'completed', result: 'Завершено вручную' })}
                      className="p-1 text-green-600 hover:bg-green-100 rounded"
                      title="Завершить задачу"
                    >
                      <CheckCircle size={14} />
                    </button>
                  )}

                  <button
                    onClick={() => onTaskUpdate(task.id, { status: 'failed', error: 'Отменено пользователем' })}
                    className="p-1 text-red-600 hover:bg-red-100 rounded"
                    title="Отменить задачу"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                <span>Создано: {task.createdAt.toLocaleDateString('ru-RU')}</span>
                {task.completedAt && (
                  <span>Завершено: {task.completedAt.toLocaleDateString('ru-RU')}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Статистика */}
      {tasks.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="grid grid-cols-3 gap-4 text-xs text-center">
            <div>
              <div className="font-semibold text-blue-600">{tasks.filter(t => t.status === 'pending').length}</div>
              <div className="text-muted-foreground">Ожидание</div>
            </div>
            <div>
              <div className="font-semibold text-yellow-600">{tasks.filter(t => t.status === 'in_progress').length}</div>
              <div className="text-muted-foreground">В процессе</div>
            </div>
            <div>
              <div className="font-semibold text-green-600">{completedTasks}</div>
              <div className="text-muted-foreground">Завершено</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}