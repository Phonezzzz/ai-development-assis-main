import { config } from '@/lib/config';

export interface Voice {
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

export interface TTSOptions {
  voice_id?: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

class ElevenLabsService {
  private baseUrl = 'https://api.elevenlabs.io/v1';
  private apiKey = config.elevenlabs.apiKey;

  constructor() {}

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }

  private async fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.isConfigured()) {
      // Return mock voices for demo
      return this.getMockVoices();
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      }, 30000);

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`);
      }

      const data = await response.json();
      return data.voices || [];
    } catch (error) {
      console.error('Error fetching voices:', error);
      return this.getMockVoices();
    }
  }

  async generateSpeech(text: string, options: TTSOptions = {}): Promise<ArrayBuffer> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs не настроен: отсутствует API ключ');
    }

    const voice_id = options.voice_id || 'EXAVITQu4vr4xnSDxMaL'; // Default voice

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/text-to-speech/${voice_id}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: options.model_id || 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
            ...options.voice_settings,
          },
        }),
      }, 30000);

      if (!response.ok) {
        throw new Error(`Failed to generate speech: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error generating speech:', error);
      throw error instanceof Error ? error : new Error('Не удалось сгенерировать речь ElevenLabs');
    }
  }

  async playAudio(audioBuffer: ArrayBuffer): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Аудио недоступно в этой среде выполнения');
      }

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode audio data
      const audioBufferData = await audioContext.decodeAudioData(audioBuffer);
      
      // Create audio source
      const source = audioContext.createBufferSource();
      source.buffer = audioBufferData;
      source.connect(audioContext.destination);
      
      // Play audio
      source.start(0);
      
      // Return promise that resolves when audio ends
      return new Promise((resolve) => {
        source.onended = () => resolve();
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      throw error;
    }
  }

  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      const audioBuffer = await this.generateSpeech(text, options);
      await this.playAudio(audioBuffer);
    } catch (error) {
      console.error('Error in speak:', error);
      // Fallback to browser TTS
      this.fallbackSpeak(text);
    }
  }

  private fallbackSpeak(text: string): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      speechSynthesis.speak(utterance);
    }
  }

  private getMockVoices(): Voice[] {
    return [
      {
        voice_id: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Bella (Русская)',
        category: 'premade',
        language: 'Russian',
        gender: 'Female',
        accent: 'Russian',
        description: 'Молодой женский голос с русским акцентом',
        use_case: 'Общее назначение',
      },
      {
        voice_id: 'ErXwobaYiN019PkySvjV',
        name: 'Antoni (Английский)',
        category: 'premade',
        language: 'English',
        gender: 'Male',
        accent: 'American',
        description: 'Мужской голос с американским акцентом',
        use_case: 'Повествование',
      },
      {
        voice_id: 'VR6AewLTigWG4xSOukaG',
        name: 'Arnold (Английский)',
        category: 'premade',
        language: 'English',
        gender: 'Male',
        accent: 'American',
        description: 'Глубокий мужской голос',
        use_case: 'Презентации',
      },
      {
        voice_id: 'pNInz6obpgDQGcFmaJgB',
        name: 'Adam (Английский)',
        category: 'premade',
        language: 'English',
        gender: 'Male',
        accent: 'American',
        description: 'Спокойный мужской голос',
        use_case: 'Обучение',
      },
    ];
  }

  private getMockAudioData(text: string): ArrayBuffer {
    // Create a simple audio buffer for demonstration
    // In a real scenario, this would be actual audio data
    const length = Math.max(text.length * 100, 44100); // Approximate duration based on text length
    const arrayBuffer = new ArrayBuffer(length * 2); // 16-bit audio
    const view = new DataView(arrayBuffer);
    
    // Fill with simple sine wave for demonstration
    for (let i = 0; i < length; i++) {
      const sample = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1; // 440Hz sine wave at low volume
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(i * 2, intSample, true);
    }
    
    return arrayBuffer;
  }
}

export const elevenLabsService = new ElevenLabsService();