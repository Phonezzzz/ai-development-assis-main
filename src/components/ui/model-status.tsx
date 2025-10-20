import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ModelInfo } from '@/lib/types/models';
import { cn } from '@/lib/utils';
import { 
  Brain, 
  CheckCircle, 
  Warning, 
  XCircle, 
  WifiHigh, 
  WifiSlash, 
  Desktop,
  Globe,
  Lightning
} from '@phosphor-icons/react';

interface ModelStatusProps {
  model: ModelInfo | null;
  isLoading?: boolean;
  error?: string | null;
  isOnline?: boolean;
  compact?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function ModelStatus({ 
  model, 
  isLoading, 
  error, 
  isOnline = true, 
  compact = false, 
  showDetails = true,
  className 
}: ModelStatusProps) {
  const getModelName = (): string => {
    return model?.name || 'Модель не выбрана';
  };

  const isLocalProvider = (): boolean => {
    return model ? model.provider === 'Local' : false;
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'openai': return '🤖';
      case 'anthropic': return '🧠';
      case 'meta': return '📘';
      case 'google': return '🔍';
      case 'mistral ai': return '🌊';
      case 'cohere': return '🔮';
      case 'deepseek': return '🎯';
      case 'qwen': return '🌟';
      case 'perplexity': return '🔎';
      case 'nvidia': return '💚';
      case 'microsoft': return '🪟';
      case 'hugging face': return '🤗';
      case 'local': return '🏠';
      default: return '🔧';
    }
  };

  const getStatusColor = () => {
    if (error) return 'text-red-500 bg-red-500/10 border-red-500/30';
    if (isLoading) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    if (isOnline) return 'text-green-500 bg-green-500/10 border-green-500/30';
    return 'text-gray-500 bg-gray-500/10 border-gray-500/30';
  };

  const getStatusIcon = () => {
    if (error) return <XCircle size={12} className="text-red-500" />;
    if (isLoading) return <Warning size={12} className="text-yellow-500 animate-pulse" />;
    if (isOnline) return <CheckCircle size={12} className="text-green-500" />;
    return <XCircle size={12} className="text-gray-500" />;
  };

  const getStatusText = () => {
    if (error) return 'Ошибка';
    if (isLoading) return 'Загрузка...';
    if (isOnline) return 'Онлайн';
    return 'Офлайн';
  };

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'openai': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'anthropic': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'meta': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'google': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'mistral ai': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'cohere': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'deepseek': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'qwen': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'perplexity': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'nvidia': return 'bg-lime-500/20 text-lime-300 border-lime-500/30';
      case 'microsoft': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'hugging face': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'local': return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const formatContextLength = (length: number): string => {
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${(length / 1000).toFixed(0)}K`;
    return `${length}`;
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {model && (
          <>
            <span className="text-sm">{getProviderIcon(model.provider)}</span>
            <span className="text-sm font-medium">{model.name}</span>
            <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border", getStatusColor())}>
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>
          </>
        )}
        {!model && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Brain size={14} />
            <span className="text-sm">Модель не выбрана</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("p-3 bg-card/50 border-border/50", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Иконка провайдера */}
          {model && (
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted">
              <span className="text-lg">{getProviderIcon(model.provider)}</span>
            </div>
          )}
          
          {/* Информация о модели */}
          <div className="flex flex-col gap-1">
            {model ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{model.name}</span>
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getProviderColor(model.provider))}
                  >
                    {model.provider}
                  </Badge>
                </div>
                
                {showDetails && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Globe size={10} />
                      <span>{formatContextLength(model.contextLength)} контекст</span>
                    </div>
                    
                    {model.free && (
                      <div className="flex items-center gap-1">
                        <Lightning size={10} />
                        <span>Бесплатно</span>
                      </div>
                    )}
                    
                    {model.capabilities.reasoning && (
                      <div className="flex items-center gap-1">
                        <Brain size={10} />
                        <span>Reasoning</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Brain size={14} />
                <span className="text-sm">Модель не выбрана</span>
              </div>
            )}
          </div>
        </div>

        {/* Статус подключения */}
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200", getStatusColor())}>
            {isLocalProvider() ? (
              <>
                <Desktop size={10} />
                <span>{getStatusText()}</span>
              </>
            ) : (
              <>
                {isOnline ? <WifiHigh size={10} /> : <WifiSlash size={10} />}
                <span>{getStatusText()}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Дополнительная информация при ошибке */}
      {error && (
        <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Warning size={10} />
            <span>{error}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// Компонент для компактного отображения статуса в dropdown
export function ModelStatusDropdown({ model, isLoading, error, isOnline }: ModelStatusProps) {
  const getStatusColor = () => {
    if (error) return 'bg-red-500';
    if (isLoading) return 'bg-yellow-500';
    if (isOnline) return 'bg-green-500';
    return 'bg-gray-500';
  };

  const getModelName = (): string => {
    return model?.name || 'Модель не выбрана';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-2 h-2 rounded-full", getStatusColor())} />
      <span className="text-sm font-medium">
        {getModelName()}
      </span>
      {model && (
        <span className="text-xs text-muted-foreground">
          ({model.provider})
        </span>
      )}
    </div>
  );
}