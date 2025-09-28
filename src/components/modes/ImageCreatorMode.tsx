import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ModernChatInput } from '@/components/ModernChatInput';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { GeneratedImage, WorkspaceMode, Message } from '@/lib/types';
import { useKV } from '@/shims/spark-hooks';
import { useImageModelSelection } from '@/hooks/use-image-model-selection';
import { imageGenerationService } from '@/lib/services/image-generation';
import type { ChatCompletionRequest } from '@/lib/services/openrouter';
import { openRouterService } from '@/lib/services/openrouter';
import { formatDisplayDate } from '@/lib/utils';
import { Image, Download, Trash, Plus, User, Robot, Square } from '@phosphor-icons/react';
import { useTTS } from '@/hooks/use-tts';

// Добавлено: кнопки действий над сообщением (в т.ч. TTS)
import { MessageActions } from '@/components/MessageActions';

// Управление детализацией логов в компоненте
const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';
interface ImageCreatorModeProps {
  messages?: any[];
  onSendMessage?: (text: string, mode: WorkspaceMode, isVoice?: boolean) => void;
  isProcessing?: boolean;
  showGallery?: boolean;
  onToggleGallery?: () => void;
}

export function ImageCreatorMode({ onSendMessage, showGallery = false, onToggleGallery }: ImageCreatorModeProps) {
  // KV stores
  const [images, setImages] = useKV<GeneratedImage[]>('generated-images', []);
  const [imageMessages, setImageMessages] = useKV<Message[]>('image-creation-messages', []);
  const [allImages, setAllImages] = useKV<GeneratedImage[]>('all-generated-images', []);
  const [imageSessions, setImageSessions] = useKV<Array<{
    id: string;
    title: string;
    messages: Message[];
    images: GeneratedImage[];
    timestamp: Date;
    model: string;
  }>>('image-chat-sessions', []);

  // Синхронизируем глобальную галерею как объединение изображений из всех сессий и текущей сессии
  useEffect(() => {
    const fromSessions = imageSessions.flatMap(session => session.images || []);
    const fromCurrent = images || [];
    const combined = [...fromSessions, ...fromCurrent];

    const uniqueCombined = combined.filter((image, index, self) =>
      index === self.findIndex(img => img.id === image.id)
    );

    // Обновляем только если состав изменился
    const differsByLength = uniqueCombined.length !== allImages.length;
    const differsByIds =
      differsByLength ||
      uniqueCombined.some(img => !allImages.find(existing => existing.id === img.id)) ||
      allImages.some(img => !uniqueCombined.find(existing => existing.id === img.id));

    if (differsByIds) {
      setAllImages(uniqueCombined);
    }
  }, [imageSessions, images, allImages.length, setAllImages]);

  // Добавлено: refs для отмены стриминга и TTS
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const isStreamCancelledRef = useRef(false);
  const { speak: ttsSpeak, stop: ttsStop, ttsState } = useTTS();

  const [isGenerating, setIsGenerating] = useState(false);
  const { currentImageModel } = useImageModelSelection();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Останавливаем TTS при размонтировании компонента
  useEffect(() => {
    return () => {
      try { ttsStop(); } catch {}
    };
  }, [ttsStop]);

  // Функция для прокрутки к низу чата
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      // Ищем ScrollArea viewport
      const scrollArea = chatScrollRef.current.closest('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      } else {
        // Fallback для обычного скролла
        chatScrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  };

  // Автоматически прокручиваем при новых сообщениях
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [imageMessages]);

  // Также прокручиваем при завершении генерации
  useEffect(() => {
    if (!isGenerating) {
      const timer = setTimeout(() => {
        scrollToBottom();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isGenerating]);

  // Функция для сброса зависших изображений
  const resetStuckImages = () => {
    setImages((prev) => (prev || []).map(img =>
      img.isGenerating ? { ...img, isGenerating: false, url: '' } : img
    ).filter(img => img.url !== ''));
    setIsGenerating(false);
  };

  // Функция для отмены текущей генерации
  const cancelGeneration = () => {
    setIsGenerating(false);
    setImages((prev) => (prev || []).filter(img => !img.isGenerating));
    // Добавлено: отмена активного стрима ответа модели и остановка озвучки
    try {
      isStreamCancelledRef.current = true;
      streamReaderRef.current?.cancel().catch(() => {});
    } catch {}
    streamReaderRef.current = null;
    ttsStop();
  };

  // Функция для создания нового чата Image Creator (локальная, если нужно)
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
        model: currentImageModel?.name || 'Unknown Model'
      };

      setImageSessions(prev => [newSession, ...prev]);

      // Добавляем изображения из текущей сессии в общую галерею
      if (images.length > 0) {
        setAllImages(prev => [...images, ...prev]);
      }
    }

    // Очищаем текущие данные
    setImageMessages([]);
    setImages([]);
    setIsGenerating(false);
  };


  const deleteImage = (imageId: string) => {
    setImages((prev) => (prev || []).filter(img => img.id !== imageId));
  };

  const downloadImage = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {showGallery ? (
        /* Gallery Mode */
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Галерея изображений</h2>
            <Button variant="outline" onClick={onToggleGallery}>
              Назад к чату
            </Button>
          </div>
          <ScrollArea className="h-full">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allImages.map((image) => (
                <Card key={image.id} className="overflow-hidden">
                  <div className="aspect-square relative">
                    <img
                      src={image.url}
                      alt={image.prompt}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => downloadImage(image.url, `image-${image.id}.jpg`)}
                        className="h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white border-0"
                      >
                        <Download size={14} />
                      </Button>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2 mb-2">
                      {image.prompt}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {formatDisplayDate(image.timestamp)}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        /* Chat Mode */
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left Chat Area */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1 p-3 min-h-0">
                <div ref={chatScrollRef}>
                  {imageMessages.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <div className="text-4xl mb-4">💬</div>
                      <h3 className="font-semibold text-lg mb-2">Начните разговор с ИИ</h3>
                      <p className="text-sm">Можете попросить создать изображение или просто поговорить</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {imageMessages.map((message) => (
                        <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {message.type === 'user' ? (
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                              <MarkdownMessage content={message.content} className="prose-primary text-sm" />
                              <p className="text-xs text-muted-foreground mt-2">
                                {formatDisplayDate(message.timestamp)}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <MarkdownMessage content={message.content} className="prose-default text-sm" />
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                  {formatDisplayDate(message.timestamp)}
                                </div>
                                <MessageActions
                                  message={message.content}
                                  messageId={message.id}
                                  isGenerating={isGenerating && message.id === imageMessages[imageMessages.length - 1]?.id}
                                  onStopGeneration={cancelGeneration}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="h-1" />
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right Image Workspace */}
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-3">
                {images.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <div className="text-4xl mb-4">🎨</div>
                    <h3 className="font-semibold text-lg mb-2">Создайте первое изображение</h3>
                    <p className="text-sm">
                      Попросите ИИ создать изображение, и оно появится здесь
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {images.map((image, index) => (
                      <div key={image.id} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            Изображение #{index + 1}
                          </Badge>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadImage(image.url, `image-${image.id}.jpg`)}
                              className="h-8 w-8 p-0"
                            >
                              <Download size={14} />
                            </Button>
                          </div>
                        </div>

                        <div className="relative">
                          {image.isGenerating ? (
                            <div className="aspect-square bg-muted flex items-center justify-center rounded-lg">
                              <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                                <p className="text-lg font-medium">Генерация...</p>
                                <p className="text-sm text-muted-foreground mt-2">
                                  {image.prompt}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <img
                              src={image.url}
                              alt={image.prompt}
                              className="w-full rounded-lg shadow-lg"
                            />
                          )}
                        </div>

                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm font-medium mb-2">Промт:</p>
                          <p className="text-sm text-muted-foreground">
                            {image.prompt}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDisplayDate(image.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Chat Input - Always visible at bottom */}
      <div className="p-4 bg-card/80 backdrop-blur-sm flex-shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            Модель: {currentImageModel?.name || 'Не выбрана'}
          </Badge>
          {isGenerating && (
            <Button
              variant="destructive"
              size="sm"
              onClick={cancelGeneration}
              className="h-6 text-xs flex items-center gap-1"
            >
              <Square size={12} />
              Остановить генерацию
            </Button>
          )}
          {images.some(img => img.isGenerating) && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetStuckImages}
              className="h-6 text-xs"
            >
              Сбросить зависшие
            </Button>
          )}
        </div>
        <ModernChatInput
          onSubmit={(text, mode, isVoice) => {
            if (text.trim()) {
              handleUserMessage(text, isVoice);
            }
          }}
          placeholder="Поговорите с ИИ или попросите создать изображение..."
          disabled={isGenerating}
        />
      </div>
    </div>
  );

  // Детектор «запроса на изображение»: поддержка RU/EN и типичных формулировок
  function isImageRequest(text: string): boolean {
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

  async function handleUserMessage(text: string, isVoice: boolean = false) {
    const clean = text.trim();
    if (!clean) return;

    try {
      // Проверяем API ключ
      if (!imageGenerationService.isConfigured()) {
        throw new Error('OpenRouter API ключ не настроен. Проверьте переменную VITE_OPENROUTER_API_KEY в .env.local');
      }

      // Если пользователь просит ИЗОБРАЖЕНИЕ — переключаемся на сервис генерации изображений
      if (isImageRequest(clean)) {
        if (DEBUG) console.log('Routing to image generation service with prompt');
        await generateImageFromPrompt(clean);
        return;
      }

      // Иначе — обычный текстовый диалог (стриминг)
      const userMessage: Message = {
        id: `msg_${Date.now()}_user`,
        type: 'user',
        content: clean,
        timestamp: new Date(),
        isVoice: isVoice,
      };

      setImageMessages((prev) => [...prev, userMessage]);
      setIsGenerating(true);

      let timeoutId: NodeJS.Timeout | null = null;

      // Неполный лог, поскольку `import.meta.env.DEV` возвращает false в продакшн, однако запрос попадает в продакшн.
      if (DEBUG) console.log('Sending chat message to image model:', currentImageModel?.id);

      // Отправляем сообщение модели для обычного чата (без принудительной генерации изображения)
      const chatRequest: ChatCompletionRequest = {
        model: currentImageModel?.id || "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: 'system',
            content: "Ты помощник, который может общаться и создавать изображения. Если пользователь просит создать, нарисовать, сгенерировать изображение, то создай изображение. В остальных случаях просто отвечай текстом."
          },
          {
            role: 'user',
            content: clean
          }
        ],
        modalities: ['text', 'image'],
        stream: true
      };

      const reader = await openRouterService.createChatCompletionStream(chatRequest);
      const decoder = new TextDecoder();
      // Добавлено: сохраняем reader и сбрасываем флаг отмены
      isStreamCancelledRef.current = false;
      streamReaderRef.current = reader;

      let assistantMessage = '';
      let assistantMessageId = `msg_${Date.now()}_assistant`;
      let foundImage = false;

      // Добавляем предварительное сообщение ассистента
      const initialAssistantMessage: Message = {
        id: assistantMessageId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        isVoice: false,
      };

      setImageMessages((prev) => [...prev, initialAssistantMessage]);

      // Таймаут для генерации изображений (30 секунд)
      timeoutId = setTimeout(() => {
        if (DEBUG) console.log('Image generation timeout - resetting stuck images');
        resetStuckImages();
      }, 30000);

      let incompleteData = '';

      while (true) {
        // Прерывание по требованию пользователя
        if (isStreamCancelledRef.current) {
          try { await reader.cancel(); } catch {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) {
          // Обрабатываем оставшиеся неполные данные
          if (incompleteData.trim() && (incompleteData.trim().startsWith('data:') || incompleteData.trim().startsWith('data: '))) {
            const trimmed = incompleteData.trim();
            const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trim();
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                if (DEBUG) console.log('Processing final incomplete chunk');
                if (parsed.choices && parsed.choices[0]) {
                  const delta = parsed.choices[0].delta;

                  // Обработка изображений в финальном чанке
                  if (delta?.images && Array.isArray(delta.images) && delta.images.length > 0) {
                    for (const image of delta.images) {
                      if (image?.image_url?.url) {
                        foundImage = true;
                        await handleGeneratedImage(image.image_url.url, clean);
                        break;
                      }
                    }
                  }

                  // Обработка текста в финальном чанке
                  if (delta?.content) {
                    assistantMessage += delta.content;
                    setImageMessages((prev) => prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: assistantMessage }
                        : msg
                    ));
                  }
                }
              } catch (e) {
                if (DEBUG) console.log('Failed to parse final chunk (debug)', e);
              }
            }
          }
          break;
        }

        const chunk = decoder.decode(value);
        const fullChunk = incompleteData + chunk;
        const lines = fullChunk.split('\n');

        // Последняя строка может быть неполной
        incompleteData = lines.pop() || '';

        for (const line of lines) {
          // Улучшенная обработка SSE чанков
          const trimmed = line.trim();
          if (!trimmed) continue; // пропуск пустых строк
          if (!(trimmed.startsWith('data:') || trimmed.startsWith('data: '))) continue; // пропуск не-SSE линий
          const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5).trim();
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]) {
                const delta = parsed.choices[0].delta;

                // Обработка текста
                if (delta?.content) {
                  assistantMessage += delta.content;

                  // Обновляем сообщение ассистента в реальном времени
                  setImageMessages((prev) => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: assistantMessage }
                      : msg
                  ));
                }

                // Обработка изображений
                if (delta?.images && Array.isArray(delta.images) && delta.images.length > 0) {
                  for (const image of delta.images) {
                    if (image?.image_url?.url) {
                      foundImage = true;
                      await handleGeneratedImage(image.image_url.url, clean);
                      break;
                    }
                  }
                }
              }
            } catch (e) {
              // Без дампа содержимого чанков, чтобы не шуметь и не утекали данные
              if (DEBUG) console.log('Failed to parse JSON chunk (debug)', e);
            }
          }
        }
      }

      // Очищаем таймаут
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      // Очистка ссылок на стрим
      streamReaderRef.current = null;
      isStreamCancelledRef.current = false;

      // Если не было найдено изображений, просто завершаем текстовый ответ
      if (!foundImage && assistantMessage.trim()) {
        setImageMessages((prev) => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: assistantMessage.trim() || 'Получен пустой ответ от модели.' }
            : msg
        ));
        // Добавлено: авто-озвучка ответа, если запрос был голосовым
        if (isVoice && !isStreamCancelledRef.current) {
          try {
            ttsStop();
            await ttsSpeak(assistantMessage.trim());
          } catch {}
        }
      }

    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);

      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        type: 'assistant',
        content: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        timestamp: new Date(),
        isVoice: false,
      };

      setImageMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
      // Гарантированная очистка стрима
      streamReaderRef.current = null;
      isStreamCancelledRef.current = false;
    }
  }

  async function handleGeneratedImage(imageUrl: string, originalPrompt: string) {
    if (DEBUG) console.log('Processing generated image');
    // Проверяем, что изображение действительно было сгенерировано
    if (!imageUrl || imageUrl.trim() === '') {
      console.error('Empty image URL received');
      return;
    }

    const imageId = `img_${Date.now()}`;
    const newImage: GeneratedImage = {
      id: imageId,
      prompt: originalPrompt,
      url: imageUrl,
      timestamp: new Date(),
      isGenerating: false,
    };

    // Удаляем зависшие изображения и добавляем новое
    setImages((prev) => {
      const cleanedImages = (prev || []).filter(img => !img.isGenerating);
      return [newImage, ...cleanedImages];
    });

    // Добавляем сообщение об успешном создании изображения
    const completionMessage: Message = {
      id: `msg_${Date.now()}_completion`,
      type: 'assistant',
      content: `✅ Изображение создано успешно! Результат добавлен в галерею.`,
      timestamp: new Date(),
      isVoice: false,
    };

    setImageMessages((prev) => [...prev, completionMessage]);
  }

  async function generateImageFromPrompt(promptText: string) {
    // Добавляем пользовательское сообщение
    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      type: 'user',
      content: promptText.trim(),
      timestamp: new Date(),
      isVoice: false,
    };

    setImageMessages((prev) => [...prev, userMessage]);

    const imageId = `img_${Date.now()}`;
    const newImage: GeneratedImage = {
      id: imageId,
      prompt: promptText.trim(),
      url: '', // Будет заполнен после генерации
      timestamp: new Date(),
      isGenerating: true,
    };

    setImages((prev) => [newImage, ...(prev || [])]);
    setIsGenerating(true);

    // Добавляем системное сообщение о начале генерации
    const systemMessage: Message = {
      id: `msg_${Date.now()}_system`,
      type: 'assistant',
      content: `🎨 Начинаю создание изображения с помощью ${currentImageModel?.name}...`,
      timestamp: new Date(),
      isVoice: false,
    };

    setImageMessages((prev) => [...prev, systemMessage]);

    try {
      // Проверяем API ключ
      if (!imageGenerationService.isConfigured()) {
        throw new Error('OpenRouter API ключ не настроен. Проверьте переменную VITE_OPENROUTER_API_KEY в .env.local');
      }

      if (DEBUG) console.log('Generating image with model:', currentImageModel?.id);
      
      // Реальная генерация через API с прогрессивной загрузкой
      const result = await imageGenerationService.generateImage({
        prompt: promptText.trim(),
        model: currentImageModel?.id || "google/gemini-2.5-flash-image-preview",
        onProgress: (partialImageUrl, status) => {
          if (DEBUG) console.log('Progress update');
          if (partialImageUrl) {
            // Обновляем изображение с полученным URL
            setImages((prev) => (prev || []).map(img =>
              img.id === imageId
                ? { ...img, isGenerating: false, url: partialImageUrl }
                : img
            ));
          }

          // Добавляем сообщение о статусе
          if (status) {
            const statusMessage: Message = {
              id: `msg_${Date.now()}_status`,
              type: 'assistant',
              content: `🔄 ${status}`,
              timestamp: new Date(),
              isVoice: false,
            };

            setImageMessages((prev) => {
              // Заменяем последнее статусное сообщение или добавляем новое
              const lastMessage = prev[prev.length - 1];
              if (lastMessage && lastMessage.content.startsWith('🔄')) {
                return [...prev.slice(0, -1), statusMessage];
              } else {
                return [...prev, statusMessage];
              }
            });
          }
        }
      });

      if (DEBUG) console.log('Image generation result');
      console.log('Image generation result:', result);

      if (result.success && result.imageUrl) {
        // Обновляем изображение с реальным URL
        setImages((prev) => (prev || []).map(img => 
          img.id === imageId 
            ? { ...img, isGenerating: false, url: result.imageUrl! }
            : img
        ));

        // Добавляем сообщение об успешном завершении
        const completionMessage: Message = {
          id: `msg_${Date.now()}_completion`,
          type: 'assistant',
          content: `✅ Изображение создано успешно! Результат добавлен в галерею.`,
          timestamp: new Date(),
          isVoice: false,
        };

        setImageMessages((prev) => [...prev, completionMessage]);
      } else {
        // Ошибка генерации
        setImages((prev) => (prev || []).filter(img => img.id !== imageId));

        const errorMessage: Message = {
          id: `msg_${Date.now()}_error`,
          type: 'assistant',
          content: `❌ Ошибка создания изображения: ${result.error || 'Неизвестная ошибка'}`,
          timestamp: new Date(),
          isVoice: false,
        };

        setImageMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      // Обработка исключений
      setImages((prev) => (prev || []).filter(img => img.id !== imageId));
      
      const errorMessage: Message = {
        id: `msg_${Date.now()}_error`,
        type: 'assistant',
        content: `❌ Ошибка создания изображения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        timestamp: new Date(),
        isVoice: false,
      };

      setImageMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  }
}
