import { useKV } from '@/shims/spark-hooks';
import { GeneratedImage, Message } from '@/lib/types';

export function useImageCreator() {
  const [images, setImages] = useKV<GeneratedImage[]>('generated-images', []);
  const [imageMessages, setImageMessages] = useKV<Message[]>('image-creation-messages', []);
  const [imageSessions, setImageSessions] = useKV<Array<{
    id: string;
    title: string;
    messages: Message[];
    images: GeneratedImage[];
    timestamp: Date;
    model: string;
  }>>('image-chat-sessions', []);

  const startNewImageChat = () => {
    // Сохраняем текущую сессию если есть сообщения или изображения
    if (imageMessages.length > 0 || images.length > 0) {
      const sessionId = `img_session_${Date.now()}`;
      const userMessages = imageMessages.filter(msg => msg.type === 'user');
      const sessionTitle = userMessages.length > 0
        ? userMessages[0].content.substring(0, 50) + (userMessages[0].content.length > 50 ? '...' : '')
        : `Сессия с ${images.length} изображениями`;

      const newSession = {
        id: sessionId,
        title: sessionTitle,
        messages: [...imageMessages],
        images: [...images],
        timestamp: new Date(),
        model: 'Image Creator'
      };

      setImageSessions(prev => [newSession, ...prev]);
    }

    // Очищаем текущие данные
    setImageMessages([]);
    setImages([]);
  };

  return {
    images,
    imageMessages,
    imageSessions,
    startNewImageChat,
    hasActiveSession: imageMessages.length > 0 || images.length > 0
  };
}