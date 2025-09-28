import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ModernChatInput } from '@/components/ModernChatInput';
import { MessageActions } from '@/components/MessageActions';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { Message, WorkspaceMode } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { useVoiceRecognition } from '@/hooks/use-voice';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Square } from 'lucide-react';

interface ChatModeProps {
  messages: Message[];
  onSendMessage: (text: string, mode: WorkspaceMode, isVoice?: boolean) => void;
  isProcessing: boolean;
}

export function ChatMode({ messages, onSendMessage, isProcessing }: ChatModeProps) {
  const { speak } = useVoiceRecognition();
  const { currentModel } = useModelSelection();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState({});

  // Force re-render when messages change
  useEffect(() => {
    forceUpdate({});
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [messages]);

  // Уникализируем сообщения по id, чтобы исключить дубликаты (и предупреждения о ключах)
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    const result: Message[] = [];
    for (const m of messages || []) {
      if (!m?.id) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      result.push(m);
    }
    return result;
  }, [messages]);

  // Функция для остановки генерации (заглушка, так как в ChatMode нет явной отмены)
  const handleStopGeneration = () => {
    // В ChatMode отмена генерации не реализована, поэтому просто показываем сообщение
    toast.info('Функция остановки генерации не реализована в этом режиме');
  };

  // Typing indicator animation
  const TypingIndicator = () => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex justify-start"
    >
      <div className="max-w-[80%] space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant="outline"
            className="text-xs font-medium text-muted-foreground border-muted-foreground/30"
          >
            {currentModel?.name || 'ИИ Ассистент'}
          </Badge>
        </div>
        <div className="py-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <motion.div
                className="w-2 h-2 bg-primary/60 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: 0
                }}
              />
              <motion.div
                className="w-2 h-2 bg-primary/60 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: 0.2
                }}
              />
              <motion.div
                className="w-2 h-2 bg-primary/60 rounded-full"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: 0.4
                }}
              />
            </div>
            <span className="text-sm text-muted-foreground ml-2">печатает...</span>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const getWorkspaceModeInfo = (mode?: WorkspaceMode) => {
    const modeMap = {
      ask: { name: 'Вопрос', avatar: '💬', color: 'bg-blue-500' },
      plan: { name: 'План', avatar: '🧠', color: 'bg-purple-500' },
      act: { name: 'Действие', avatar: '⚡', color: 'bg-green-500' },
    };
    return modeMap[mode || 'ask'] || { name: 'Ассистент', avatar: '🤖', color: 'bg-gray-500' };
  };

  return (
    <div className="chat-mode-container">
      {/* Старая верхняя кнопка "Стоп" */}
      {isProcessing && (
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopGeneration}
            className="flex items-center gap-2"
          >
            <Square size={14} />
            Остановить генерацию
          </Button>
        </div>
      )}
      
      <div className="chat-messages-area">
        <ScrollArea className="h-full chat-scroll-area">
          {messages.length === 0 ? (
            <div className="p-8">
              <div className="max-w-5xl mx-auto px-4">
                <Card className="p-8 text-center">
                  <div className="text-4xl mb-4">💬</div>
                  <h3 className="font-semibold text-lg mb-2">Начните беседу</h3>
                  <p className="text-muted-foreground">
                    Общайтесь с системой ИИ агентов. Вы можете использовать голосовой ввод или печатать сообщения.
                  </p>
                </Card>
              </div>
            </div>
          ) : (
            <div className="messages-container">
              <div className="max-w-5xl mx-auto px-4">
                <div className="messages-list">
                  <AnimatePresence initial={false}>
                    {uniqueMessages.map((message, index) => (
                    <motion.div
                      key={`${message.id}-${index}`}
                      initial={{ 
                        opacity: 0, 
                        y: 20,
                        scale: 0.95
                      }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                        scale: 1
                      }}
                      exit={{ 
                        opacity: 0, 
                        y: -10,
                        scale: 0.95
                      }}
                      transition={{
                        duration: 0.3,
                        ease: [0.25, 0.46, 0.45, 0.94],
                        delay: index === uniqueMessages.length - 1 ? 0.1 : 0
                      }}
                      className={cn(
                        "flex gap-3",
                        message.type === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                    <div
                      className={cn(
                        "max-w-[80%] space-y-2",
                        message.type === 'user' ? "items-end" : "items-start"
                      )}
                    >
                      {message.type === 'agent' && (
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="text-xs font-medium text-muted-foreground border-muted-foreground/30"
                          >
                            {message.agentType || 'Agent'}
                          </Badge>
                          {message.isVoice && (
                            <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
                              Голос
                            </Badge>
                          )}
                        </div>
                      )}

                      {message.type === 'user' ? (
                        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 ml-8">
                          <div className="mb-3">
                            <MarkdownMessage
                              content={message.content}
                              className="prose-primary"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(message.timestamp)}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <MarkdownMessage
                              content={message.content}
                              className="prose-default"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">
                              {formatTimestamp(message.timestamp)}
                            </div>
                            <MessageActions
                              message={message.content}
                              messageId={message.id}
                              isGenerating={isProcessing && message.type === 'assistant' && message.id === uniqueMessages[uniqueMessages.length - 1]?.id}
                              onStopGeneration={handleStopGeneration}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                  </AnimatePresence>

                  {/* Показать индикатор печати когда ИИ обрабатывает запрос */}
                  <AnimatePresence>
                    {isProcessing && <TypingIndicator />}
                  </AnimatePresence>
                </div>

                {/* Auto-scroll anchor */}
                <div ref={messagesEndRef} className="auto-scroll-anchor" />
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="chat-input-area p-4">
        <div className="max-w-5xl mx-auto">
          <ModernChatInput
            onSubmit={onSendMessage}
            placeholder="Задайте вопрос..."
            disabled={isProcessing}
            showModeSelector={false}
          />
        </div>
      </div>
    </div>
  );
}