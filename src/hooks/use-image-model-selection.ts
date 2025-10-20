import { useState, useCallback } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { ModelOption } from '@/lib/types';

export function useImageModelSelection() {
  const [selectedImageModel, setSelectedImageModel] = useKV<string>('selected-image-model', 'google/gemini-2.5-flash-image-preview');
  const [isSelecting, setIsSelecting] = useState(false);

  // Модели для создания изображений
  const availableImageModels: ModelOption[] = [
    {
      id: 'google/gemini-2.5-flash-image-preview',
      name: 'Gemini 2.5 Flash Image',
      provider: 'Google',
      description: 'Быстрая генерация изображений от Google',
      contextLength: 1000000,
      pricing: { prompt: 0.00125, completion: 0.005 },
      free: false
    },
    {
      id: 'openai/gpt-5-image-mini',
      name: 'GPT-5 Image Mini',
      provider: 'OpenAI',
      description: 'Компактная модель для генерации изображений от OpenAI',
      contextLength: 128000,
      pricing: { prompt: 0.0015, completion: 0.006 },
      free: false
    }
  ];

  const getCurrentImageModel = useCallback(() => {
    const model = availableImageModels.find(model => model.id === selectedImageModel);
    if (!model) {
      throw new Error(`Image model not found: ${selectedImageModel}`);
    }
    return model;
  }, [selectedImageModel]);

  const selectImageModel = useCallback((modelId: string) => {
    setSelectedImageModel(modelId);
    setIsSelecting(false);
  }, [setSelectedImageModel]);

  return {
    availableImageModels,
    selectedImageModel,
    currentImageModel: getCurrentImageModel(),
    isSelecting,
    setIsSelecting,
    selectImageModel,
  };
}