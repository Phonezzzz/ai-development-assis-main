/**
 * Hook для управления глобальной галереей изображений
 * Синхронизирует изображения из текущей сессии и всех сохранённых сессий
 */

import { useState, useEffect, useCallback } from 'react';
import { GeneratedImage, Message } from '@/lib/types';
import { useKV } from '@/shims/spark-hooks';

interface ImageSession {
  id: string;
  title: string;
  messages: Message[];
  images: GeneratedImage[];
  timestamp: Date;
  model: string;
}

export function useImageGallery(
  currentSessionImages: GeneratedImage[],
  imageSessions: ImageSession[]
) {
  const [allImages, setAllImages] = useKV<GeneratedImage[]>('all-generated-images', []);

  // Синхронизируем глобальную галерею как объединение изображений из всех сессий и текущей сессии
  useEffect(() => {
    const fromSessions = imageSessions.flatMap(session => session.images || []);
    const fromCurrent = currentSessionImages || [];
    const combined = [...fromSessions, ...fromCurrent];

    // Удаляем дубликаты по ID
    const uniqueCombined = combined.filter((image, index, self) =>
      index === self.findIndex(img => img.id === image.id)
    );

    // Проверяем нужно ли обновлять
    const differsByLength = uniqueCombined.length !== allImages.length;
    const differsByIds =
      uniqueCombined.length > 0 &&
      allImages.length > 0 &&
      !uniqueCombined.every(img => allImages.some(a => a.id === img.id));

    if (differsByLength || differsByIds) {
      setAllImages(uniqueCombined);
    }
  }, [currentSessionImages, imageSessions, allImages, setAllImages]);

  /**
   * Загружает изображение
   */
  const downloadImage = useCallback(async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', JSON.stringify(error, null, 2));
    }
  }, []);

  return {
    allImages,
    downloadImage,
  };
}
