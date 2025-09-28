import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Rnd } from 'react-rnd';
import { ModernChatInput } from '@/components/ModernChatInput';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { ContextUsageBar } from '@/components/ContextUsageBar';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { FileManager } from '@/components/FileManager';
import { useFileUpload } from '@/hooks/use-file-upload';
import { useKV } from '@/shims/spark-hooks';
import { useModelSelection } from '@/hooks/use-model-selection';
import type { WorkspaceMode } from '@/lib/types';
import type React from 'react';
import { useTTS } from '@/hooks/use-tts';
import { ProjectFile } from '@/lib/types';
import { formatDisplayDate } from '@/lib/utils';
import { llmService } from '@/lib/services/llm';
import { toast } from 'sonner';
import { MessageActions } from '@/components/MessageActions';
import {
  Code,
  Download,
  Eye,
  Terminal as TerminalIcon,
  Play,
  Stop,
  FolderOpen,
  FileCode,
  X,
  Square
} from '@phosphor-icons/react';

interface TerminalSession {
  id: string;
  commands: Array<{
    id: string;
    command: string;
    output: string;
    timestamp: Date;
    exitCode: number;
  }>;
  workingDirectory: string;
  isActive: boolean;
}

interface WorkspaceModeProps {
  messages?: any[];
  onSendMessage?: (text: string, mode: WorkspaceMode, isVoice?: boolean) => void;
  isProcessing?: boolean;
  currentMode?: WorkspaceMode;
  onModeChange?: (mode: WorkspaceMode) => void;
}

