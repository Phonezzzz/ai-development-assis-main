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
      name: 'Gemini 2.5 Flash Image Preview',
      provider: 'Google', 
      description: 'Модель для генерации изображений',
      contextLength: 1000000,
      pricing: { prompt: 0.00125, completion: 0.005 },
      free: false
    }
  ];

  const getCurrentImageModel = useCallback(() => {
    return availableImageModels.find(model => model.id === selectedImageModel) || availableImageModels[0];
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