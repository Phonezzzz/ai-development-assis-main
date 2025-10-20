import { config } from '@/lib/config';
import { openRouterService } from '@/lib/services/openrouter';
import { isRecord } from '../types/strict-types';

const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  onProgress?: (partialImageUrl?: string, status?: string) => void;
}

export interface ImageGenerationResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

class ImageGenerationService {
  private baseUrl = config.openrouter.baseUrl;
  private apiKey = config.openrouter.apiKey;

  constructor() {}

  private base64ToBlob(base64Data: string): string {
    try {
      // Убираем префикс data:image/...;base64, если есть
      const base64 = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;

      // Декодируем base64
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Error converting base64 to blob:', JSON.stringify(error, null, 2));
      // Fallback: возвращаем оригинальный data URL
      return base64Data;
    }
  }

  // Универсальный извлекатель URL изображения из произвольного JSON (Responses/Chat formats)
  private tryExtractImageUrlFromObject(obj: unknown): string | null {
    try {
      if (!obj || typeof obj !== 'object') return null;

      // 1) Прямые варианты image_url
      const tryGet = (candidate: unknown): string | null => {
        if (!candidate) return null;
        if (typeof candidate === 'string' && (candidate.startsWith('http') || candidate.startsWith('data:image'))) {
          return candidate;
        }
        if (isRecord(candidate) && typeof candidate.url === 'string' && (candidate.url.startsWith('http') || candidate.url.startsWith('data:image'))) {
          return candidate.url;
        }
        return null;
      };

      // Популярные поля
      const direct =
        (isRecord(obj) && tryGet(obj.image_url)) ||
        (isRecord(obj) && tryGet(obj.image)) ||
        (isRecord(obj) && tryGet(obj.url));
      if (direct) return direct;

      // 2) Частые контейнеры
      const containers = [
        isRecord(obj) ? obj.delta : undefined,
        isRecord(obj) ? obj.message : undefined,
        isRecord(obj) ? obj.data : undefined,
        isRecord(obj) ? obj.response : undefined,
      ].filter(Boolean);

      for (const c of containers) {
        const found = this.tryExtractImageUrlFromObject(c);
        if (found) return found;
      }

      // 3) content как массив (Responses API: message/content[]; OpenAI-like)
      const content = isRecord(obj) ? obj.content : undefined;
      if (Array.isArray(content)) {
        for (const item of content) {
          // item может иметь типы: output_image, image_url, image, и т.п.
          const byType =
            (isRecord(item) && tryGet(item.image_url)) ||
            (isRecord(item) && tryGet(item.image)) ||
            (isRecord(item) && tryGet(item.url));
          if (byType) return byType;

          // иногда изображение может лежать глубже
          const deeper = this.tryExtractImageUrlFromObject(item);
          if (deeper) return deeper;
        }
      } else if (typeof content === 'string' && content.startsWith('data:image')) {
        return content;
      }

      // 4) output массив (Responses финальный объект)
      const output = (isRecord(obj) && obj.output) || (isRecord(obj) && isRecord(obj.response) && obj.response.output);
      if (Array.isArray(output)) {
        for (const item of output) {
          const outUrl =
            (isRecord(item) && tryGet(item.image_url)) ||
            (isRecord(item) && tryGet(item.image)) ||
            (isRecord(item) && tryGet(item.url));
          if (outUrl) return outUrl;

          const deeper = this.tryExtractImageUrlFromObject(item);
          if (deeper) return deeper;
        }
      }

      // 5) перебор всех полей для редких структур
      if (!isRecord(obj)) return null;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === 'object') {
          const nested = this.tryExtractImageUrlFromObject(val);
          if (nested) return nested;
        } else if (typeof val === 'string') {
          if (val.startsWith('http') || val.startsWith('data:image')) {
            return val;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private processDataLine(data: string, contentBuffer: { value: string }, onProgress?: (partialImageUrl?: string, status?: string) => void): ImageGenerationResponse | null {
    try {
      const parsed = JSON.parse(data);
      if (DEBUG) console.log('📦 Parsed streaming data (debug enabled)');

      // Универсальная попытка извлечь изображение для Responses/Chat
      const directImage = this.tryExtractImageUrlFromObject(parsed);
      if (directImage) {
        if (onProgress) {
          onProgress(directImage, 'Изображение получено!');
        }
        return {
          success: true,
          imageUrl: directImage
        };
      }

      // Проверим, есть ли вообще изображения где-то в этом объекте (лог только для дебага)
      const jsonStr = JSON.stringify(parsed);
      if (DEBUG && (jsonStr.includes('"images"') || jsonStr.includes('data:image/'))) {
        console.log('🖼️  This chunk may contain image data (debug)');
      }

      if (parsed.choices) {
        if (DEBUG) console.log('✓ Found choices array with length:', JSON.stringify(parsed.choices.length, null, 2));
        const choice = parsed.choices[0];
        if (DEBUG) {
          console.log('✓ Processing choice (debug)');
        }
        const delta = choice.delta;
        const message = choice.message;
        if (DEBUG) {
          console.log('✓ Delta present:', JSON.stringify(!!delta, null, 2));
          console.log('✓ Message present:', JSON.stringify(!!message, null, 2));
        }

        // Обработка base64 изображений в content
        if (delta && delta.content && typeof delta.content === 'string') {
          if (DEBUG) console.log('Delta contains content (debug)');

          // Накапливаем содержимое для случая, когда base64 приходит частями
          contentBuffer.value += delta.content;

          // Показываем прогресс накопления данных
          if (contentBuffer.value.length > 100 && onProgress) {
            onProgress(undefined, `Получение данных изображения... ${contentBuffer.value.length} символов`);
          }

          // Проверяем, является ли накопленный content base64 изображением
          if (contentBuffer.value.includes('data:image/') ||
              (contentBuffer.value.match(/^[A-Za-z0-9+/=]{100,}$/) && contentBuffer.value.endsWith('='))) {

            let base64Data = contentBuffer.value;

            // Если это чистый base64 без заголовка, добавляем заголовок
            if (!base64Data.startsWith('data:image/')) {
              base64Data = `data:image/png;base64,${base64Data}`;
            }

            if (DEBUG) console.log('Converting accumulated base64 to blob URL (debug)');

            // Уведомляем о конвертации
            if (onProgress) {
              onProgress(undefined, 'Конвертирование изображения...');
            }

            // Конвертируем в blob URL для лучшей производительности
            const imageUrl = this.base64ToBlob(base64Data);

            // Уведомляем об успешном завершении
            if (onProgress) {
              onProgress(imageUrl, 'Изображение готово!');
            }

            return {
              success: true,
              imageUrl: imageUrl
            };
          }
        }

        // Обработка изображений в формате images в delta
        if (DEBUG) {
          console.log('🔍 Checking delta.images (debug)');
        }

        if (delta && delta.images && Array.isArray(delta.images) && delta.images.length > 0) {
          if (DEBUG) console.log('✅ Found images in delta (debug)');

          for (let i = 0; i < delta.images.length; i++) {
            const image = delta.images[i];
            if (DEBUG) console.log(`Processing delta image ${i + 1} (debug)`);

            // Проверяем URL изображения согласно документации
            if (image && image.image_url && image.image_url.url) {
              const imageUrl = image.image_url.url;

              // Уведомляем об успешном получении изображения
              if (onProgress) {
                onProgress(imageUrl, 'Изображение получено!');
              }

              return {
                success: true,
                imageUrl: imageUrl
              };
            }
          }
        }

        // Обработка изображений в формате images в message
        if (DEBUG) {
          console.log('🔍 Checking message.images (debug)');
        }

        if (message && message.images && Array.isArray(message.images) && message.images.length > 0) {
          if (DEBUG) console.log('✅ Found images in message (debug)');

          for (let i = 0; i < message.images.length; i++) {
            const image = message.images[i];
            if (DEBUG) console.log(`Processing message image ${i + 1} (debug)`);

            // Проверяем URL изображения согласно документации
            if (image && image.image_url && image.image_url.url) {
              const imageUrl = image.image_url.url;

              return {
                success: true,
                imageUrl: imageUrl
              };
            }
          }
        }
      }
    } catch (e) {
      if (DEBUG) {
        console.log('Failed to parse JSON chunk (debug):', e);
      }
      // Пропускаем невалидный JSON
    }

    return null;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }

  private getCommonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Title': 'AI Agent Workspace',
    };
    const referer = typeof window !== 'undefined' ? (window.location && window.location.origin ? window.location.origin : undefined) : undefined;
    headers['HTTP-Referer'] = referer || 'http://localhost';
    if (this.isConfigured()) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    if (DEBUG) console.log('Image generation service starting');
    
    if (!this.isConfigured()) {
      console.error('Image generation service not configured - missing API key');
      return {
        success: false,
        error: "OpenRouter API ключ не настроен. Проверьте настройки в .env.local"
      };
    }

    try {
      if (!request.model) {
        throw new Error('Image model must be specified');
      }

      if (DEBUG) {
        console.log('Sending image generation request (Responses API):', { model: request.model });
      }

      // Используем Responses streaming API вместо chat/completions
      const reader = await openRouterService.createResponsesStream({
        model: request.model,
        prompt: request.prompt,
        modalities: ['image', 'text'],
      });

      const decoder = new TextDecoder();

      let allData = '';
      let contentBuffer = { value: '' };
      let incompleteData = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Перед завершением проверим, есть ли неполные данные
          if (incompleteData.trim()) {
            if (DEBUG) console.log('🔧 Processing incomplete data at end (debug)');
            const trimmed = incompleteData.trim();
            if (trimmed.startsWith('data:') || trimmed.startsWith('data: ')) {
              const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trim();
              if (data !== '[DONE]') {
                const result = this.processDataLine(data, contentBuffer, request.onProgress);
                if (result) {
                  reader.cancel();
                  return result;
                }
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value);
        allData += chunk;
        if (DEBUG) console.log('Received streaming chunk (debug)');

        // Добавляем неполные данные из предыдущего чанка
        const fullChunk = incompleteData + chunk;
        const lines = fullChunk.split('\n');

        // Последняя строка может быть неполной
        incompleteData = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!(trimmed.startsWith('data:') || trimmed.startsWith('data: '))) continue;
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trim();
          if (data !== '[DONE]') {
            const result = this.processDataLine(data, contentBuffer, request.onProgress);
            if (result) {
              reader.cancel();
              return result;
            }
          }
        }
      }

      if (DEBUG) console.log('Streaming completed (debug)');

      return {
        success: false,
        error: "Модель не вернула изображение в streaming ответе"
      };

    } catch (error) {
      console.error("Ошибка генерации изображения:", JSON.stringify(error, null, 2));
      return {
        success: false,
        error: `Ошибка API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }

  /**
   * Проверяет доступные модели с поддержкой генерации изображений
   */
  async getImageCapableModels(): Promise<string[]> {
    if (!this.isConfigured()) {
      return [];
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.getCommonHeaders(),
      });

      if (!response.ok) {
        console.error('Ошибка получения списка моделей:', JSON.stringify(response.status, null, 2));
        return ['google/gemini-2.5-flash-image-preview']; // fallback
      }

      const data = await response.json();
      const models = data.data || [];

      // Фильтруем модели с поддержкой генерации изображений
      const imageModels = models
        .filter((model: { id?: string; name?: string; output_modalities?: string[] }) =>
          model.output_modalities &&
          model.output_modalities.includes('image')
        )
        .map((model: { id: string }) => model.id);

      return imageModels.length > 0 ? imageModels : ['google/gemini-2.5-flash-image-preview'];
    } catch (error) {
      console.error('Ошибка проверки моделей:', JSON.stringify(error, null, 2));
      return ['google/gemini-2.5-flash-image-preview']; // fallback
    }
  }
}

export const imageGenerationService = new ImageGenerationService();