import { config } from '@/lib/config';

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url?: string;
  category: string;
  language?: string;
  gender?: string;
  accent?: string;
  description?: string;
  use_case?: string;
}

export interface ElevenLabsTTSOptions {
  voice_id?: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export interface ElevenLabsTranscriptionOptions {
  languageCode?: string;
  modelId?: string;
  diarize?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ElevenLabsTranscriptionResult {
  text: string;
  languageCode?: string;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    type?: string;
    speaker_id?: string;
    logprob?: number;
    characters?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
  }>;
  raw: unknown;
}

class ElevenLabsService {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private apiKey: string;
  private storageListener?: (event: StorageEvent) => void;

  constructor() {
    this.apiKey = this.resolveApiKey();

    if (typeof window !== 'undefined') {
      this.storageListener = (event: StorageEvent) => {
        if (event.key === 'elevenlabs-api-key') {
          this.apiKey = this.resolveApiKey();
        }
      };
      window.addEventListener('storage', this.storageListener);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim());
  }

  updateApiKey(nextKey: string): void {
    this.apiKey = (nextKey || '').trim();
  }

  async getVoices(): Promise<ElevenLabsVoice[]> {
    const apiKey = this.requireApiKey();

    const response = await this.fetchWithTimeout(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Не удалось получить список голосов: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.voices)) {
      throw new Error('ElevenLabs API вернул некорректный формат данных');
    }

    return data.voices;
  }

  async generateSpeech(text: string, options: ElevenLabsTTSOptions = {}): Promise<ArrayBuffer> {
    const apiKey = this.requireApiKey();

    const response = await this.fetchWithTimeout(`${this.baseUrl}/text-to-speech/${options.voice_id || 'EXAVITQu4vr4xnSDxMaL'}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: options.model_id || 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          ...options.voice_settings,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Не удалось прочитать тело ошибки');
      if (response.status === 401 || response.status === 429) {
        throw new Error(`Ошибка ElevenLabs TTS (${response.status}): ${errText}`);
      }
      throw new Error(`Не удалось сгенерировать речь: ${response.status} ${response.statusText} - ${errText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('audio')) {
      const errText = await response.text().catch(() => '');
      throw new Error(`ElevenLabs вернул неожиданный контент (${contentType}). ${errText}`);
    }

    return response.arrayBuffer();
  }

  async transcribeAudio(blob: Blob, options: ElevenLabsTranscriptionOptions = {}): Promise<ElevenLabsTranscriptionResult> {
    const apiKey = this.requireApiKey();
    const file = blob instanceof File ? blob : new File([blob], 'audio.webm', { type: blob.type || 'audio/webm' });

    const formData = new FormData();
    formData.append('file', file);

    if (options.languageCode) {
      formData.append('language_code', options.languageCode);
    }
    if (options.modelId) {
      formData.append('model_id', options.modelId);
    }
    if (typeof options.diarize === 'boolean') {
      formData.append('diarize', String(options.diarize));
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/speech-to-text/convert`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    }, options);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Не удалось прочитать тело ошибки');
      throw new Error(`Не удалось выполнить транскрипцию: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json().catch(() => ({}));
    const text = data && typeof data.text === 'string' ? data.text.trim() : '';

    if (!text) {
      throw new Error('ElevenLabs STT не вернул текст транскрипции');
    }

    return {
      text,
      languageCode: data && typeof data.language_code === 'string' ? data.language_code : undefined,
      words: data && Array.isArray(data.words) ? data.words : undefined,
      raw: data,
    };
  }

  dispose(): void {
    if (typeof window !== 'undefined' && this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
    }
  }

  private resolveApiKey(): string {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('elevenlabs-api-key');
      if (stored && stored.trim()) {
        return stored.trim();
      }
    }

    const configKey = config.elevenlabs && config.elevenlabs.apiKey ? config.elevenlabs.apiKey.trim() : '';
    if (configKey) {
      return configKey;
    }

    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const envKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
      return typeof envKey === 'string' ? envKey : '';
    }

    return '';
  }

  private requireApiKey(): string {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API ключ не настроен');
    }
    return this.apiKey;
  }

  private async fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener('abort', () => controller.abort(options.signal!.reason), { once: true });
      }
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

}

export const elevenLabsService = new ElevenLabsService();