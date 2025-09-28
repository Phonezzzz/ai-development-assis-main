import { config } from '@/lib/config';

// STT service using local proxy endpoint /api/stt/transcribe
type TranscribeOptions = {
  language?: string; // e.g. 'ru'
  model?: string;    // e.g. 'whisper-1'
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function transcribeWithModel(blob: Blob, model: string, language = 'ru', signal?: AbortSignal, timeoutMs = 60000): Promise<string> {
  const form = new FormData();
  // Server expects: file, model, language
  const file = new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' });
  form.append('file', file);
  form.append('model', model);
  form.append('language', language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/stt/transcribe', {
      method: 'POST',
      body: form,
      signal: signal || controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Failed to read error body');
      throw new Error(`STT API error: ${res.status} ${res.statusText} - ${errText}`);
    }

    const data = await res.json().catch(() => ({} as any));
    const text = data?.text ?? data?.data?.text ?? data?.result ?? '';
    if (typeof text !== 'string') {
      throw new Error('Некорректный ответ STT сервиса');
    }
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeAudio(blob: Blob, opts: TranscribeOptions = {}): Promise<string> {
  const language = opts.language || 'ru';
  const model = opts.model || 'whisper-1';
  return transcribeWithModel(blob, model, language, opts.signal, opts.timeoutMs);
}

function isConfigured(): boolean {
  // Проксируем на серверный ключ OPENAI_API_KEY — на клиенте считаем доступным
  return true;
}

export const sttService = {
  isConfigured,
  transcribeAudio,
};