import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ChatStepPreview } from '@/components/ChatStepPreview';
import { ModernChatInput } from '@/components/ModernChatInput';
import { useWorkspaceChatStore } from '@/stores/workspace-chat-store';
import { useWorkspaceHistoryStore } from '@/stores/workspace-history-store';
import { useModelSelection } from '@/hooks/use-model-selection';
import { WorkspaceChatMessagePayload } from '@/types/workspace';
import { cn } from '@/lib/utils';
import { Brain, CheckCircle, Warning, X } from '@phosphor-icons/react';

export function ChatColumn() {
  const { messages, steps, isStreaming, sendMessage } = useWorkspaceChatStore();
  const { activeSessionId } = useWorkspaceHistoryStore();
  const { currentModel, isLoading, error: modelError } = useModelSelection();

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages or steps are added
  // ИСПРАВЛЕНО: Используем requestAnimationFrame + debounce чтобы избежать бесконечного цикла
  useEffect(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (chatContainerRef.current) {
        requestAnimationFrame(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        });
      }
    }, 50);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages, steps]);

  const handleSendMessage = async (text: string, mode: string, isVoice?: boolean) => {
    const payload: WorkspaceChatMessagePayload = {
      role: 'user',
      content: text,
      metadata: {
        mode,
        isVoice,
        timestamp: new Date().toISOString()
      }
    };
    await sendMessage(payload);
  };

  const formatMessageBlock = (message: { type: string; content: string; [key: string]: unknown }) => {
    const role = message.role === 'user' ? 'Пользователь' : 'Ассистент';
    const timestamp = new Date(message.createdAt as string | number | Date).toLocaleTimeString();

    return `**${role}**\n\n${message.content || 'Нет содержимого'}`;
  };

  const buildSessionContent = (session: { messages: Array<{ type: string; content: string; [key: string]: unknown }>; name?: string }) => {
    const messagesContent = (session.messages || []).map(formatMessageBlock).join('\n\n---\n\n');
    const baseContent = messagesContent || '_Нет сообщений_';
    return `**${session.name || 'Сессия'}**\n\n${baseContent}`.trim();
  };

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'openai': return '🤖';
      case 'anthropic': return '🧠';
      case 'meta': return '📘';
      case 'google': return '🔍';
      case 'mistral ai': return '🌊';
      case 'cohere': return '🔮';
      case 'deepseek': return '🎯';
      case 'qwen': return '🌟';
      case 'perplexity': return '🔎';
      case 'nvidia': return '💚';
      case 'microsoft': return '🪟';
      case 'hugging face': return '🤗';
      case 'local': return '🏠';
      default: return '🔧';
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'openai': return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'anthropic': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'meta': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'google': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'mistral ai': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'cohere': return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'deepseek': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'qwen': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'perplexity': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'nvidia': return 'bg-lime-500/20 text-lime-300 border-lime-500/30';
      case 'microsoft': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      case 'hugging face': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  // Определяем статус подключения
  const isModelOnline = currentModel && !modelError && !isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок с информацией о модели */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur-sm p-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <span className="text-white text-xs">💼</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold">Workspace</h2>
              <p className="text-xs text-muted-foreground">Работа с проектом</p>
            </div>
          </div>
          
          {/* Статус текущей модели */}
          {currentModel && (
            <div className={cn("flex items-center gap-2 text-xs")}>
              <span className="text-sm">{getProviderIcon(currentModel.provider)}</span>
              <span className="font-medium">{currentModel.name}</span>
              <Badge 
                variant="outline" 
                className={cn("text-xs", getProviderColor(currentModel.provider))}
              >
                {currentModel.provider}
              </Badge>
              <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border", 
                modelError ? 'text-red-500 bg-red-500/10 border-red-500/30' :
                isLoading ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' :
                'text-green-500 bg-green-500/10 border-green-500/30'
              )}>
                {modelError ? <X size={8} /> : isLoading ? <Warning size={8} /> : <CheckCircle size={8} />}
                <span>{modelError ? 'Ошибка' : isLoading ? 'Загрузка...' : 'Онлайн'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4" ref={chatContainerRef}>
          {/* Display workspace chat messages */}
          {messages.map((message) => (
            <div key={message.id} className="space-y-3">
              {/* User message - right side */}
              {message.role === 'user' && (
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 ml-8">
                      <MarkdownMessage
                        content={message.content}
                        className="prose-primary text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Assistant message - left side */}
              {message.role === 'assistant' && (
                <div className="flex justify-start">
                  <div className="max-w-[80%]">
                    <MarkdownMessage
                      content={message.content}
                      className="prose-default text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Agent Steps Preview */}
          {steps.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <h4 className="font-semibold mb-3">Шаги выполнения</h4>
              <div className="space-y-2">
                {steps.map((step) => (
                  <ChatStepPreview
                    key={step.id}
                    title={step.title}
                    preview={step.description || 'Нет описания'}
                    content={step.description || 'Нет содержимого'}
                    typeLabel="STEP"
                    timestamp={new Date(step.createdAt)}
                    meta={step.status}
                    isActive={step.status === 'running'}
                    onSelect={() => {}} // No action for step selection
                  />
                ))}
              </div>
            </div>
          )}

          {messages.length === 0 && steps.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="font-semibold text-lg mb-2">Начните диалог</h3>
              <p className="text-muted-foreground text-sm">
                Задайте вопрос или попросите помочь с проектом
              </p>
              {currentModel && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">
                    Текущая модель: <span className="font-medium">{currentModel.name}</span> ({currentModel.provider})
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Chat Input at the bottom */}
      <div className="p-4 border-t bg-card/80 backdrop-blur-sm flex-shrink-0">
        <ModernChatInput
          onSubmit={handleSendMessage}
          placeholder="Работайте с проектом, задавайте команды..."
          disabled={isStreaming}
          scope="workspace"
        />
      </div>
    </div>
  );
}