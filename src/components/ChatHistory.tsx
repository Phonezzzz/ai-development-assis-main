import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKV } from '@/shims/spark-hooks';
import { Message, GeneratedImage } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { ChatCircle, Image as ImageIcon, CaretDown } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatHistoryProps {
  messages: Message[];
  onClearHistory: () => void; // не используется в новой компоновке
  onNewChat?: () => void;     // не используется в новой компоновке
  onLoadSession?: (messages: Message[]) => void;
}

export function ChatHistory({ messages, onClearHistory: _unused, onNewChat: __unused, onLoadSession }: ChatHistoryProps) {
  // KV storages
  const [chatSessions] = useKV<Array<{ id: string; title: string; messages: Message[]; timestamp: Date }>>('chat-sessions', []);
  const [imageSessions] = useKV<Array<{ id: string; title: string; messages: Message[]; images: any[]; timestamp: Date; model: string }>>('image-chat-sessions', []);
  const [workspaceChat] = useKV<Array<{ id: string; question: string; answer: string; timestamp: Date; isTyping?: boolean }>>('workspace-chat', []);
  const [workspaceSessions] = useKV<Array<{ id: string; title: string; messages: Message[]; timestamp: Date }>>('workspace-sessions', []);

  const [expanded, setExpanded] = useState<{ chat: boolean; image: boolean; workspace: boolean }>({
    chat: false,
    image: false,
    workspace: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const toWorkspaceMessages = (entries: Array<{ id: string; question: string; answer: string; timestamp: Date }>): Message[] => {
    const list: Message[] = [];
    for (const e of entries) {
      const ts = new Date(e.timestamp || new Date());
      list.push({ id: `ws_user_${e.id}`, type: 'user', content: e.question || '', timestamp: ts, isVoice: false, workspaceMode: 'ask' });
      if (e.answer && e.answer.trim()) {
        list.push({ id: `ws_assistant_${e.id}`, type: 'assistant', content: e.answer, timestamp: ts, isVoice: false, workspaceMode: 'plan' });
      }
    }
    return list;
  };

  const currentChatSession = useMemo(() => (
    messages.length > 0
      ? { id: 'current', title: 'Текущая сессия', messages, timestamp: new Date() }
      : null
  ), [messages]);

  const currentWorkspaceSession = useMemo(() => (
    (workspaceChat && workspaceChat.length > 0)
      ? { id: 'current_ws', title: 'Текущая Workspace‑сессия', messages: toWorkspaceMessages(workspaceChat), timestamp: new Date() }
      : null
  ), [workspaceChat]);

  const chatList = useMemo(() => {
    const list = [
      ...(currentChatSession ? [currentChatSession] : []),
      ...(chatSessions || []),
    ].sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime());
    return list;
  }, [currentChatSession, chatSessions]);

  const imageList = useMemo(() => {
    const list = (imageSessions || []).sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime());
    return list;
  }, [imageSessions]);

  const workspaceList = useMemo(() => {
    const list = [
      ...(currentWorkspaceSession ? [currentWorkspaceSession] as any[] : []),
      ...(workspaceSessions || []),
    ].sort((a, b) => new Date(b.timestamp as any).getTime() - new Date(a.timestamp as any).getTime());
    return list;
  }, [currentWorkspaceSession, workspaceSessions]);

  const getPreview = (msgs: Message[]) => {
    const lastUser = msgs.filter(m => m.type === 'user').pop();
    return lastUser ? lastUser.content : (msgs[0]?.content || '');
  };

  const handleOpen = (session: any, type: 'chat' | 'image' | 'workspace') => {
    setSelectedId(session.id);
    if (!onLoadSession) return;
    if (type === 'chat') {
      onLoadSession(session.messages);
    } else if (type === 'image') {
      // Для image режимов — просто загружаем сообщения (ImageCreatorMode сам синхронизирует KV)
      onLoadSession(session.messages);
    } else if (type === 'workspace') {
      onLoadSession(session.messages);
    }
  };

  const SectionHeader = ({ icon, title, isOpen, onToggle }: { icon: React.ReactNode; title: string; isOpen: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md",
        "hover:bg-accent/40 transition-colors",
        "text-sm font-medium"
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{title}</span>
      <span className={cn("ml-auto transition-transform", isOpen ? "rotate-180" : "rotate-0")}>
        <CaretDown size={14} />
      </span>
    </button>
  );

  const ItemRow = ({ session, type }: { session: any; type: 'chat' | 'image' | 'workspace' }) => (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={() => handleOpen(session, type)}
            className={cn(
              "px-3 py-2 rounded-md cursor-pointer select-none",
              "hover:bg-accent/30 transition-colors",
              selectedId === session.id && "bg-accent/40"
            )}
            title={session.title}
          >
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-xs px-1.5 py-0.5 rounded border",
                session.id === 'current' || session.id === 'current_ws'
                  ? "border-primary/40 text-primary"
                  : "border-muted-foreground/20 text-muted-foreground"
              )}>
                {type === 'image' ? 'IMG' : type === 'workspace' ? 'WS' : 'CHAT'}
              </span>
              <span className="text-sm truncate flex-1">{session.title}</span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {formatTimestamp(session.timestamp)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {getPreview(session.messages)}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" align="start" className="max-w-xs break-words">
          {session.title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Chat Mode History */}
          <SectionHeader
            icon={<ChatCircle size={14} className="text-blue-500" />}
            title="Chat Mode History"
            isOpen={expanded.chat}
            onToggle={() => setExpanded(prev => ({ ...prev, chat: !prev.chat }))}
          />
          {expanded.chat && (
            <div className="mb-2 space-y-1">
              {chatList.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Пусто</div>
              ) : (
                chatList.map((s) => (
                  <ItemRow key={`chat_${s.id}`} session={s} type="chat" />
                ))
              )}
            </div>
          )}

          {/* Image Creation History */}
          <SectionHeader
            icon={<ImageIcon size={14} className="text-purple-500" />}
            title="Image Creation History"
            isOpen={expanded.image}
            onToggle={() => setExpanded(prev => ({ ...prev, image: !prev.image }))}
          />
          {expanded.image && (
            <div className="mb-2 space-y-1">
              {imageList.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Пусто</div>
              ) : (
                imageList.map((s) => (
                  <ItemRow key={`image_${s.id}`} session={s} type="image" />
                ))
              )}
            </div>
          )}

          {/* Workspace History */}
          <SectionHeader
            icon={<span className="text-green-500">🛠️</span>}
            title="Workspace History"
            isOpen={expanded.workspace}
            onToggle={() => setExpanded(prev => ({ ...prev, workspace: !prev.workspace }))}
          />
          {expanded.workspace && (
            <div className="mb-2 space-y-1">
              {workspaceList.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Пусто</div>
              ) : (
                workspaceList.map((s) => (
                  <ItemRow key={`ws_${s.id}`} session={s} type="workspace" />
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