export function WorkspaceMode({ onSendMessage }: WorkspaceModeProps) {
  const {
    files,
    handleFileUpload,
    removeFile,
    updateFileContent,
    getFileIcon,
  } = useFileUpload();

  const { speak: ttsSpeak, stop: ttsStop } = useTTS();
  const { getCurrentUsage } = useContextTracker();

  const [workspaceChat, setWorkspaceChat] = useKV<Array<{id: string, question: string, answer: string, timestamp: Date, isTyping?: boolean}>>('workspace-chat', []);
  const [terminalSession, setTerminalSession] = useState<TerminalSession>({
    id: 'main',
    commands: [],
    workingDirectory: '/',
    isActive: false,
  });
  const [currentCommand, setCurrentCommand] = useState('');
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [isAgentWorking, setIsAgentWorking] = useState(false);

  // Panel visibility states
  const [showEditor, setShowEditor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showFileManager, setShowFileManager] = useState(false);

  // Window positions and sizes with persistence
  const [editorWindow, setEditorWindow] = useKV('editor-window', {
    x: 50, y: 50, width: 500, height: 400
  });
  const [terminalWindow, setTerminalWindow] = useKV('terminal-window', {
    x: 600, y: 50, width: 500, height: 300
  });
  const [fileManagerWindow, setFileManagerWindow] = useKV('filemanager-window', {
    x: 100, y: 200, width: 500, height: 400
  });
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const cancelAgentRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Контроль потребления контекста и выбор модели в скоупе workspace
  const { currentModel } = useModelSelection('workspace');

  // Останавливаем TTS при размонтировании контейнера режима
  useEffect(() => {
    return () => {
      try { ttsStop(); } catch {}
    };
  }, [ttsStop]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (file: ProjectFile) => {
    setSelectedFile(file);
    setEditingContent(file.content || '');
    setIsEditing(false);
  };

  const handleSaveFile = () => {
    if (selectedFile) {
      updateFileContent(selectedFile.id, editingContent);
      setSelectedFile(prev => prev ? { ...prev, content: editingContent } : null);
      setIsEditing(false);
      toast.success('Файл сохранен');
    }
  };

  const downloadFile = (file: ProjectFile) => {
    const blob = new Blob([file.content || ''], { type: file.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const executeTerminalCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    setIsExecutingCommand(true);
    const commandId = `cmd_${Date.now()}`;

    const newCommand = {
      id: commandId,
      command,
      output: 'Выполняется...',
      timestamp: new Date(),
      exitCode: -1,
    };

    setTerminalSession(prev => ({
      ...prev,
      commands: [...prev.commands, newCommand],
    }));

    try {
      // Простая симуляция выполнения команд терминала
      let output = '';
      let exitCode = 0;

      if (command.trim() === 'pwd') {
        output = terminalSession.workingDirectory;
      } else if (command.startsWith('cd ')) {
        const newDir = command.slice(3).trim();
        setTerminalSession(prev => ({
          ...prev,
          workingDirectory: newDir || '/home/user',
        }));
        output = '';
      } else if (command.trim() === 'ls' || command.trim() === 'ls -la') {
        output = files.length > 0
          ? files.map(f => f.name).join('\n')
          : 'Нет файлов в рабочем пространстве';
      } else if (command.trim() === 'clear') {
        setTerminalSession(prev => ({
          ...prev,
          commands: [],
        }));
        setIsExecutingCommand(false);
        setCurrentCommand('');
        return;
      } else {
        output = `Команда "${command}" не поддерживается в демо-режиме.\nДоступные команды: pwd, cd, ls, clear`;
        exitCode = 1;
      }

      setTerminalSession(prev => ({
        ...prev,
        commands: prev.commands.map(cmd =>
          cmd.id === commandId
            ? {
                ...cmd,
                output,
                exitCode,
              }
            : cmd
        ),
      }));
    } catch (error) {
      setTerminalSession(prev => ({
        ...prev,
        commands: prev.commands.map(cmd =>
          cmd.id === commandId
            ? {
                ...cmd,
                output: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                exitCode: 1,
              }
            : cmd
        ),
      }));
    } finally {
      setIsExecutingCommand(false);
      setCurrentCommand('');
    }
  }, [terminalSession.workingDirectory, files]);

  const handleAgentChat = useCallback(async (message: string, isVoice?: boolean) => {
    if (!message.trim()) return;

    // Immediately add user message to chat
    const uid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const chatId = `ws_msg_${uid}`;
    const userChatEntry = {
      id: chatId,
      question: message,
      answer: '', // Empty initially
      timestamp: new Date(),
      isTyping: true, // Add typing indicator
    };

    setWorkspaceChat(prev => [...prev, userChatEntry]);
    setIsAgentWorking(true);
    cancelAgentRef.current = false;

    try {
      const contextPrompt = files.length
        ? `Контекст рабочего пространства: ${files.length} файлов\nФайлы: ${files.slice(0, 20).map(f => f.name).join(', ')}${files.length > 20 ? '…' : ''}`
        : 'Нет загруженных файлов';

      const prompt = `Ты - ИИ помощник в рабочем пространстве разработки.

${contextPrompt}

Пользователь спрашивает: ${message}

Отвечай на русском языке и предоставляй практические советы для работы с проектом. Если нужен доступ к файлам, назови их.`;

      const modelId = currentModel?.id;
      console.log('=== DEBUG WorkspaceMode ===');
      console.log('currentModel:', currentModel);
      console.log('modelId:', modelId);

      // Check if model is properly selected
      if (!modelId) {
        throw new Error('Пожалуйста, выберите модель из списка');
      }

      const response = await llmService.askQuestion(prompt, modelId);

      // Simulate typing effect
      const words = response.split(' ');
      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        // Добавлено: проверка отмены
        if (cancelAgentRef.current) {
          setWorkspaceChat(prev =>
            prev.map(chat =>
              chat.id === chatId
                ? { ...chat, answer: currentText, isTyping: false }
                : chat
            )
          );
          break;
        }

        currentText += (i > 0 ? ' ' : '') + words[i];

        setWorkspaceChat(prev =>
          prev.map(chat =>
            chat.id === chatId
              ? { ...chat, answer: currentText, isTyping: i < words.length - 1 }
              : chat
          )
        );

        // Auto-scroll during typing
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 10);

        // Delay between words
        if (i < words.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Озвучка ответа при голосовом вводе (если не отменено)
      if (isVoice && !cancelAgentRef.current) {
        try {
          ttsStop();
          await ttsSpeak(response);
        } catch {}
      }

      if (!cancelAgentRef.current) {
        toast.success('Агент ответил');
      }
    } catch (error) {
      console.error('Error in agent chat:', error);

      // Update chat with error
      setWorkspaceChat(prev =>
        prev.map(chat =>
          chat.id === chatId
            ? {
                ...chat,
                answer: `❌ Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                isTyping: false
              }
            : chat
        )
      );

      toast.error('Ошибка связи с агентом');
    } finally {
      setIsAgentWorking(false);
    }
  }, [files, currentModel, setWorkspaceChat, ttsSpeak, ttsStop]);

  // Function to render window content
  const renderWindowContent = (panelId: string) => {
    switch (panelId) {
      case 'editor':
        return (
          <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
            {/* Header - always visible */}
            <div className="p-4 border-b bg-background flex items-center justify-between drag-handle cursor-move">
              <div className="flex items-center gap-3">
                <span className="text-xl">{selectedFile ? getFileIcon(selectedFile) : '📄'}</span>
                <div>
                  <h3 className="font-semibold">{selectedFile ? selectedFile.name : 'Редактор'}</h3>
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)} • Изменен {formatDisplayDate(selectedFile.lastModified)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditor(false)}
                  className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X size={12} />
                </Button>
                {selectedFile && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile(selectedFile)}
                    >
                      <Download size={14} className="mr-2" />
                      Скачать
                    </Button>

                    {selectedFile.content && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                      >
                        <Code size={14} className="mr-2" />
                        {isEditing ? 'Просмотр' : 'Редактировать'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Content area - always visible */}
            <div className="flex-1 p-4">
              {selectedFile ? (
                selectedFile.content ? (
                  isEditing ? (
                    <div className="h-full flex flex-col">
                      <Textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="flex-1 resize-none font-mono text-sm"
                        placeholder="Содержимое файла..."
                      />
                      <div className="flex gap-2 mt-4">
                        <Button onClick={handleSaveFile}>Сохранить</Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingContent(selectedFile.content || '');
                            setIsEditing(false);
                          }}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full p-4 bg-background rounded border">
                      <pre className="syntax-highlight whitespace-pre-wrap h-full overflow-auto">
                        {selectedFile.content}
                      </pre>
                    </div>
                  )
                ) : selectedFile.type.startsWith('image/') ? (
                  <div className="h-full p-4 bg-muted/20 rounded border flex items-center justify-center">
                    <img
                      src={selectedFile.content}
                      alt={selectedFile.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-full p-8 bg-background rounded border flex items-center justify-center">
                    <div className="text-center">
                      <Eye size={48} className="mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-medium mb-2">Предварительный просмотр недоступен</h3>
                      <p className="text-sm text-muted-foreground">
                        Этот тип файла не может быть отображен в браузере.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="h-full flex items-center justify-center bg-background rounded border">
                  <div className="p-8 text-center max-w-md">
                    <div className="text-4xl mb-4">📄</div>
                    <h3 className="font-semibold text-lg mb-2">Выберите файл</h3>
                    <p className="text-muted-foreground">
                      Выберите файл в File Manager для просмотра или редактирования.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'terminal':
        return (
          <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-background flex items-center justify-between drag-handle cursor-move">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <TerminalIcon size={14} />
                  Терминал
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTerminal(false)}
                  className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X size={12} />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4 bg-black/5 font-mono text-sm">
                <div className="space-y-2">
                  {terminalSession.commands
                    .filter(cmd => !cmd.command.startsWith('💬')) // Hide chat messages from terminal
                    .map((cmd) => (
                    <div key={cmd.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-accent">
                        <span>$</span>
                        <span>{cmd.command}</span>
                        {cmd.exitCode === 0 && <span className="text-green-500">✓</span>}
                        {cmd.exitCode > 0 && <span className="text-red-500">✗</span>}
                      </div>
                      <div className="pl-4 text-muted-foreground whitespace-pre-wrap">
                        {cmd.output}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-black/5 rounded px-3 py-2">
                    <span className="text-accent">$</span>
                    <Input
                      value={currentCommand}
                      onChange={(e) => setCurrentCommand(e.target.value)}
                      placeholder="Введите команду..."
                      className="border-none bg-transparent p-0 font-mono"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isExecutingCommand) {
                          executeTerminalCommand(currentCommand);
                        }
                      }}
                      disabled={isExecutingCommand}
                    />
                  </div>
                  <Button
                    onClick={() => executeTerminalCommand(currentCommand)}
                    disabled={isExecutingCommand || !currentCommand.trim()}
                    size="sm"
                  >
                    {isExecutingCommand ? (
                      <Stop size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
        );

      case 'fileManager':
        return (
          <div className="h-full flex flex-col bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-2 border-b bg-background flex items-center justify-between drag-handle cursor-move">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <FolderOpen size={14} />
                File Manager
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFileManager(false)}
                className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
              >
                <X size={12} />
              </Button>
            </div>
            <div className="flex-1">
              <FileManager
                files={files}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onFileUpload={handleFileUpload}
                onFileRemove={removeFile}
                onFileDownload={downloadFile}
                className="h-full"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col max-h-screen">
      {/* Старая верхняя кнопка "Стоп" */}
      {isAgentWorking && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              cancelAgentRef.current = true;
              setIsAgentWorking(false);
              ttsStop();
            }}
            className="flex items-center gap-2"
          >
            <Square size={14} />
            Остановить генерацию
          </Button>
        </div>
      )}
      
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Sidebar - Agent Chat - Split off global chat logic */}
        <Panel defaultSize={30} minSize={15} maxSize={40}>
          <div className="h-full border-r bg-card flex flex-col">
            <div className="p-4 border-b">
              <ContextUsageBar
                currentContextUsage={getCurrentUsage()}
                className="w-full"
              />
            </div>

            {/* Workspace Chat Area - Separate from global chat */}
            <div className="flex-1 p-4 overflow-y-auto" ref={chatContainerRef}>
              <div className="space-y-2">
                {workspaceChat.map((chat) => (
                  <div key={chat.id} className="space-y-3">
                    {/* User message - right side like ChatMode */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%]">
                        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 ml-8">
                          <MarkdownMessage
                            content={chat.question}
                            className="prose-primary text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Agent response - left side */}
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        {chat.answer ? (
                          <div className="p-3 bg-accent/10 rounded-lg">
                            <MarkdownMessage
                              content={chat.answer}
                              className="prose-default text-sm"
                            />
                            <div className="flex items-center justify-between mt-1">
                              <div className="text-xs text-muted-foreground">
                                {formatDisplayDate(chat.timestamp)}
                              </div>
                              <MessageActions
                                message={chat.answer}
                                messageId={chat.id}
                                isGenerating={isAgentWorking && chat.isTyping}
                                onStopGeneration={() => {
                                  cancelAgentRef.current = true;
                                  setIsAgentWorking(false);
                                  ttsStop();
                                }}
                              />
                            </div>
                            {chat.isTyping && (
                              <div className="mt-2 flex items-center gap-1">
                                <div className="w-1 h-1 bg-current rounded-full animate-pulse"></div>
                                <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-accent/10 rounded-lg">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div className="flex gap-1">
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                              </div>
                              <span>печатает...</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {workspaceChat.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-4">🤖</div>
                    <h3 className="font-semibold text-lg mb-2">Начните диалог</h3>
                    <p className="text-muted-foreground text-sm">
                      Задайте вопрос или попросите помочь с проектом
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Project Info and Model Status */}
            <div className="p-4 border-t space-y-2">
              <div className="p-2 bg-primary/10 rounded text-xs">
                <p className="font-medium mb-1">Текущая модель:</p>
                <p className="text-muted-foreground">
                  {currentModel ? (
                    <>
                      {currentModel.name}
                      {currentModel.free && <span className="ml-1 text-green-400">• FREE</span>}
                    </>
                  ) : (
                    <span className="text-yellow-400">Модель не выбрана - выберите в заголовке</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

        {/* Main Workspace Area with floating windows */}
        <Panel defaultSize={75}>
          <div className="h-full relative bg-background/50">
            {/* Top Bar with Panel Controls */}
            <div className="border-b bg-background px-4 py-2 space-y-2 relative z-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Workspace</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showEditor ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowEditor(!showEditor)}
                    className="flex items-center gap-2"
                  >
                    <FileCode size={14} />
                    Редактор
                  </Button>
                  <Button
                    variant={showTerminal ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowTerminal(!showTerminal)}
                    className="flex items-center gap-2"
                  >
                    <TerminalIcon size={14} />
                    Терминал
                  </Button>
                  <Button
                    variant={showFileManager ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowFileManager(!showFileManager)}
                    className="flex items-center gap-2"
                  >
                    <FolderOpen size={14} />
                    File Manager
                  </Button>
                </div>
              </div>
            </div>

            {/* Floating Windows */}
            {showEditor && (
              <Rnd
                size={{ width: editorWindow.width, height: editorWindow.height }}
                position={{ x: editorWindow.x, y: editorWindow.y }}
                onDragStop={(e, d) => setEditorWindow(prev => ({ ...prev, x: d.x, y: d.y }))}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setEditorWindow({
                    x: position.x,
                    y: position.y,
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height)
                  });
                }}
                className="z-10"
                dragHandleClassName="drag-handle"
              >
                {renderWindowContent('editor')}
              </Rnd>
            )}

            {showTerminal && (
              <Rnd
                size={{ width: terminalWindow.width, height: terminalWindow.height }}
                position={{ x: terminalWindow.x, y: terminalWindow.y }}
                onDragStop={(e, d) => setTerminalWindow(prev => ({ ...prev, x: d.x, y: d.y }))}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setTerminalWindow({
                    x: position.x,
                    y: position.y,
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height)
                  });
                }}
                className="z-20"
                dragHandleClassName="drag-handle"
              >
                {renderWindowContent('terminal')}
              </Rnd>
            )}

            {showFileManager && (
              <Rnd
                size={{ width: fileManagerWindow.width, height: fileManagerWindow.height }}
                position={{ x: fileManagerWindow.x, y: fileManagerWindow.y }}
                onDragStop={(e, d) => setFileManagerWindow(prev => ({ ...prev, x: d.x, y: d.y }))}
                onResizeStop={(e, direction, ref, delta, position) => {
                  setFileManagerWindow({
                    x: position.x,
                    y: position.y,
                    width: parseInt(ref.style.width),
                    height: parseInt(ref.style.height)
                  });
                }}
                className="z-40"
                dragHandleClassName="drag-handle"
              >
                {renderWindowContent('fileManager')}
              </Rnd>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* Chat Input at the bottom */}
      <div className="p-4 border-t bg-card/80 backdrop-blur-sm flex-shrink-0">
        <ModernChatInput
          onSubmit={(text, mode, isVoice) => {
            if (onSendMessage) {
              onSendMessage(text, mode, isVoice);
            } else {
              handleWorkspaceCommand(text, mode, isVoice);
            }
          }}
          placeholder="Работайте с проектом, задавайте команды..."
          disabled={isAgentWorking}
          scope="workspace"
        />
      </div>
    </div>
  );

  function handleWorkspaceCommand(text: string, mode: WorkspaceMode, isVoice?: boolean) {
    // Handle workspace-specific commands like file operations, code generation, etc.
    if (mode === 'act') {
      executeTerminalCommand(text);
    } else {
      handleAgentChat(text, isVoice);
    }
  }
}
