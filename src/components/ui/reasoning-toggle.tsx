import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { modelManager } from '@/lib/services/model-manager';
import { ReasoningConfig } from '@/lib/types/models';
import { Brain, AlertCircle } from 'lucide-react';

interface ReasoningToggleProps {
  modelId?: string;
  onToggle?: (enabled: boolean) => void;
  className?: string;
}

export function ReasoningToggle({ modelId, onToggle, className = '' }: ReasoningToggleProps) {
  const [reasoningConfig, setReasoningConfig] = useState<ReasoningConfig>({
    enabled: false,
    modelId: '',
    showThinkingProcess: true,
    thinkingProcessStyle: 'expanded'
  });
  const [supportsReasoning, setSupportsReasoning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReasoningConfig();
    checkReasoningSupport();
    
    // Подписываемся на события менеджера моделей
    const unsubscribe = modelManager.on('reasoning_toggled', () => {
      loadReasoningConfig();
    });
    
    const unsubscribeModels = modelManager.on('models_loaded', () => {
      checkReasoningSupport();
    });

    return () => {
      modelManager.off(unsubscribe);
      modelManager.off(unsubscribeModels);
    };
  }, [modelId]);

  const loadReasoningConfig = () => {
    const config = modelManager.getReasoningConfig();
    setReasoningConfig(config);
  };

  const checkReasoningSupport = () => {
    const supported = modelManager.supportsReasoning(modelId);
    setSupportsReasoning(supported);
    
    if (!supported && reasoningConfig.enabled) {
      // Автоматически отключаем reasoning если модель не поддерживает
      modelManager.setReasoningEnabled(false, modelId);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const result = modelManager.setReasoningEnabled(enabled, modelId);
      
      if (result.success) {
        loadReasoningConfig();
        onToggle?.(enabled);
        
        // Показываем уведомление
        if (enabled) {
          console.log('✅ Reasoning режим включен');
        } else {
          console.log('❌ Reasoning режим выключен');
        }
      } else {
        setError(result.error || 'Ошибка переключения reasoning режима');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStyleChange = (style: 'expanded' | 'collapsed' | 'hidden') => {
    modelManager.setReasoningDisplayStyle(style);
    loadReasoningConfig();
  };

  if (!supportsReasoning) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-2 opacity-50 ${className}`}>
              <Brain className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Reasoning</span>
              <Badge variant="outline" className="text-xs">
                Не поддерживается
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Эта модель не поддерживает chain-of-thought reasoning</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex items-center gap-2">
          <Brain className={`h-4 w-4 ${reasoningConfig.enabled ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className="text-sm font-medium">Reasoning</span>
          {reasoningConfig.enabled && (
            <Badge variant="default" className="text-xs bg-blue-500">
              Включен
            </Badge>
          )}
        </div>

        <Switch
          checked={reasoningConfig.enabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
          aria-label="Переключить reasoning режим"
        />

        {error && (
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle className="h-4 w-4 text-red-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm text-red-600">{error}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {reasoningConfig.enabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Стиль:</span>
            <select
              value={reasoningConfig.thinkingProcessStyle}
              onChange={(e) => handleStyleChange(e.target.value as 'expanded' | 'collapsed' | 'hidden')}
              className="text-xs border rounded px-1 py-0.5"
            >
              <option value="expanded">Развернутый</option>
              <option value="collapsed">Свернутый</option>
              <option value="hidden">Скрытый</option>
            </select>
          </div>
        )}

        {isLoading && (
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        )}
      </div>
    </TooltipProvider>
  );
}

// Компонент для отображения процесса мышления
export function ThinkingProcess({ 
  thinking, 
  style = 'expanded',
  className = '' 
}: { 
  thinking: string; 
  style?: 'expanded' | 'collapsed' | 'hidden';
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(style === 'expanded');

  if (style === 'hidden' || !thinking) {
    return null;
  }

  return (
    <div className={`border-l-4 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 p-4 mb-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Процесс мышления
          </span>
        </div>
        {style === 'collapsed' && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
          >
            {isExpanded ? 'Скрыть' : 'Показать'}
          </button>
        )}
      </div>
      
      {(isExpanded || style === 'expanded') && (
        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-blue-100 dark:bg-blue-900 p-3 rounded">
          {thinking}
        </div>
      )}
    </div>
  );
}

// Хук для использования reasoning в компонентах
export function useReasoning(modelId?: string) {
  const [reasoningConfig, setReasoningConfig] = useState<ReasoningConfig>({
    enabled: false,
    modelId: '',
    showThinkingProcess: true,
    thinkingProcessStyle: 'expanded'
  });
  const [supportsReasoning, setSupportsReasoning] = useState(false);

  useEffect(() => {
    const updateConfig = () => {
      const config = modelManager.getReasoningConfig();
      setReasoningConfig(config);
      setSupportsReasoning(modelManager.supportsReasoning(modelId));
    };

    updateConfig();
    
    const unsubscribe = modelManager.on('reasoning_toggled', updateConfig);
    const unsubscribeModels = modelManager.on('models_loaded', updateConfig);

    return () => {
      modelManager.off(unsubscribe);
      modelManager.off(unsubscribeModels);
    };
  }, [modelId]);

  const toggleReasoning = (enabled?: boolean) => {
    const newEnabled = enabled !== undefined ? enabled : !reasoningConfig.enabled;
    return modelManager.setReasoningEnabled(newEnabled, modelId);
  };

  const setDisplayStyle = (style: 'expanded' | 'collapsed' | 'hidden') => {
    modelManager.setReasoningDisplayStyle(style);
  };

  return {
    reasoningConfig,
    supportsReasoning,
    toggleReasoning,
    setDisplayStyle,
    isReasoningEnabled: reasoningConfig.enabled && reasoningConfig.modelId === modelId
  };
}