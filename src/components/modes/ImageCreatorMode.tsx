import { useState, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ModernChatInput } from '@/components/ModernChatInput';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { GeneratedImage, WorkspaceMode, Message } from '@/lib/types';
import { useImageModelSelection } from '@/hooks/use-image-model-selection';
import { formatDisplayDate } from '@/lib/utils';
import { Download, Square } from '@phosphor-icons/react';
import { useVoice } from '@/hooks/useVoice';
import { cn } from '@/lib/utils';
import { MessageActions } from '@/components/MessageActions';

// Импортируем новые hooks
import { useImageHistory } from '@/hooks/useImageHistory';
import { useImageGallery } from '@/hooks/useImageGallery';
import { useImageGeneration } from '@/hooks/useImageGeneration';
import { useKV } from '@/shims/spark-hooks';

interface ImageCreatorModeProps {
  messages?: Message[];
  onSendMessage?: (text: string, mode: WorkspaceMode, isVoice?: boolean) => void;
  isProcessing?: boolean;
  showGallery?: boolean;
  onToggleGallery?: () => void;
}

export function ImageCreatorMode({ onSendMessage, showGallery = false, onToggleGallery }: ImageCreatorModeProps) {
  // State
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useKV<GeneratedImage[]>('generated-images', []);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { tts: { speak: ttsSpeak, stop: ttsStop } } = useVoice();
  const { currentImageModel, availableImageModels, selectImageModel } = useImageModelSelection();
  const {
    imageMessages,
    imageSessions,
    addMessage,
    updateLastAssistantMessage,
    clearHistory,
    createSessionFromHistory,
  } = useImageHistory();

  const { allImages, downloadImage } = useImageGallery(images, imageSessions);

  // Callbacks для useImageGeneration
  const generationCallbacks = {
    onAddMessage: addMessage,
    onUpdateMessage: updateLastAssistantMessage,
    onAddImage: (image: GeneratedImage) => {
      setImages(prev => [image, ...(prev || [])]);
    },
    onUpdateImage: (imageId: string, url: string, isGenerating: boolean) => {
      setImages(prev =>
        (prev || []).map(img =>
          img.id === imageId
            ? { ...img, url, isGenerating }
            : img
        )
      );
    },
    onRemoveImage: (imageId: string) => {
      setImages(prev => (prev || []).filter(img => img.id !== imageId));
    },
    onSetGenerating: setIsGenerating,
  };

  const { handleUserMessage, cancelGeneration } = useImageGeneration(generationCallbacks);

  // Handlers
  const handleSendMessage = useCallback(async (text: string, isVoice: boolean = false) => {
    await handleUserMessage(text, isVoice, currentImageModel?.id, ttsSpeak);
  }, [handleUserMessage, currentImageModel?.id, ttsSpeak]);

  const handleStartNewSession = useCallback(() => {
    createSessionFromHistory(images, currentImageModel?.name || 'Unknown');
    setImages([]);
    clearHistory();
  }, [images, currentImageModel?.name, createSessionFromHistory, setImages, clearHistory]);

  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      const scrollArea = chatScrollRef.current.closest('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, []);

  // Render
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
                              <MarkdownMessage
                                content={message.content}
                                className="prose-primary text-sm"
                                copyButtonVariant="icon"
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                {formatDisplayDate(message.timestamp)}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <MarkdownMessage
                                content={message.content}
                                className="prose-default text-sm"
                                showCopyButton={false}
                              />
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                  {formatDisplayDate(message.timestamp)}
                                </div>
                                <MessageActions
                                  message={message.content}
                                  messageId={message.id}
                                  isGenerating={isGenerating && imageMessages.length > 0 && message.id === imageMessages[imageMessages.length - 1].id}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-6 text-xs">
                🎨 {currentImageModel ? currentImageModel.name : 'Выбрать модель'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {availableImageModels.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => selectImageModel(model.id)}
                  className="flex flex-col items-start gap-1 p-3"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-medium">{model.name}</span>
                    {currentImageModel && currentImageModel.id === model.id && (
                      <Badge variant="default" className="text-xs">Выбрано</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{model.description}</span>
                  <span className="text-xs text-muted-foreground">Provider: {model.provider}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              onClick={handleStartNewSession}
              className="h-6 text-xs"
            >
              Сохранить сессию
            </Button>
          )}
        </div>
        <ModernChatInput
          onSubmit={(text, mode, isVoice) => {
            handleSendMessage(text, isVoice);
          }}
          placeholder="Поговорите с ИИ или попросите создать изображение..."
          disabled={isGenerating}
        />
      </div>
    </div>
  );
}
