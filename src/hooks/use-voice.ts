import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { VoiceState } from '@/lib/types';
import { useTTS } from '@/hooks/use-tts';
import { sttService } from '@/lib/services/stt';

export function useVoiceRecognition() {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    transcript: '',
    confidence: 0,
  });
  // Реактивная поддержка STT
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const manualStopRef = useRef(false);
  const restartAttemptsRef = useRef(0);
  const MAX_RESTARTS = 3;
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // Fallback-рекордер и буфер данных
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const useFallbackRef = useRef(false);
  const networkErrorCountRef = useRef(0);
  const sttAbortRef = useRef<AbortController | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Инициализируем TTS на верхнем уровне хука (соблюдая правила хуков)
  const tts = useTTS();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (SpeechRecognition) {
          const recognitionInstance = new SpeechRecognition();
          recognitionInstance.continuous = true;
          recognitionInstance.interimResults = true;
          recognitionInstance.lang = 'ru-RU'; // Changed to Russian
          try { (recognitionInstance as any).maxAlternatives = 1; } catch {}
          
          recognitionRef.current = recognitionInstance;
          setIsSupported(true);
        } else {
          // Если WebSpeech API недоступен — проверяем наличие доступного getUserMedia для fallback
          setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia));
        }
      } else {
        setIsSupported(false);
      }
    } catch (error) {
      console.warn('Speech API not available:', error);
      // Пытаемся разрешить fallback по mediaDevices
      setIsSupported(Boolean(navigator.mediaDevices?.getUserMedia));
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        // Остановить MediaRecorder и освободить поток
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== 'inactive') {
          try { rec.stop(); } catch {}
        }
        const s = mediaStreamRef.current;
        if (s) {
          s.getTracks().forEach(t => { try { t.stop(); } catch {} });
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
      } catch {}
      try { sttAbortRef.current?.abort(); } catch {}
      sttAbortRef.current = null;
    };
  }, []);

  // Fallback запись с микрофона и транскрипция через OpenRouter Whisper
  const startMediaRecording = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Браузер не поддерживает запись аудио');
        return;
      }
      if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
        toast.error('Нет подключения к интернету');
        return;
      }
      if (mediaRecorderRef.current) return; // уже идёт запись
      const stream = mediaStreamRef.current || await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mime =
        (window as any).MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : (window as any).MediaRecorder?.isTypeSupported?.('audio/webm') ? 'audio/webm'
        : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = rec;
      mediaChunksRef.current = [];
      // Мгновенное обновление UI состояния
      setVoiceState(prev => ({ ...prev, isListening: true, isProcessing: false, transcript: '' }));
      rec.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      rec.onerror = (e: any) => {
        console.error('MediaRecorder error:', e?.error || e);
        toast.error('Ошибка записи аудио');
        // Мгновенное обновление UI при ошибке
        setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: false }));
      };
      rec.onstop = async () => {
        try {
          setVoiceState(prev => ({ ...prev, isProcessing: true }));
          const blob = new Blob(mediaChunksRef.current, { type: mime || 'audio/webm' });
          mediaChunksRef.current = [];
          // Настраиваем AbortController для запроса STT
          try { sttAbortRef.current?.abort(); } catch {}
          const ctrl = new AbortController();
          sttAbortRef.current = ctrl;

          if (!sttService.isConfigured()) {
            throw new Error('STT недоступен: не настроен серверный ключ');
          }
          const text = await sttService.transcribeAudio(blob, { language: 'ru', signal: ctrl.signal, timeoutMs: 60000 });
          setVoiceState(prev => ({
            ...prev,
            transcript: text,
            confidence: 1,
            isProcessing: false,
            isListening: false,
          }));
        } catch (err: any) {
          const message = String(err?.message || '').toLowerCase();
          if (err?.name === 'AbortError') {
            console.warn('STT aborted by user');
            toast.info('Распознавание отменено');
          } else if (message.includes('413') || message.includes('too large') || message.includes('payload too large') || message.includes('file too large')) {
            toast.error('Превышен лимит длины/размера записи');
          } else if (message.includes('timeout') || message.includes('504')) {
            toast.error('Превышен таймаут распознавания');
          } else if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
            toast.error('Нет подключения к интернету');
          } else {
            console.error('STT transcribe error:', err);
            toast.error('Не удалось распознать речь');
          }
          setVoiceState(prev => ({ ...prev, isProcessing: false, isListening: false }));
        } finally {
          sttAbortRef.current = null;
          try {
            const s = mediaStreamRef.current;
            if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
          } catch {}
          mediaRecorderRef.current = null;
        }
      };
      rec.start();
    } catch (e) {
      console.error('Failed to start media recording:', e);
      toast.error('Доступ к микрофону отклонён или недоступен');
      setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: false }));
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isStarting) return; // Защита от повторных кликов
    setIsStarting(true);
    
    const recognition = recognitionRef.current;
    const hasSR = Boolean(recognition);
    // Требование secure origin для SpeechRecognition в браузерах
    try {
      const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (typeof window !== 'undefined' && !window.isSecureContext && !isLocalhost) {
        // WebSpeech в небезопасном контексте обычно не работает — сразу включаем fallback
        useFallbackRef.current = true;
      } else {
        useFallbackRef.current = false;
      }
    } catch {}
    try {
      manualStopRef.current = false;
      restartAttemptsRef.current = 0;
      networkErrorCountRef.current = 0;
      // Если WebSpeech отсутствует или нельзя использовать — fallback запись
      if (useFallbackRef.current || !hasSR) {
        await startMediaRecording();
        setIsStarting(false);
        return;
      }
      // Безопасная ссылка на SR после проверок
      const rec = recognitionRef.current as SpeechRecognition | null;
      if (!rec) {
        await startMediaRecording();
        setIsStarting(false);
        return;
      }
      // Мгновенное обновление UI состояния перед вызовом движка
      setVoiceState((prev) => ({
        ...prev,
        isListening: true,
        isProcessing: false,
        transcript: '',
      }));
      
      // Добавлено: фикс статуса при старте прослушивания
      (rec as any).onstart = () => {
        setVoiceState((prev) => ({
          ...prev,
          isListening: true,
          isProcessing: false,
        }));
        setIsStarting(false);
      };

      rec.onresult = (event) => {
        try {
          // Исправлено: корректная выборка результата распознавания
          const results = (event as any).results as SpeechRecognitionResultList;
          const lastIndex = results.length - 1;
          const speechResult = results?.[lastIndex] as any;
          const alternative = speechResult?.[0];
          const transcript = alternative?.transcript || '';
          const confidence = alternative?.confidence ?? 0;

          setVoiceState((prev) => ({
            ...prev,
            transcript,
            confidence,
            isProcessing: !(speechResult?.isFinal === true),
          }));
        } catch (error) {
          console.error('Error processing speech result:', error);
        }
      };

      rec.onerror = (event: any) => {
        const err = event?.error || 'unknown';
        console.error('Speech recognition error:', err);
        setIsStarting(false);

        // Сразу переключаемся на fallback при network (часто из-за контекста)
        if (err === 'network' && !manualStopRef.current) {
          networkErrorCountRef.current += 1;
          try { rec.stop(); } catch {}
          useFallbackRef.current = true;
          startMediaRecording();
          return;
        }

        // Блокировки доступа к микрофону — сообщаем пользователю и выходим
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          toast.error('Доступ к микрофону запрещён. Разрешите доступ в настройках браузера.');
          manualStopRef.current = true;
          setVoiceState((prev) => ({ ...prev, isListening: false, isProcessing: false }));
          // Освобождаем микрофон
          try {
            const s = mediaStreamRef.current;
            if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
          } catch {}
          return;
        }

        // Нет микрофона / не удалось захватить аудио
        if (err === 'audio-capture') {
          toast.error('Микрофон не найден или занят другой программой.');
          manualStopRef.current = true;
          setVoiceState((prev) => ({ ...prev, isListening: false, isProcessing: false }));
          try {
            const s = mediaStreamRef.current;
            if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
          } catch {}
          return;
        }

        // Временные сетевые/тишина ошибки — пытаемся перезапустить до MAX_RESTARTS
        if ((err === 'network' || err === 'no-speech' || err === 'aborted') && !manualStopRef.current) {
          if (restartAttemptsRef.current < MAX_RESTARTS) {
            restartAttemptsRef.current += 1;
            setVoiceState((prev) => ({ ...prev, isListening: true, isProcessing: false }));
            setTimeout(() => {
              try { rec.start(); } catch (e) { console.error('Restart after error failed:', e); }
            }, 350);
            return;
          }
        }

        // Иные ошибки — останавливаемся
        setVoiceState((prev) => ({ ...prev, isListening: false, isProcessing: false }));
        try {
          const s = mediaStreamRef.current;
          if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
        } catch {}
      };

      rec.onend = () => {
        setIsStarting(false);
        // Если пользователь не нажимал стоп и у нас остались попытки — автоперезапуск
        if (!manualStopRef.current && restartAttemptsRef.current < MAX_RESTARTS) {
          restartAttemptsRef.current += 1;
          try { rec.start(); } catch (e) { console.error('Auto-restart onend failed:', e); }
          // Оставляем isListening=true, чтобы UI не мигал
          setVoiceState((prev) => ({ ...prev, isListening: true, isProcessing: false }));
        } else {
          setVoiceState((prev) => ({ ...prev, isListening: false, isProcessing: false }));
          // Освобождаем микрофон
          try {
            const s = mediaStreamRef.current;
            if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
          } catch {}
        }
      };

      // Добавлено: обработка отмены распознавания
      (rec as any).oncancel = () => {
        setIsStarting(false);
        setVoiceState((prev) => ({ ...prev, isListening: false, isProcessing: false }));
        try {
          const s = mediaStreamRef.current;
          if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
        } catch {}
      };

      // Добавлено: обработка окончания аудио
      (rec as any).onaudioend = () => {
        // Если это не ручная остановка, продолжаем слушать
        if (!manualStopRef.current) {
          setVoiceState((prev) => ({ ...prev, isProcessing: false }));
        }
      };

      rec.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      setIsStarting(false);
      setVoiceState((prev) => ({
        ...prev,
        isListening: false,
        isProcessing: false,
      }));
      // Освобождаем микрофон
      try {
        const s = mediaStreamRef.current;
        if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
      } catch {}
    }
  }, [startMediaRecording, isStarting]);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    setIsStarting(false);
    // Мгновенное обновление UI состояния перед остановкой движка
    setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: false }));
    // Отменяем активный STT-запрос, если есть
    try { sttAbortRef.current?.abort(); } catch {}
    // Если идёт fallback-запись — останавливаем MediaRecorder
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch {}
      return;
    }
    // Иначе — останавливаем WebSpeech
    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }
    try {
      recognition.stop();
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
      try {
        (recognition as any).abort?.();
      } catch (e) {
        console.error('Error aborting speech recognition:', e);
      }
    } finally {
      try {
        const s = mediaStreamRef.current;
        if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
      } catch {}
    }
  }, []);

  const speak = useCallback(async (text: string) => {
    try {
      // Используем централизованный TTS (внутри уже есть fallback на браузерный)
      await tts.speak(text);
    } catch (error) {
      console.error('Error with speech synthesis:', error);
      // Финальный фолбэк на браузерный TTS
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ru-RU';
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [tts.speak]);

  const clearTranscript = useCallback(() => {
    try { sttAbortRef.current?.abort(); } catch {}
    sttAbortRef.current = null;
    mediaChunksRef.current = [];
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch {} }
      mediaRecorderRef.current = null;
      const s = mediaStreamRef.current;
      if (s) { s.getTracks().forEach(t => { try { t.stop(); } catch {} }); mediaStreamRef.current = null; }
    } catch {}
    setVoiceState(prev => ({ ...prev, transcript: '', confidence: 0, isProcessing: false, isListening: false }));
  }, []);

  return {
    voiceState,
    startListening,
    stopListening,
    speak,
    isSupported,
    clearTranscript,
    isStarting, // Добавляем состояние старта для защиты от повторных кликов
  };
}