import { useState, useCallback, useEffect } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { ModelOption } from '@/lib/types';
import { modelManager } from '@/lib/services/model-manager';
import { ModelInfo, ReasoningConfig } from '@/lib/types/models';
import { toast } from 'sonner';

export function useModelSelection(scope: 'chat' | 'workspace' = 'chat') {
  const [selectedModel, setSelectedModel] = useKV<string>(`selected-model:${scope}`, '');
  const [isSelecting, setIsSelecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Reasoning конфигурация теперь управляется через ModelManager
  const [reasoningConfig, setReasoningConfig] = useState<ReasoningConfig>(
    modelManager.getReasoningConfig(scope)
  );

  const loadModels = useCallback(async () => {
    console.log(`[${scope}] Начинаем загрузку моделей...`);
    setIsLoading(true);
    setError(null);

    try {
      const result = await modelManager.getModels(scope);
      
      if (result.success && result.data) {
        // Преобразуем ModelInfo в ModelOption для обратной совместимости
        const modelOptions: ModelOption[] = result.data.map((model: ModelInfo) => ({
          id: model.id,
          name: model.name,
          provider: model.provider,
          description: model.description,
          contextLength: model.contextLength,
          pricing: model.pricing,
          free: model.free,
          supportsReasoning: model.capabilities.reasoning
        }));

        console.log(`[${scope}] ✅ Установлено ${modelOptions.length} моделей в availableModels`);
        setAvailableModels(modelOptions);

        // Автоматически выбираем модель если не выбрана и есть доступные модели
        if (!selectedModel && modelOptions.length > 0) {
          const defaultModel = modelOptions[0];
          setSelectedModel(defaultModel.id);
          modelManager.setSelectedModel(defaultModel.id, scope);
        }
      } else {
        console.error(`[${scope}] ❌ ModelManager вернул ошибку:`, result.error);
        setError(result.error || 'Ошибка загрузки моделей');
        toast.error('Ошибка загрузки моделей', {
          description: result.error
        });
      }
    } catch (err) {
      const errorMessage = (err as any).message || 'Неизвестная ошибка';
      setError(errorMessage);
      console.error(`[${scope}] ❌ Исключение при загрузке моделей:`, err);
      toast.error('Критическая ошибка при загрузке моделей', {
        description: errorMessage
      });
    } finally {
      console.log(`[${scope}] Завершаем загрузку, isLoading -> false`);
      setIsLoading(false);
    }
  }, [scope, setSelectedModel, selectedModel]);

  // Загрузка моделей при монтировании
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Синхронизация reasoning конфигурации с ModelManager
  useEffect(() => {
    const unsubscribeReasoning = modelManager.on('reasoning_toggled', (event) => {
      if (event.scope && event.scope !== scope) return;
      setReasoningConfig(modelManager.getReasoningConfig(scope));
    });

    const unsubscribeModelSelected = modelManager.on('model_selected', (event) => {
      if (event.scope && event.scope !== scope) return;
      const data = event.data as any;
      if (data && data.model && data.model.id) {
        setSelectedModel(data.model.id);
      }
    });

    return () => {
      modelManager.off(unsubscribeReasoning);
      modelManager.off(unsubscribeModelSelected);
    };
  }, [scope, setSelectedModel]);

  const getProviderFromId = (id: string): string => {
    if (id.includes('openai/')) return 'OpenAI';
    if (id.includes('anthropic/')) return 'Anthropic';
    if (id.includes('meta-llama/')) return 'Meta';
    if (id.includes('google/')) return 'Google';
    if (id.includes('mistralai/')) return 'Mistral AI';
    if (id.includes('cohere/')) return 'Cohere';
    if (id.includes('deepseek/')) return 'DeepSeek';
    if (id.includes('qwen/')) return 'Qwen';
    if (id.includes('perplexity/')) return 'Perplexity';
    if (id.includes('nvidia/')) return 'NVIDIA';
    if (id.includes('microsoft/')) return 'Microsoft';
    if (id.includes('huggingfaceh4/')) return 'Hugging Face';
    if (id === 'local') return 'Local';
    return 'Other';
  };

  const formatContextLength = (length: number): string => {
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M tokens`;
    if (length >= 1000) return `${(length / 1000).toFixed(0)}K tokens`;
    return `${length} tokens`;
  };

  const getModelById = useCallback((id: string) => {
    return availableModels.find(model => model.id === id);
  }, [availableModels]);

  const getCurrentModel = useCallback(() => {
    if (!selectedModel || !availableModels.length) return undefined;
    return getModelById(selectedModel);
  }, [selectedModel, getModelById, availableModels]);

  const selectModel = useCallback((modelId: string) => {
    if (!modelId || !availableModels.some(model => model.id === modelId)) {
      toast.error('Некорректный ID модели');
      return;
    }
    
    setSelectedModel(modelId);
    const result = modelManager.setSelectedModel(modelId, scope);
    
    if (result.success) {
      const model = getModelById(modelId);
      const modelName = model && model.name ? model.name : modelId;
      toast.success('Модель изменена', {
        description: `Новая модель: ${modelName}`
      });
    } else {
      toast.error('Ошибка изменения модели', {
        description: result.error
      });
    }
    
    setIsSelecting(false);
  }, [setSelectedModel, availableModels, getModelById, scope]);

  // Reasoning функции
  const toggleReasoning = useCallback((enabled?: boolean) => {
    const result = modelManager.setReasoningEnabled(
      enabled !== undefined ? enabled : !reasoningConfig.enabled,
      selectedModel,
      scope
    );
    
    if (result.success) {
      const newConfig = modelManager.getReasoningConfig(scope);
      setReasoningConfig(newConfig);
      
      toast.success(`Reasoning ${newConfig.enabled ? 'включен' : 'выключен'}`, {
        description: newConfig.enabled ? `Модель: ${newConfig.modelId}` : ''
      });
    } else {
      toast.error('Ошибка изменения reasoning', {
        description: result.error
      });
    }
    
    return result;
  }, [reasoningConfig.enabled, selectedModel, scope]);

  const setReasoningDisplayStyle = useCallback((style: 'expanded' | 'collapsed' | 'hidden') => {
    modelManager.setReasoningDisplayStyle(style, scope);
    const newConfig = modelManager.getReasoningConfig(scope);
    setReasoningConfig(newConfig);
  }, [scope]);

  const supportsReasoning = useCallback((modelId?: string) => {
    return modelManager.supportsReasoning(modelId || selectedModel, scope);
  }, [selectedModel, scope]);

  const isReasoningEnabled = useCallback(() => {
    return reasoningConfig.enabled && reasoningConfig.modelId === selectedModel;
  }, [reasoningConfig, selectedModel]);

  const scopeState = modelManager.getState().scopes[scope];
  const isConfigured = scopeState && scopeState.availableModels && scopeState.availableModels.length > 0;

  return {
    availableModels,
    selectedModel,
    currentModel: getCurrentModel(),
    isSelecting,
    setIsSelecting,
    selectModel,
    getModelById,
    isLoading,
    error,
    isConfigured,
    refreshModels: loadModels,
    
    // Reasoning API
    reasoningConfig,
    toggleReasoning,
    setReasoningDisplayStyle,
    supportsReasoning,
    isReasoningEnabled,
    
    // Дополнительные утилиты
    getProviderFromId,
    formatContextLength,
    
    scope,
  };
}