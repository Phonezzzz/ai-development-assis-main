import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { AgentSelector } from '@/components/AgentSelector';
import { WorkModeSelector } from '@/components/WorkModeSelector';
import { WorkspaceMode } from '@/lib/types';
import { useKV } from '@/shims/spark-hooks';
import { useModelSelection } from '@/hooks/use-model-selection';
import { cn } from '@/lib/utils';
import { 
  PaperPlaneRight, 
  Paperclip, 
  Microphone, 
  MicrophoneSlash,
  Robot,
  Wrench,
  Brain,
  CaretDown,
  Sparkle,
  ArrowClockwise,
  X
} from '@phosphor-icons/react';
import { useVoiceRecognition } from '@/hooks/use-voice';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';

interface ModernChatInputProps {
  onSubmit: (text: string, mode: WorkspaceMode, isVoice?: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  showModeSelector?: boolean;
  scope?: 'chat' | 'workspace';
}

const AGENT_TOOLS = [
  { id: 'web-search', name: 'Веб поиск', icon: '🔍', description: 'Поиск информации в интернете' },
  { id: 'add-new-tool', name: '+ Добавить инструмент', icon: '➕', description: 'Создать новый инструмент' },
];

export function ModernChatInput({ onSubmit, placeholder = "Спросите что угодно или упомяните пространство", disabled, showModeSelector = true, scope = 'chat' }: ModernChatInputProps) {
  const [input, setInput] = useState('');
  const [workMode, setWorkMode] = useKV<WorkspaceMode>('work-mode', 'ask');
  const [selectedTools, setSelectedTools] = useKV<string[]>('selected-tools', []);
  const [selectedAgent, setSelectedAgent] = useKV<string>('selected-agent', 'architector');
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const [textareaHeight, setTextareaHeight] = useState('auto');
  const [maxHeightReached, setMaxHeightReached] = useState(false);

  // Используем улучшенный хук с защитой от повторных кликов
  const { voiceState, startListening, stopListening, isSupported, clearTranscript, isStarting } = useVoiceRecognition();
  const [isListeningLocal, setIsListeningLocal] = useState(false);

  // Функция для расчета высоты textarea
  const calculateTextareaHeight = useCallback(() => {
    if (inputRef.current) {
      const textarea = inputRef.current;
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 160); // Максимум 8 строк (20px * 8)
      textarea.style.height = `${newHeight}px`;
      setMaxHeightReached(newHeight >= 160);
      setTextareaHeight(`${newHeight}px`);
    }
  }, []);

  useEffect(() => {
    calculateTextareaHeight();
  }, [input, calculateTextareaHeight]);

