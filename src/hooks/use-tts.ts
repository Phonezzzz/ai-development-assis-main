import { useState, useCallback, useRef, useEffect } from 'react';
import { useKV } from '@/shims/spark-hooks';
import { elevenLabsService } from '@/lib/services/elevenlabs';

export interface TTSState {
  isPlaying: boolean;
  isLoading: boolean;
  currentText: string | null;
  error: string | null;
  currentMessageId: string | null;
}

// ElevenLabs voices - реальные ID голосов с поддержкой мультиязычности
export const ELEVENLABS_VOICES = [
  // Ваши предоставленные голоса
  { id: '21masSU9f4isSNm7Egqd', name: 'Голос 1 (Мультиязычный)' },
  { id: 'Ga0Zjw9ZBbevb3wIda0V', name: 'Голос 2 (Мультиязычный)' },
  { id: '0BcDz9UPwL3MpsnTeUlO', name: 'Голос 3 (Мультиязычный)' },
  { id: '2vlCRzCr5OBHeAZiklN6', name: 'Голос 4 (Мультиязычный)' },
  { id: '9J5k2YY8VppC3SZKZslk', name: 'Голос 5 (Мультиязычный)' },
  { id: 'aG9q1I1wTbfHh5sbpJnp', name: 'Голос 6 (Мультиязычный)' },
  
  // Стандартные премиум голоса ElevenLabs
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (Мужской, мультиязычный)' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Женский, мультиязычный)' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Мужской, мультиязычный)' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Женский, мультиязычный)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Мужской, мультиязычный)' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Женский, мультиязычный)' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Josh V2 (Мужской, мультиязычный)' },
  { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole (Женский, мультиязычный)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Мужской, британский)' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Женский, американский)' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Fin (Мужской, ирландский)' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Женский, американский)' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Мужской, американский)' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill (Мужской, американский)' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam (Мужской, американский)' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Freya (Женский, американский)' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave (Мужской, британский)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (Женский, американская)' },
  { id: 'g5CIjZEefAph4nQFvHAz', name: 'Glinda (Женский, американский)' },
  { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace (Женский, американский)' },
];

// Глобальный стор TTS: общее состояние и единый плеер для всех компонентов
let globalAudio: HTMLAudioElement | null = null;
let globalTTSState: TTSState = {
  isPlaying: false,
  isLoading: false,
  currentText: null,
  error: null,
  currentMessageId: null,
};
const ttsListeners = new Set<(s: TTSState) => void>();
const emitTTS = (patch: Partial<TTSState>) => {
  globalTTSState = { ...globalTTSState, ...patch };
  ttsListeners.forEach((l) => {
    try { l(globalTTSState); } catch {}
  });
};

