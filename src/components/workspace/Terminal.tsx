import { useEffect, useRef, useState } from 'react';
import { useWorkspaceTerminal } from '@/hooks/use-workspace-terminal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Square, Trash, Terminal as TerminalIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const {
    session,
    commands,
    isConnected,
    isLoading,
    error,
    createSession,
    sendCommand,
    clearCommands,
    reconnect,
  } = useWorkspaceTerminal();

  // Инициализация терминала при монтировании
  useEffect(() => {
    if (!session) {
      createSession('default-session');
    }
  }, [session, createSession]);

  // Фокус на поле ввода при подключении
  useEffect(() => {
    if (isConnected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !isConnected) return;

    try {
      await sendCommand(inputValue.trim());
      setCommandHistory(prev => [inputValue.trim(), ...prev]);
      setInputValue('');
      setHistoryIndex(-1);
    } catch (error) {
      console.error('Failed to send command:', JSON.stringify(error, null, 2));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  };

  const handleClear = () => {
    clearCommands();
  };

  const handleReconnect = () => {
    reconnect();
  };

  return (
    <div className="h-full flex flex-col bg-background border-t">
      {/* Заголовок терминала */}
      <div className="flex items-center justify-between p-2 border-b bg-muted">
        <div className="flex items-center gap-2">
          <TerminalIcon size={16} />
          <span className="text-sm font-medium">Терминал</span>
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-green-500" : "bg-red-500"
          )} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Подключен' : 'Отключен'}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-6 px-2 text-xs"
          >
            <Trash size={12} className="mr-1" />
            Очистить
          </Button>
          {!isConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReconnect}
              className="h-6 px-2 text-xs"
            >
              Переподключить
            </Button>
          )}
        </div>
      </div>

      {/* Вывод терминала */}
      <ScrollArea className="flex-1 p-2 font-mono text-sm">
        <div ref={terminalRef} className="space-y-1">
          {isLoading && (
            <div className="text-muted-foreground">Подключение к терминалу...</div>
          )}
          
          {error && (
            <div className="text-red-500">Ошибка: {error.message}</div>
          )}

          {commands.length === 0 && !isLoading && !error && (
            <div className="text-muted-foreground">
              Терминал готов. Введите команду для начала работы.
            </div>
          )}

          {commands.map((command) => (
            <div key={command.id} className="space-y-1">
              {/* Команда */}
              <div className="flex items-center gap-2">
                <span className="text-green-400">$</span>
                <span className="text-foreground">{command.command}</span>
                {command.isExecuting && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
              </div>
              
              {/* Вывод */}
              {command.output && (
                <div className="ml-4 text-muted-foreground whitespace-pre-wrap">
                  {command.output}
                </div>
              )}
              
              {/* Код завершения */}
              {command.exitCode !== undefined && (
                <div className={cn(
                  "ml-4 text-xs",
                  command.exitCode === 0 ? "text-green-500" : "text-red-500"
                )}>
                  [exit code: {command.exitCode}]
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Поле ввода */}
      <form onSubmit={handleSubmit} className="border-t p-2">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-mono">$</span>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? "Введите команду..." : "Терминал не подключен"}
            disabled={!isConnected || isLoading}
            className="flex-1 font-mono text-sm border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!isConnected || isLoading || !inputValue.trim()}
            className="h-8 px-2"
          >
            <Play size={14} />
          </Button>
        </div>
      </form>
    </div>
  );
}