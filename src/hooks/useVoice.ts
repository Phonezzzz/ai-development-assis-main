import { createContext, createElement, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceState } from '@/lib/types';
import { ttsService } from '@/lib/services/tts';
import { sttService } from '@/lib/services/stt';
import { toast } from 'sonner';

// Voice Interface (ElevenLabs)
interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}

// TTS State
interface TTSState {
  isPlaying: boolean;
  isAvailable: boolean;
  voices: Voice[];
  selectedVoice: string;
  isLoading?: boolean;
  currentMessageId?: string;
  error?: string;
}

// Voice Options
interface VoiceOptions {
  voiceId?: string;
  language?: string;
  model?: string;
}

interface VoiceContextValue {
  tts: {
    state: TTSState;
    speak: (text: string, options?: VoiceOptions) => Promise<void>;
    stop: () => void;
    isAvailable: boolean;
    voices: Voice[];
    selectedVoice: string;
    setSelectedVoice: (voiceId: string) => void;
  };
  stt: {
    state: VoiceState;
    startListening: () => Promise<void>;
    stopListening: () => void;
    clearTranscript: () => void;
    isSupported: boolean;
    isStarting: boolean;
  };
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice должен использоваться внутри VoiceProvider');
  }
  return ctx;
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  // TTS State (ElevenLabs)
  const [ttsState, setTTSState] = useState<TTSState>({
    isPlaying: false,
    isAvailable: ttsService.isAvailable(),
    voices: [],
    selectedVoice: localStorage.getItem('selected-voice') || 'EXAVITQu4vr4xnSDxMaL'
  });

  // STT State (ElevenLabs)
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    transcript: '',
    confidence: 0
  });

  const [isStarting, setIsStarting] = useState(false);

  // Refs for STT
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const sttAbortRef = useRef<AbortController | null>(null);

  // Load ElevenLabs voices
  const isLoadingVoicesRef = useRef(false);
  const voicesLoadedRef = useRef(false);

  useEffect(() => {
    if (voicesLoadedRef.current || isLoadingVoicesRef.current) {
      return;
    }

    if (!ttsService.isAvailable()) {
      setTTSState(prev => ({ ...prev, isAvailable: false, voices: [] }));
      return;
    }

    const loadVoices = async () => {
      const apiKey = localStorage.getItem('elevenlabs-api-key');
      if (!apiKey || apiKey.trim() === '') {
        const warningShown = sessionStorage.getItem('elevenlabs-warning-shown');
        if (!warningShown) {
          console.warn('⚠️ ElevenLabs API ключ не настроен');
          sessionStorage.setItem('elevenlabs-warning-shown', 'true');
        }
        setTTSState(prev => ({ ...prev, isAvailable: false, voices: [] }));
        return;
      }

      try {
        isLoadingVoicesRef.current = true;
        const voices = await ttsService.getVoices();
        setTTSState(prev => ({ ...prev, isAvailable: true, voices }));
        voicesLoadedRef.current = true;
      } catch (error: unknown) {
        console.error('Error loading ElevenLabs voices:', error);
        throw new Error(`Failed to load voices: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        isLoadingVoicesRef.current = false;
      }
    };

    loadVoices();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      const stream = mediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  // TTS Functions (ElevenLabs)
  const speak = useCallback(async (text: string, options?: VoiceOptions) => {
    if (!text.trim() || !ttsService.isAvailable()) {
      throw new Error('TTS не доступен или текст пустой');
    }

    try {
      setTTSState(prev => ({ ...prev, isPlaying: true }));

      const voiceId = options && options.voiceId ? options.voiceId : ttsState.selectedVoice;
      const modelId = options && options.model ? options.model : undefined;

      await ttsService.speak(text, voiceId, {
        model_id: modelId,
      });

      toast.success('Воспроизведение завершено');
    } catch (error) {
      console.error('TTS Error:', error);
      toast.error('Ошибка воспроизведения голоса');
      throw error;
    } finally {
      setTTSState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [ttsState.selectedVoice]);

  const stopTTS = useCallback(() => {
    try {
      ttsService.stop();
      setTTSState(prev => ({ ...prev, isPlaying: false }));
    } catch (error) {
      console.error('Error stopping TTS:', error);
      throw error;
    }
  }, []);

  const setSelectedVoice = useCallback((voiceId: string) => {
    localStorage.setItem('selected-voice', voiceId);
    setTTSState(prev => ({ ...prev, selectedVoice: voiceId }));
  }, []);

  // STT Functions (ElevenLabs)
  const cleanupMediaResources = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    mediaChunksRef.current = [];
  }, []);

  const startListening = useCallback(async () => {
    if (isStarting) return;

    setIsStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ];

      let supportedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          supportedMimeType = mimeType;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType || undefined
      });

      mediaRecorderRef.current = mediaRecorder;
      mediaChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          if (mediaChunksRef.current.length === 0) return;

          const blob = new Blob(mediaChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });

          setVoiceState(prev => ({ ...prev, isProcessing: true }));

          const ctrl = new AbortController();
          sttAbortRef.current = ctrl;

          if (!sttService.isConfigured()) {
            throw new Error('ElevenLabs STT не настроен');
          }

          const text = await sttService.transcribeAudio(blob, {
            languageCode: 'ru',
            modelId: 'scribe_v1',
            signal: ctrl.signal,
            timeoutMs: 60000
          });

          setVoiceState(prev => ({
            ...prev,
            transcript: text,
            confidence: 1,
            isProcessing: false,
            isListening: false
          }));

        } catch (err: unknown) {
          const message = err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message.toLowerCase()
            : '';

          if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
            console.warn('STT прерван пользователем');
            toast.info('Распознавание прервано');
          } else if (message.includes('413') || message.includes('too large')) {
            toast.error('Аудиофайл слишком большой');
          } else if (message.includes('timeout') || message.includes('504')) {
            toast.error('Время ожидания истекло');
          } else {
            console.error('ElevenLabs STT error:', err);
            toast.error('Ошибка распознавания речи');
          }

          setVoiceState(prev => ({
            ...prev,
            isProcessing: false,
            isListening: false
          }));
          throw err;
        } finally {
          sttAbortRef.current = null;
          cleanupMediaResources();
        }
      };

      mediaRecorder.start();
      setVoiceState(prev => ({ ...prev, isListening: true }));
      setIsStarting(false);
    } catch (error) {
      console.error('Failed to start ElevenLabs STT:', error);
      toast.error('Не удалось получить доступ к микрофону');
      setIsStarting(false);
      setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: false }));
      cleanupMediaResources();
      throw error;
    }
  }, [isStarting, cleanupMediaResources]);

  const stopListening = useCallback(() => {
    setIsStarting(false);
    setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: false }));

    if (sttAbortRef.current) {
      sttAbortRef.current.abort();
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    cleanupMediaResources();
  }, [cleanupMediaResources]);

  const clearTranscript = useCallback(() => {
    if (sttAbortRef.current) {
      sttAbortRef.current.abort();
    }
    sttAbortRef.current = null;
    mediaChunksRef.current = [];

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    cleanupMediaResources();

    setVoiceState(prev => ({
      ...prev,
      transcript: '',
      confidence: 0,
      isProcessing: false,
      isListening: false
    }));
  }, [cleanupMediaResources]);

  const contextValue = useMemo<VoiceContextValue>(() => ({
    tts: {
      state: ttsState,
      speak,
      stop: stopTTS,
      isAvailable: ttsState.isAvailable,
      voices: ttsState.voices,
      selectedVoice: ttsState.selectedVoice,
      setSelectedVoice,
    },
    stt: {
      state: voiceState,
      startListening,
      stopListening,
      clearTranscript,
      isSupported: sttService.isConfigured(),
      isStarting,
    },
  }), [clearTranscript, isStarting, setSelectedVoice, speak, startListening, stopListening, stopTTS, ttsState, voiceState]);

  return createElement(VoiceContext.Provider, { value: contextValue }, children);
}