export function useTTS() {
  const [ttsState, setTTSState] = useState<TTSState>(() => ({
    ...globalTTSState
  }));

  const [selectedVoice, setSelectedVoice] = useKV<string>('selected-voice', '21masSU9f4isSNm7Egqd'); // Ваш первый голос по умолчанию

  // Подписчик на обновления глобального стора
  useEffect(() => {
    const listener = (s: TTSState) => setTTSState(s);
    ttsListeners.add(listener);
    return () => {
      ttsListeners.delete(listener);
    };
  }, []);

  const playViaWebSpeech = useCallback((text: string, messageId: string) => {
    if (!('speechSynthesis' in window)) {
      return Promise.reject(new Error('Браузер не поддерживает синтез речи'));
    }

    try { speechSynthesis.cancel(); } catch {}

    emitTTS({ isPlaying: false, isLoading: true, currentText: text, error: null, currentMessageId: messageId });
    setTTSState({ isPlaying: false, isLoading: true, currentText: text, error: null, currentMessageId: messageId });

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.8;

      const handleStart = () => {
        emitTTS({ isLoading: false, isPlaying: true, currentMessageId: messageId, currentText: text, error: null });
        setTTSState(prev => ({ ...prev, isLoading: false, isPlaying: true, currentMessageId: messageId, currentText: text, error: null }));
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const handleEnd = () => {
        speechSynthesis.removeEventListener('voiceschanged', voiceListener);
        if (globalTTSState.currentMessageId === messageId) {
          emitTTS({ isPlaying: false, currentText: null, currentMessageId: null });
          setTTSState(prev => ({ ...prev, isPlaying: false, currentText: null, currentMessageId: null }));
        }
      };

      const handleError = (event: SpeechSynthesisErrorEvent | { error?: unknown }) => {
        speechSynthesis.removeEventListener('voiceschanged', voiceListener);
        console.error('Ошибка браузерного TTS:', event);
        if (globalTTSState.currentMessageId === messageId) {
          emitTTS({ isPlaying: false, isLoading: false, currentText: null, error: 'Ошибка браузерного TTS', currentMessageId: null });
          setTTSState({ isPlaying: false, isLoading: false, currentText: null, error: 'Ошибка браузерного TTS', currentMessageId: null });
        }
        if (!resolved) {
          resolved = true;
          const eventError = (event as SpeechSynthesisErrorEvent).error;
          const message =
            typeof eventError === 'string' && eventError.length > 0
              ? eventError
              : 'Ошибка браузерного TTS';
          reject(new Error(message));
        }
      };

      utterance.onstart = handleStart;
      utterance.onend = handleEnd;
      utterance.onerror = handleError as any;

      const assignVoice = () => {
        try {
          const voices = speechSynthesis.getVoices();
          const russianVoice = voices.find(voice =>
            voice.lang?.toLowerCase().includes('ru') ||
            voice.name?.toLowerCase().includes('russian') ||
            voice.name?.toLowerCase().includes('ru')
          );
          if (russianVoice) {
            utterance.voice = russianVoice;
            utterance.lang = russianVoice.lang;
          } else {
            utterance.lang = 'ru-RU';
          }
        } catch (assignError) {
          console.warn('Не удалось назначить голос Web Speech API:', assignError);
          utterance.lang = 'ru-RU';
        }
      };

      const startSpeaking = () => {
        try {
          speechSynthesis.speak(utterance);
        } catch (error) {
          handleError({ error });
        }
      };

      function voiceListener() {
        speechSynthesis.removeEventListener('voiceschanged', voiceListener);
        assignVoice();
        startSpeaking();
      }

      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener('voiceschanged', voiceListener, { once: true });
      } else {
        assignVoice();
        startSpeaking();
      }
    });
  }, [setTTSState]);
  const play = useCallback(async (text: string, messageId: string) => {
    try {
      if (!text.trim()) return;

      // Stop any current playback
      if (globalAudio) {
        globalAudio.pause();
        globalAudio.currentTime = 0;
        globalAudio = null;
      }
      if ('speechSynthesis' in window) {
        try { speechSynthesis.cancel(); } catch {}
      }

      // Обновляем состояние для нового сообщения
      emitTTS({ isPlaying: false, isLoading: true, currentText: text, error: null, currentMessageId: messageId });
      setTTSState({ isPlaying: false, isLoading: true, currentText: text, error: null, currentMessageId: messageId });

      if (!elevenLabsService.isConfigured()) {
        try {
          await playViaWebSpeech(text, messageId);
        } catch (browserError) {
          const message = browserError instanceof Error ? browserError.message : 'Ошибка браузерного TTS';
          if (globalTTSState.currentMessageId === messageId) {
            emitTTS({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
            setTTSState({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
          }
        }
        return;
      }

      // Генерация аудио через ElevenLabs сервис
      const arrayBuffer = await elevenLabsService.generateSpeech(text, {
        voice_id: selectedVoice,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: true,
        },
      });

      const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      if (audioBlob.size === 0) {
        throw new Error('Получен пустой аудио файл от ElevenLabs');
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      globalAudio = audio;

      audio.addEventListener('loadstart', () => {
        emitTTS({ isLoading: true, isPlaying: false, currentMessageId: messageId });
        setTTSState(prev => ({ ...prev, isLoading: true, isPlaying: false, currentMessageId: messageId }));
      });

      audio.addEventListener('canplay', () => {
        emitTTS({ isLoading: false, isPlaying: true, currentMessageId: messageId });
        setTTSState(prev => ({ ...prev, isLoading: false, isPlaying: true, currentMessageId: messageId }));
      });

      audio.addEventListener('ended', () => {
        if (globalTTSState.currentMessageId === messageId) {
          emitTTS({ isPlaying: false, currentText: null, currentMessageId: null });
          setTTSState(prev => ({ ...prev, isPlaying: false, currentText: null, currentMessageId: null }));
        }
        URL.revokeObjectURL(audioUrl);
        if (globalAudio === audio) {
          globalAudio = null;
        }
      });

      audio.addEventListener('error', () => {
        if (globalTTSState.currentMessageId !== messageId) return;
        URL.revokeObjectURL(audioUrl);
        if (globalAudio === audio) {
          globalAudio = null;
        }
        playViaWebSpeech(text, messageId).catch((fallbackError) => {
          console.error('Fallback WebSpeech error:', fallbackError);
          const message = fallbackError instanceof Error ? fallbackError.message : 'Ошибка TTS';
          if (globalTTSState.currentMessageId === messageId) {
            emitTTS({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
            setTTSState({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
          }
        });
      });

      await audio.play();

    } catch (error) {
      console.error('TTS Error:', error);
      try {
        await playViaWebSpeech(text, messageId);
        return;
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'Ошибка TTS';
        emitTTS({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
        setTTSState({ isPlaying: false, isLoading: false, currentText: null, error: message, currentMessageId: null });
      }
    }
  }, [selectedVoice, playViaWebSpeech]);

  // Совместимость: speak как алиас для play без id (глобальный случай)
  const speak = useCallback(async (text: string, messageId?: string) => {
    await play(text, messageId || 'global');
  }, [play]);

  const toggle = useCallback(async (messageId: string, text: string) => {
    if (ttsState.isPlaying && ttsState.currentMessageId === messageId) {
      // Останавливаем текущее именно это сообщение
      try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
      if (globalAudio) { try { globalAudio.pause(); } catch {} globalAudio = null; }
      emitTTS({ isPlaying: false, isLoading: false, currentText: null, currentMessageId: null, error: null });
      setTTSState({ isPlaying: false, isLoading: false, currentText: null, currentMessageId: null, error: null });
      return;
    }
    // Запускаем новое — предварительно останавливаем текущее
    if (globalAudio || ttsState.isPlaying) {
      try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
      if (globalAudio) { try { globalAudio.pause(); } catch {} globalAudio = null; }
    }
    await play(text, messageId);
  }, [ttsState.isPlaying, ttsState.currentMessageId, play]);

  const stop = useCallback(() => {
    try {
      // Остановка ElevenLabs аудио
      if (globalAudio) {
        try { globalAudio.pause(); } catch {}
        globalAudio = null;
      }
      
      // Остановка браузерного TTS
      if ('speechSynthesis' in window) {
        try { speechSynthesis.cancel(); } catch {}
      }
      
      emitTTS({ isPlaying: false, isLoading: false, currentText: null, error: null, currentMessageId: null });
      setTTSState({ isPlaying: false, isLoading: false, currentText: null, error: null, currentMessageId: null });
    } catch (error) {
      console.error('Error stopping TTS:', error);
    }
  }, []);

  const isAvailable = useCallback(() => {
    return elevenLabsService.isConfigured();
  }, []);

  return {
    ttsState,
    speak,
    play,
    toggle,
    stop,
    isAvailable,
    voices: ELEVENLABS_VOICES,
    selectedVoice,
    setSelectedVoice,
  };
}