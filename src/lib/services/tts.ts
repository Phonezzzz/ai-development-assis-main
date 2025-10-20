import { elevenLabsService, ElevenLabsVoice, ElevenLabsTTSOptions } from '@/lib/services/elevenlabs';

export interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  accent?: string;
  description?: string;
}

export interface TTSService {
  speak(text: string, voiceId?: string, options?: ElevenLabsTTSOptions): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
  isAvailable(): boolean;
  getVoices(): Promise<Voice[]>;
}

class UnifiedElevenLabsTTSService implements TTSService {
  private audioContext: AudioContext | null = null;
  private currentAudio: AudioBufferSourceNode | null = null;
  private isCurrentlyPlaying = false;

  isAvailable(): boolean {
    return elevenLabsService.isConfigured();
  }

  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  async getVoices(): Promise<Voice[]> {
    const elevenVoices = await elevenLabsService.getVoices();
    return elevenVoices.map(this.mapVoice);
  }

  async speak(text: string, voiceId?: string, options?: ElevenLabsTTSOptions): Promise<void> {
    if (!text.trim()) {
      return;
    }

    const preferredVoice = voiceId || localStorage.getItem('selected-voice') || 'EXAVITQu4vr4xnSDxMaL';

    // Останавливаем всё, что могло играть раньше
    this.stop();
    this.isCurrentlyPlaying = true;

    try {
      const audioBuffer = await elevenLabsService.generateSpeech(text, {
        voice_id: preferredVoice,
        ...options,
      });

      await this.playAudio(audioBuffer);
    } finally {
      this.isCurrentlyPlaying = false;
    }
  }

  stop(): void {
    this.isCurrentlyPlaying = false;

    if (this.currentAudio) {
      try {
        this.currentAudio.stop();
      } catch (error) {
        console.warn('Ошибка при остановке аудио ElevenLabs:', JSON.stringify(error, null, 2));
      }
      this.currentAudio = null;
    }
  }

  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Аудио воспроизведение недоступно в этой среде');
    }

    if (!this.audioContext) {
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.audioContext = AudioContextClass ? new AudioContextClass() : null;
        if (!this.audioContext) {
          throw new Error('Аудио контекст недоступен');
        }
      } catch (error) {
        console.error('Не удалось инициализировать AudioContext:', JSON.stringify(error, null, 2));
        throw new Error('Аудио контекст недоступен');
      }
    }

    const audioBuffer = await this.audioContext.decodeAudioData(audioData);
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    this.currentAudio = source;

    return new Promise((resolve, reject) => {
      source.onended = () => {
        this.currentAudio = null;
        this.isCurrentlyPlaying = false;
        resolve();
      };

      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume()
          .then(() => source.start(0))
          .catch((error) => {
            console.error('Ошибка при возобновлении аудио контекста:', JSON.stringify(error, null, 2));
            reject(error);
          });
      } else {
        try {
          source.start(0);
        } catch (error) {
          console.error('Ошибка при запуске воспроизведения:', JSON.stringify(error, null, 2));
          reject(error);
        }
      }
    });
  }

  private mapVoice(voice: ElevenLabsVoice): Voice {
    return {
      id: voice.voice_id,
      name: voice.name,
      language: voice.language,
      gender: voice.gender,
      accent: voice.accent,
      description: voice.description,
    };
  }
}

export const ttsService = new UnifiedElevenLabsTTSService();