/**
 * Hook для управления историей сообщений и сессиями изображений
 */

import { useCallback } from 'react';
import { Message, GeneratedImage } from '@/lib/types';
import { useKV } from '@/shims/spark-hooks';

interface ImageSession {
  id: string;
  title: string;
  messages: Message[];
  images: GeneratedImage[];
  timestamp: Date;
  model: string;
}

export function useImageHistory() {
  // KV stores
  const [imageMessages, setImageMessages] = useKV<Message[]>('image-creation-messages', []);
  const [imageSessions, setImageSessions] = useKV<ImageSession[]>('image-chat-sessions', []);

  /**
   * Добавляет сообщение в историю
   */
  const addMessage = useCallback((message: Message) => {
    setImageMessages(prev => [...prev, message]);
  }, [setImageMessages]);

  /**
   * Обновляет последнее сообщение ассистента
   */
  const updateLastAssistantMessage = useCallback((messageId: string, content: string) => {
    setImageMessages(prev =>
      prev.map(msg =>
        msg.id === messageId
          ? { ...msg, content }
          : msg
      )
    );
  }, [setImageMessages]);

  /**
   * Добавляет новую сессию
   */
  const addSession = useCallback((session: ImageSession) => {
    setImageSessions(prev => [...prev, session]);
  }, [setImageSessions]);

  /**
   * Очищает историю текущей сессии
   */
  const clearHistory = useCallback(() => {
    setImageMessages([]);
  }, [setImageMessages]);

  /**
   * Создаёт новую сессию из текущей истории
   */
  const createSessionFromHistory = useCallback((
    currentImages: GeneratedImage[],
    model: string
  ) => {
    const userMessages = imageMessages.filter(msg => msg.type === 'user');
    const sessionTitle = userMessages.length > 0
      ? userMessages[0].content.substring(0, 50)
      : 'Новая сессия';

    const sessionId = `img_session_${Date.now()}`;
    const newSession: ImageSession = {
      id: sessionId,
      title: sessionTitle,
      messages: imageMessages,
      images: currentImages,
      timestamp: new Date(),
      model,
    };

    addSession(newSession);
    return newSession;
  }, [imageMessages, addSession]);

  return {
    imageMessages,
    imageSessions,
    addMessage,
    updateLastAssistantMessage,
    addSession,
    clearHistory,
    createSessionFromHistory,
  };
}