  // Таймер записи
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  const startRecordingTimer = () => {
    try { if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); } catch {}
    setRecordingSeconds(0);
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000) as unknown as number;
  };
  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) {
      try { clearInterval(recordingTimerRef.current); } catch {}
      recordingTimerRef.current = null;
    }
  };
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Используем хук для работы с моделями
  const {
    availableModels,
    currentModel,
    selectModel,
    isLoading,
    isConfigured,
    refreshModels,
    selectedModel,
  } = useModelSelection(scope);

  // Синхронизируем транскрипт в поле ввода - вставляем в позицию курсора при завершении записи
  useEffect(() => {
    // Вставляем транскрипт только когда запись завершена и есть транскрипт
    if (voiceState?.isProcessing === false && voiceState.transcript && voiceState.transcript.length > 0) {
      const transcript = voiceState.transcript;
      if (inputRef.current) {
        const textarea = inputRef.current;
        const isFocused = document.activeElement === textarea;
        let start = textarea.selectionStart;
        let end = textarea.selectionEnd;

        // Если textarea не в фокусе, вставляем в конец
        if (!isFocused) {
          start = textarea.value.length;
          end = textarea.value.length;
        }

        setInput(prevInput => {
          const newText = prevInput.substring(0, start) + transcript + prevInput.substring(end);
          return newText;
        });

        // После обновления текста устанавливаем курсор после вставленного текста
        setTimeout(() => {
          if (inputRef.current) {
            const newCursorPos = start + transcript.length;
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
            // Если поле не было в фокусе, фокусируем его
            if (!isFocused) {
              inputRef.current.focus();
            }
          }
        }, 0);
      }
    }
  }, [voiceState?.isProcessing, voiceState?.transcript]);

  // Синхронизируем индикатор записи с фактическим состоянием распознавания
  useEffect(() => {
    if (!voiceState?.isListening && isListening) {
      setIsListening(false);
      stopRecordingTimer();
    }
    if (voiceState?.isListening && !isListening) {
      // Если фактическое состояние перешло в запись — запускаем таймер
      startRecordingTimer();
      setIsListening(true);
    }
  }, [voiceState?.isListening, isListening]);

  // Force re-render when model changes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [selectedModel, currentModel]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (submittingRef.current) return;
    if (!input.trim() || disabled) return;
    submittingRef.current = true;
    try {
      onSubmit(input, showModeSelector ? (workMode || 'ask') : 'ask', isListening);
      setInput('');
    } finally {
      // небольшой тротллинг, чтобы исключить двойной вызов (клик + Enter)
      setTimeout(() => {
        submittingRef.current = false;
      }, 300);
    }
  }, [input, workMode, onSubmit, disabled, isListening, showModeSelector]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const toggleVoiceRecognition = useCallback(() => {
    if (!isSupported) {
      toast.error('Голосовой ввод недоступен в этом браузере');
      return;
    }
    
    if (isStarting) return; // Защита от повторных кликов
    
    if (!isListening) {
      // Мгновенное обновление UI состояния перед запуском движка
      setIsListening(true);
      startRecordingTimer();
      
      try {
        startListening();
      } catch (e) {
        console.error('Failed to start voice recognition:', e);
        // Откат состояния при ошибке
        setIsListening(false);
        stopRecordingTimer();
        toast.error('Ошибка запуска голосового ввода');
      }
    } else {
      // Мгновенное обновление UI состояния перед остановкой
      setIsListening(false);
      stopRecordingTimer();
      
      try {
        stopListening();
      } catch (e) {
        console.error('Failed to stop voice recognition:', e);
        toast.error('Ошибка остановки голосового ввода');
      }
    }
  }, [isListening, isSupported, isStarting, startListening, stopListening]);

  const handleFileUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        // Handle file upload logic here
        console.log('Files selected:', Array.from(files));
      }
    };
    input.click();
  }, []);

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'openai': return 'bg-green-500/20 text-green-300';
      case 'anthropic': return 'bg-orange-500/20 text-orange-300';
      case 'meta': return 'bg-blue-500/20 text-blue-300';
      case 'google': return 'bg-red-500/20 text-red-300';
      case 'mistral ai': return 'bg-purple-500/20 text-purple-300';
      case 'cohere': return 'bg-teal-500/20 text-teal-300';
      case 'deepseek': return 'bg-indigo-500/20 text-indigo-300';
      case 'qwen': return 'bg-cyan-500/20 text-cyan-300';
      case 'perplexity': return 'bg-amber-500/20 text-amber-300';
      case 'nvidia': return 'bg-lime-500/20 text-lime-300';
      case 'microsoft': return 'bg-sky-500/20 text-sky-300';
      case 'hugging face': return 'bg-yellow-500/20 text-yellow-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  return (
    <Card className="p-4 bg-card">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Input field with icons */}
        <div className="relative">
          <div className="absolute left-3 top-3 flex items-center gap-2 z-10">
            {/* Models dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]"
                  title={`Модель: ${currentModel?.name || 'Не выбрана'}`}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ArrowClockwise size={14} className="animate-spin" />
                  ) : (
                    <Brain size={14} />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <div className="flex items-center justify-between p-2">
                  <DropdownMenuLabel>Выбор модели ИИ</DropdownMenuLabel>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshModels}
                    className="h-6 w-6 p-0"
                  >
                    <ArrowClockwise className="h-3 w-3" />
                  </Button>
                </div>
                
                {!isConfigured && (
                  <>
                    <div className="px-2 py-1">
                      <div className="flex items-center gap-2 text-sm text-yellow-400">
                        <span>⚠️ API не настроен - демо режим</span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}

                <div className="max-h-96 overflow-y-auto">
                  {availableModels.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => selectModel(model.id)}
                      className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="font-medium">{model.name}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          {model.free && (
                            <Badge variant="secondary" className="text-xs">
                              FREE
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs ${getProviderColor(model.provider)}`}
                          >
                            {model.provider}
                          </Badge>
                        </div>
                      </div>
                      {model.description && (
                        <p className="text-xs text-muted-foreground">
                          {model.description}
                        </p>
                      )}
                    </DropdownMenuItem>
                  ))}
                </div>

                {availableModels.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Модели не найдены
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Tools dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 bg-muted/50 hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]"
                  title={`Инструменты: ${selectedTools?.length || 0} активно`}
                >
                  <Wrench size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {AGENT_TOOLS.map((tool) => (
                  <DropdownMenuItem
                    key={tool.id}
                    onClick={() => {
                      if (tool.id === 'add-new-tool') {
                        // Handle new tool creation
                        console.log('Adding new tool...');
                        return;
                      }
                      setSelectedTools(prev => 
                        (prev || []).includes(tool.id) 
                          ? (prev || []).filter(id => id !== tool.id)
                          : [...(prev || []), tool.id]
                      );
                    }}
                    className="flex items-start gap-3 p-3"
                  >
                    <div className="text-lg">{tool.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium">{tool.name}</div>
                      <div className="text-xs text-muted-foreground">{tool.description}</div>
                    </div>
                    {(selectedTools || []).includes(tool.id) && tool.id !== 'add-new-tool' && (
                      <div className="w-2 h-2 bg-accent rounded-full" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Agents dropdown */}
            <AgentSelector
              selectedAgent={selectedAgent}
              onAgentSelect={setSelectedAgent}
            />
          </div>

          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[48px] max-h-[192px] pl-32 pr-28 py-3 text-sm bg-background border-transparent focus:border-accent transition-colors resize-none"
            style={{
              overflowWrap: 'break-word',
              wordBreak: 'break-word'
            }}
            aria-label="Поле ввода сообщения"
          />

          <div className="absolute right-3 top-3 flex items-center gap-2 z-10">
            {/* Voice recognition button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleVoiceRecognition}
              disabled={isStarting} // Блокируем кнопку во время старта STT
              className={cn(
                "h-7 w-7 p-0 transition-all duration-200 border border-transparent",
                "hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]",
                isListening 
                  ? "text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title={
                !isSupported
                  ? "Голосовой ввод недоступен в этом браузере"
                  : (isListening ? "Остановить запись" : "Голосовой ввод")
              }
              aria-pressed={isListening}
              aria-label={isListening ? "Остановить запись" : "Начать запись"}
            >
              {isListening ? <MicrophoneSlash size={16} /> : <Microphone size={16} />}
            </Button>

            {/* Retry (Перезаписать) — показывать если есть текст или идёт распознавание */}
            {(voiceState.isProcessing || (voiceState.transcript && voiceState.transcript.length > 0)) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  try { clearTranscript(); } catch {}
                  if (isSupported && !isStarting) {
                    try {
                      startRecordingTimer();
                      setIsListening(true);
                      startListening();
                    } catch {}
                  }
                }}
                disabled={isStarting}
                className={cn(
                  "h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]",
                  isStarting && "opacity-50 cursor-not-allowed"
                )}
                title="Перезаписать"
                aria-label="Перезаписать голосовой ввод"
              >
                <ArrowClockwise size={16} />
              </Button>
            )}

            {/* Clear (Очистить) — показывать если есть текст */}
            {(voiceState.transcript && voiceState.transcript.length > 0) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  try { clearTranscript(); } catch {}
                  setInput('');
                  setIsListening(false);
                  stopRecordingTimer();
                }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]"
                title="Очистить результат распознавания"
                aria-label="Очистить результат распознавания"
              >
                <X size={16} />
              </Button>
            )}

            {/* Attach file button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFileUpload}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 border border-transparent hover:border-accent hover:shadow-[0_0_8px_rgba(147,51,234,0.3)]"
              title="Прикрепить файл"
            >
              <Paperclip size={16} />
            </Button>

            {/* Submit button */}
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || disabled}
              className={cn(
                "h-7 w-7 p-0 bg-accent hover:bg-accent/90 text-accent-foreground transition-all duration-200",
                "border border-accent hover:shadow-[0_0_12px_rgba(147,51,234,0.5)]",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:border-transparent"
              )}
              title="Отправить сообщение"
              aria-label="Отправить сообщение"
            >
              <PaperPlaneRight size={16} />
            </Button>
          </div>
        </div>

        {/* Work Mode selector moved to the right side under the buttons */}
        {showModeSelector && (
          <div className="flex justify-end">
            <WorkModeSelector
              selectedMode={workMode}
              onModeSelect={setWorkMode}
            />
          </div>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-live="polite">
          {/* Recording waveform + timer */}
          {isListening && (
            <div className="flex items-center gap-2">
              <div className="voice-waveform">
                <div className="voice-bar"></div>
                <div className="voice-bar"></div>
                <div className="voice-bar"></div>
                <div className="voice-bar"></div>
                <div className="voice-bar"></div>
              </div>
              <span>Запись</span>
              <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary">{formatTime(recordingSeconds)}</span>
            </div>
          )}

          {/* Processing state */}
 {!isListening && voiceState?.isProcessing && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-transparent border-t-primary animate-spin" />
              <span>Распознаём…</span>
            </div>
          )}

          {/* Done state */}
          {!isListening && !voiceState?.isProcessing && !!voiceState?.transcript && (
            <div className="flex items-center gap-2 text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <span>Готово • текст вставлен в поле ввода (не отправлен)</span>
            </div>
          )}

          {/* Tools active */}
          {selectedTools && selectedTools.length > 0 && (
            <div className="flex items-center gap-1">
              <Wrench size={12} />
              <span>{selectedTools.length} инструментов активно</span>
            </div>
          )}
          {/* Agent selected */}
          {selectedAgent && (
            <div className="flex items-center gap-1">
              <Robot size={12} />
              <span>Агент выбран</span>
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}