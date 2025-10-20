/**
 * Hook для генерации изображений и обработки streaming ответов
 */

import { useRef, useCallback } from 'react';
import { Message, GeneratedImage } from '@/lib/types';
import { imageGenerationService } from '@/lib/services/image-generation';
import { openRouterService } from '@/lib/services/openrouter';
import type { ChatCompletionRequest } from '@/lib/services/providers/model-provider';
import {
  generateImageMessageId,
  generateImageId,
  isImageRequest,
  parseSSEData,
  extractImageFromDelta,
  extractTextFromDelta,
} from '@/lib/utils/image-utils';

const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

interface ImageGenerationCallbacks {
  onAddMessage: (message: Message) => void;
  onUpdateMessage: (messageId: string, content: string) => void;
  onAddImage: (image: GeneratedImage) => void;
  onUpdateImage: (imageId: string, url: string, isGenerating: boolean) => void;
  onRemoveImage: (imageId: string) => void;
  onSetGenerating: (isGenerating: boolean) => void;
}

export function useImageGeneration(callbacks: ImageGenerationCallbacks) {
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isStreamCancelledRef = useRef(false);

  /**
   * Отменяет текущую генерацию
   */
  const cancelGeneration = useCallback(async () => {
    isStreamCancelledRef.current = true;
    if (streamReaderRef.current) {
      try {
        await streamReaderRef.current.cancel();
      } catch {}
    }
  }, []);

  /**
   * Обработка пользовательского сообщения (текст или запрос на изображение)
   */
  const handleUserMessage = useCallback(
    async (text: string, isVoice: boolean = false, currentModelId?: string, ttsSpeak?: (text: string) => Promise<void>) => {
      try {
        if (!imageGenerationService.isConfigured()) {
          throw new Error('OpenRouter API ключ не настроен. Проверьте переменную VITE_OPENROUTER_API_KEY в .env.local');
        }

        // Если пользователь просит ИЗОБРАЖЕНИЕ
        if (isImageRequest(text.trim())) {
          if (DEBUG) console.log('Routing to image generation service');
          await generateImageFromPrompt(text.trim(), currentModelId);
          return;
        }

        // Иначе — обычный текстовый диалог (стриминг)
        const clean = text.trim();
        if (!clean) return;

        // Добавляем пользовательское сообщение
        const userMessage: Message = {
          id: generateImageMessageId('user'),
          type: 'user',
          content: clean,
          timestamp: new Date(),
          isVoice,
        };

        callbacks.onAddMessage(userMessage);
        callbacks.onSetGenerating(true);

        // Создаём начальное сообщение ассистента
        const assistantMessageId = generateImageMessageId('assistant');
        const initialAssistantMessage: Message = {
          id: assistantMessageId,
          type: 'assistant',
          content: '',
          timestamp: new Date(),
          isVoice: false,
        };

        callbacks.onAddMessage(initialAssistantMessage);

        // Отправляем запрос
        if (!currentModelId) {
          throw new Error('Image model is not selected');
        }

        const chatRequest: ChatCompletionRequest = {
          model: currentModelId,
          messages: [
            {
              role: 'system',
              content: "Ты помощник, который может общаться и создавать изображения. Если пользователь просит создать, нарисовать, сгенерировать изображение, то создай изображение. В остальных случаях просто отвечай текстом."
            },
            {
              role: 'user',
              content: clean
            }
          ],
          modalities: ['text', 'image'],
          stream: true
        };

        const reader = await openRouterService.createChatCompletionStream(chatRequest);
        isStreamCancelledRef.current = false;
        streamReaderRef.current = reader;

        const decoder = new TextDecoder();
        let assistantMessage = '';
        let incompleteData = '';

        // Таймаут для генерации изображений (30 секунд)
        const timeoutId = setTimeout(() => {
          if (DEBUG) console.log('Image generation timeout');
          cancelGeneration();
        }, 30000);

        try {
          while (true) {
            if (isStreamCancelledRef.current) {
              try {
                await reader.cancel();
              } catch {}
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const fullChunk = incompleteData + chunk;
            const lines = fullChunk.split('\n');

            incompleteData = lines.pop() || '';

            for (const line of lines) {
              const data = parseSSEData(line);
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0]) {
                  const delta = parsed.choices[0].delta;

                  // Обработка текста
                  const textContent = extractTextFromDelta(delta);
                  if (textContent) {
                    assistantMessage += textContent;
                    callbacks.onUpdateMessage(assistantMessageId, assistantMessage);
                  }

                  // Обработка изображений
                  const imageUrl = extractImageFromDelta(delta);
                  if (imageUrl) {
                    // Изображение получено, но мы просто логируем
                    if (DEBUG) console.log('Image received in stream');
                  }
                }
              } catch (e) {
                if (DEBUG) console.log('Failed to parse JSON chunk', e);
              }
            }
          }
        } finally {
          clearTimeout(timeoutId);
          streamReaderRef.current = null;
          isStreamCancelledRef.current = false;
        }

        // Авто-озвучка ответа если запрос был голосовым
        if (isVoice && assistantMessage.trim() && ttsSpeak && !isStreamCancelledRef.current) {
          try {
            await ttsSpeak(assistantMessage.trim());
          } catch {}
        }
      } catch (error) {
        const errorMessage: Message = {
          id: generateImageMessageId('error'),
          type: 'assistant',
          content: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          timestamp: new Date(),
          isVoice: false,
        };

        callbacks.onAddMessage(errorMessage);
      } finally {
        callbacks.onSetGenerating(false);
        streamReaderRef.current = null;
        isStreamCancelledRef.current = false;
      }
    },
    [callbacks, cancelGeneration]
  );

  /**
   * Генерирует изображение из промпта
   */
  const generateImageFromPrompt = useCallback(
    async (promptText: string, currentModelId?: string) => {
      // Добавляем пользовательское сообщение
      const userMessage: Message = {
        id: generateImageMessageId('user'),
        type: 'user',
        content: promptText.trim(),
        timestamp: new Date(),
        isVoice: false,
      };

      callbacks.onAddMessage(userMessage);

      const imageId = generateImageId();
      const newImage: GeneratedImage = {
        id: imageId,
        prompt: promptText.trim(),
        url: '',
        timestamp: new Date(),
        isGenerating: true,
      };

      callbacks.onAddImage(newImage);
      callbacks.onSetGenerating(true);

      try {
        if (!imageGenerationService.isConfigured()) {
          throw new Error('OpenRouter API ключ не настроен');
        }

        if (!currentModelId) {
          throw new Error('Image model is not selected');
        }

        if (DEBUG) console.log('Generating image with model:', currentModelId);

        const result = await imageGenerationService.generateImage({
          prompt: promptText.trim(),
          model: currentModelId,
          onProgress: (partialImageUrl, status) => {
            if (partialImageUrl) {
              callbacks.onUpdateImage(imageId, partialImageUrl, false);
            }

            if (status) {
              const statusMessage: Message = {
                id: generateImageMessageId('status'),
                type: 'assistant',
                content: `🔄 ${status}`,
                timestamp: new Date(),
                isVoice: false,
              };

              callbacks.onAddMessage(statusMessage);
            }
          }
        });

        if (result.success && result.imageUrl) {
          callbacks.onUpdateImage(imageId, result.imageUrl, false);

          const completionMessage: Message = {
            id: generateImageMessageId('completion'),
            type: 'assistant',
            content: `✅ Изображение создано успешно!`,
            timestamp: new Date(),
            isVoice: false,
          };

          callbacks.onAddMessage(completionMessage);
        } else {
          callbacks.onRemoveImage(imageId);

          const errorMessage: Message = {
            id: generateImageMessageId('error'),
            type: 'assistant',
            content: `❌ Ошибка создания изображения: ${result.error || 'Неизвестная ошибка'}`,
            timestamp: new Date(),
            isVoice: false,
          };

          callbacks.onAddMessage(errorMessage);
        }
      } catch (error) {
        callbacks.onRemoveImage(imageId);

        const errorMessage: Message = {
          id: generateImageMessageId('error'),
          type: 'assistant',
          content: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
          timestamp: new Date(),
          isVoice: false,
        };

        callbacks.onAddMessage(errorMessage);
      } finally {
        callbacks.onSetGenerating(false);
      }
    },
    [callbacks]
  );

  return {
    handleUserMessage,
    generateImageFromPrompt,
    cancelGeneration,
    isGenerating: false, // управляется через callbacks.onSetGenerating
  };
}
