import { AgentState } from '@/lib/types';
import { Clock, Play, Pause, CheckCircle, XCircle } from '@phosphor-icons/react';

interface AgentStateMonitorProps {
  state: AgentState;
  className?: string;
}

export function AgentStateMonitor({ state, className = '' }: AgentStateMonitorProps) {
  const getStateConfig = (state: AgentState) => {
    switch (state) {
      case 'idle':
        return {
          icon: <Clock size={20} className="text-gray-500" />,
          label: 'Ожидание',
          description: 'Агент готов к работе',
          color: 'bg-gray-100 border-gray-300 text-gray-700'
        };
      case 'planning':
        return {
          icon: <Play size={20} className="text-blue-500" />,
          label: 'Планирование',
          description: 'Составление плана действий',
          color: 'bg-blue-100 border-blue-300 text-blue-700'
        };
      case 'executing':
        return {
          icon: <Play size={20} className="text-green-500 animate-pulse" />,
          label: 'Выполнение',
          description: 'Выполнение задачи',
          color: 'bg-green-100 border-green-300 text-green-700'
        };
      case 'waiting':
        return {
          icon: <Pause size={20} className="text-yellow-500" />,
          label: 'Ожидание',
          description: 'Ожидание внешних данных',
          color: 'bg-yellow-100 border-yellow-300 text-yellow-700'
        };
      case 'error':
        return {
          icon: <XCircle size={20} className="text-red-500" />,
          label: 'Ошибка',
          description: 'Произошла ошибка',
          color: 'bg-red-100 border-red-300 text-red-700'
        };
      default:
        return {
          icon: <Clock size={20} className="text-gray-500" />,
          label: 'Неизвестно',
          description: 'Состояние не определено',
          color: 'bg-gray-100 border-gray-300 text-gray-700'
        };
    }
  };

  const config = getStateConfig(state);

  return (
    <div className={`border rounded-lg p-4 ${config.color} ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{config.label}</div>
          <div className="text-xs opacity-80">{config.description}</div>
        </div>
      </div>
    </div>
  );
}