/**
 * Утилиты для работы с изображениями
 */

const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

/**
 * Генерирует уникальный ID для сообщения изображения
 */
export function generateImageMessageId(type: 'user' | 'assistant' | 'completion' | 'error' | 'system' | 'status'): string {
  const uid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `img_msg_${uid}_${type}`;
}

/**
 * Генерирует уникальный ID для изображения
 */
export function generateImageId(): string {
  return `img_${Date.now()}`;
}

/**
 * Детектор запроса на изображение
 * Поддерживает русский и английский языки
 */
export function isImageRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  const keywords = [
    'изобр', 'картин', 'рисунк', 'нарис', 'сгенер', 'созда', 'арт',
    'логотип', 'иконк', 'фото', 'обложк', 'баннер', 'аватар', 'постер', 'обои',
    'wallpaper', 'image', 'img', 'picture', 'photo', 'render', 'generate', 'draw', 'logo', 'icon'
  ];

  const verbsRu = /(сделай|создай|нарисуй|сгенерируй|покажи)\b/;
  const verbsEn = /\b(make|create|generate|draw|render|show)\b/;

  return keywords.some(k => t.includes(k)) || verbsRu.test(t) || verbsEn.test(t);
}

/**
 * Парсер SSE потока данных
 */
export function parseSSEData(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('data:') || trimmed.startsWith('data: '))) return null;

  const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trim();
  return data === '[DONE]' ? null : data;
}

/**
 * Проверяет содержит ли парсированные данные изображение
 */
export function extractImageFromDelta(delta: any): string | null {
  if (!delta || !delta.images || !Array.isArray(delta.images) || delta.images.length === 0) {
    return null;
  }

  for (const image of delta.images) {
    if (image && image.image_url && image.image_url.url) {
      return image.image_url.url;
    }
  }

  return null;
}

/**
 * Извлекает текст из дельты
 */
export function extractTextFromDelta(delta: any): string | null {
  return delta && delta.content ? delta.content : null;
}
