import { useState, useCallback, useEffect } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { ModelOption } from '@/lib/types';
import { openRouterService, Model } from '@/lib/services/openrouter';

export function useModelSelection(scope: 'chat' | 'workspace' = 'chat') {
  const [selectedModel, setSelectedModel] = useKV<string>(`selected-model:${scope}`, '');
  const [isSelecting, setIsSelecting] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const openRouterModels = await openRouterService.getModels();
      let modelOptions: ModelOption[] = openRouterModels.map((model: Model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        description: `${formatContextLength(model.contextLength)} • $${model.pricing.prompt}/$${model.pricing.completion}`,
        contextLength: model.contextLength,
        pricing: model.pricing,
        free: model.pricing.prompt === 0 && model.pricing.completion === 0
      }));

      // Удаляем локальные модели, пришедшие из сервиса (например, "local/use"),
      // чтобы не дублировать с ручным вариантом ниже (id: "local")
      for (let i = modelOptions.length - 1; i >= 0; i--) {
        if (modelOptions[i].id.startsWith('local/')) {
          modelOptions.splice(i, 1);
        }
      }

      // Add local model option
      const localModel: ModelOption = {
        id: 'local',
        name: 'Local use',
        provider: 'Local',
        description: '128K tokens • $0/$0',
        contextLength: 128000,
        pricing: { prompt: 0, completion: 0 },
        free: true
      };

      // Add local model first
      modelOptions.unshift(localModel);

      // Sort models: free first, then by provider
      modelOptions.sort((a, b) => {
        // Local model always first
        if (a.id === 'local') return -1;
        if (b.id === 'local') return 1;

        if (a.free && !b.free) return -1;
        if (!a.free && b.free) return 1;
        return a.provider.localeCompare(b.provider);
      });

      setAvailableModels(modelOptions);

      // Auto-select first model if none selected
      if (!selectedModel && modelOptions.length > 0) {
        setSelectedModel(modelOptions[0].id);
      }
    } catch (error) {
      console.error('Ошибка загрузки моделей:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

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
    setSelectedModel(modelId);
    setIsSelecting(false);
  }, [setSelectedModel]);

  const isConfigured = openRouterService.isConfigured();

  return {
    availableModels,
    selectedModel,
    currentModel: getCurrentModel(),
    isSelecting,
    setIsSelecting,
    selectModel,
    getModelById,
    isLoading,
    isConfigured,
    refreshModels: loadModels,
  };
}