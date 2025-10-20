import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Play, Stop, Copy, ArrowClockwise, Square } from '@phosphor-icons/react';
import { useVoice } from '@/hooks/useVoice';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MessageActionsProps {
  message: string;
  messageId: string;
  className?: string;
  // Добавлено: управление остановкой генерации ответа модели
  isGenerating?: boolean;
  onStopGeneration?: () => void;
}

export function MessageActions({ message, messageId, className = '', isGenerating = false, onStopGeneration }: MessageActionsProps) {
  const { tts: { state: ttsState, speak, stop } } = useVoice();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Сообщение скопировано');
    } catch (error) {
      console.error('Failed to copy message:', JSON.stringify(error, null, 2));
      toast.error('Ошибка при копировании');
    }
  };

  const isThisLoading = Boolean(ttsState && ttsState.isLoading && ttsState.currentMessageId === messageId);
  const isThisPlaying = Boolean(ttsState && ttsState.isPlaying && ttsState.currentMessageId === messageId);

  const handleTTS = async () => {
    try {
      if (isThisPlaying) {
        stop();
      } else {
        await speak(message);
      }
    } catch (error) {
      console.error('TTS error:', JSON.stringify(error, null, 2));
      toast.error('Ошибка воспроизведения речи');
    }
  };

  const handleStopGeneration = () => {
    if (onStopGeneration) {
      onStopGeneration();
      toast.info('Генерация ответа остановлена');
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Stop Generation Button - always visible but disabled when not generating */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStopGeneration}
              disabled={!isGenerating}
              className={cn(
                "h-6 w-6 p-0 transition-colors",
                isGenerating 
                  ? "text-red-500 hover:text-red-600 hover:bg-red-500/10" 
                  : "text-muted-foreground/50 cursor-not-allowed"
              )}
              title={isGenerating ? "Остановить генерацию" : "Генерация не активна"}
              aria-label={isGenerating ? "Остановить генерацию ответа" : "Генерация не активна"}
            >
              <Square size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isGenerating ? "Остановить генерацию" : "Генерация не активна"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            >
              <Copy size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Копировать</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTTS}
              disabled={isThisLoading}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              aria-label={isThisPlaying ? 'Остановить' : 'Прослушать'}
              aria-pressed={isThisPlaying}
            >
              {isThisLoading ? (
                <ArrowClockwise size={14} className="animate-spin" />
              ) : isThisPlaying ? (
                <Stop size={14} />
              ) : (
                <Play size={14} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isThisLoading ? 'Загрузка...' : isThisPlaying ? 'Остановить воспроизведение' : 'Воспроизвести голосом'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {ttsState && ttsState.error && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs text-destructive">⚠</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{ttsState.error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}