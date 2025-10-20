import React, { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useKV } from '@/shims/spark-hooks';
import { Message, AgentMessage } from '@/lib/types';
import { ChatSession, ImageSession, WorkspaceSession, AnySession } from '@/lib/types/strict-types';
import { cn, formatTimestamp } from '@/lib/utils';
import { ChatCircle, Image as ImageIcon, CaretDown } from '@phosphor-icons/react';
import { ChatStepPreview } from '@/components/ChatStepPreview';

interface ChatHistoryProps {
  messages: Message[];
  onClearHistory: () => void; // не используется в новой компоновке
  onNewChat?: () => void;     // не используется в новой компоновке
  onLoadSession?: (messages: Message[]) => void;
}

export function ChatHistory({ messages, onClearHistory: _unused, onNewChat: __unused, onLoadSession }: ChatHistoryProps) {
  // KV storages
  const [chatSessions] = useKV<ChatSession[]>('chat-sessions', []);
  const [imageSessions] = useKV<ImageSession[]>('image-chat-sessions', []);
  const [workspaceChat] = useKV<Array<{ id: string; question: string; answer: string; timestamp: Date; isTyping?: boolean }>>('workspace-chat', []);
  const [workspaceSessions] = useKV<WorkspaceSession[]>('workspace-sessions', []);

  const [expanded, setExpanded] = useState<{ chat: boolean; image: boolean; workspace: boolean }>({
    chat: false,
    image: false,
    workspace: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const normalizeDate = (value: Date | string | number | undefined | null) => {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const isAgentMessage = (message: Message): message is AgentMessage => {
    return Boolean(
      (message as AgentMessage).agentState ||
      (message as AgentMessage).actionType ||
      (message as AgentMessage).goal ||
      (message as AgentMessage).metadata
    );
  };

  const formatMetadataValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '—';
    }
    if (typeof value === 'object') {
      try {
        return '`' + JSON.stringify(value) + '`';
      } catch {
        return '—';
      }
    }
    return String(value);
  };

  const formatStepsCount = (count: number) => {
    if (!count || count < 0) {
      return '';
    }
    const abs = count % 100;
    const mod = abs % 10;
    if (abs >= 11 && abs <= 19) {
      return `${count} шагов`;
    }
    if (mod === 1) {
      return `${count} шаг`;
    }
    if (mod >= 2 && mod <= 4) {
      return `${count} шага`;
    }
    return `${count} шагов`;
  };

  const formatMessageBlock = (message: Message) => {
    const role = message.type === 'user' ? 'Пользователь' : 'Ассистент';
    const headerParts = [`**${role}**`];

    if (message.workspaceMode) {
      headerParts.push(`режим: ${message.workspaceMode}`);
    }
    if (message.agentType) {
      headerParts.push(`агент: ${message.agentType}`);
    }
    if (isAgentMessage(message)) {
      if (message.agentState) headerParts.push(`состояние: ${message.agentState}`);
      if (message.actionType) headerParts.push(`действие: ${message.actionType}`);
    }

    const timestamp = normalizeDate(message.timestamp);
    const timestampLine = timestamp ? `_Время: ${formatTimestamp(timestamp)}_` : '';

    let block = `${headerParts.join(' · ')}${timestampLine ? `\n${timestampLine}` : ''}\n\n${message.content || 'Нет содержимого'}`;

    if (isAgentMessage(message)) {
      if (message.goal) {
        block += `\n\n**Цель:** ${message.goal}`;
      }
      if (message.contextId) {
        block += `\n\n**Контекст:** ${message.contextId}`;
      }
      if (message.metadata && Object.keys(message.metadata).length > 0) {
        const metadataLines = Object.entries(message.metadata)
          .map(([key, value]) => `- ${key}: ${formatMetadataValue(value)}`)
          .join('\n');
        if (metadataLines) {
          block += `\n\n**Метаданные:**\n${metadataLines}`;
        }
      }
    }

    return block.trim();
  };

  const buildSessionContent = (session: AnySession, type: 'chat' | 'image' | 'workspace') => {
    const messagesContent = (session.messages || []).map(formatMessageBlock).join('\n\n---\n\n');
    const baseContent = messagesContent || '_Нет сообщений_';

    if (type === 'image' && 'images' in session && Array.isArray(session.images) && session.images.length > 0) {
      const imageDetails = session.images
        .map((img: { id: string; url: string; prompt: string }, index: number) => {
          if (!img || typeof img !== 'object') {
            return `- Изображение ${index + 1}`;
          }
          const prompt = img.prompt ? ` — ${img.prompt}` : '';
          const url = img.url ? ` ([ссылка](${img.url}))` : '';
          return `- Изображение ${index + 1}${prompt}${url}`;
        })
        .join('\n');

      return `**${session.title || 'Сессия'}**\n\n${baseContent}\n\n**Изображения:**\n${imageDetails}`.trim();
    }

    return `**${session.title || 'Сессия'}**\n\n${baseContent}`.trim();
  };

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
    // chatSessions гарантирован как массив благодаря useKV defaultValue
    const list = [
      ...(currentChatSession ? [currentChatSession] : []),
      ...chatSessions,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [currentChatSession, chatSessions]);

  const imageList = useMemo(() => {
    // imageSessions гарантирован как массив благодаря useKV defaultValue
    const list = imageSessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [imageSessions]);

  const workspaceList = useMemo(() => {
    // workspaceSessions гарантирован как массив благодаря useKV defaultValue
    const list = [
      ...(currentWorkspaceSession ? [currentWorkspaceSession] : []),
      ...workspaceSessions,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [currentWorkspaceSession, workspaceSessions]);

  const getPreview = (msgs: Message[]) => {
    const lastUser = msgs.filter(m => m.type === 'user').pop();
    if (lastUser) {
      return lastUser.content;
    }
    if (msgs.length > 0) {
      return msgs[0].content;
    }
    return '';
  };

  const handleOpen = (session: AnySession, type: 'chat' | 'image' | 'workspace') => {
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

  const SectionHeader = ({ icon, title, isOpen, onToggle }: { icon: ReactNode; title: string; isOpen: boolean; onToggle: () => void }) => (
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

  const renderSessionItem = (session: AnySession, type: 'chat' | 'image' | 'workspace') => {
    const messages: Message[] = session.messages || [];
    const meta = formatStepsCount(messages.length) || undefined;
    const typeLabel = type === 'image' ? 'IMG' : type === 'workspace' ? 'WS' : 'CHAT';

    return (
      <ChatStepPreview
        key={`${type}_${session.id}`}
        title={session.title || 'Сессия'}
        preview={getPreview(messages)}
        content={buildSessionContent(session, type)}
        typeLabel={typeLabel}
        timestamp={normalizeDate(session.timestamp)}
        meta={meta}
        isActive={selectedId === session.id}
        onSelect={() => handleOpen(session, type)}
      />
    );
  };

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
                chatList.map((session) => (
                  <React.Fragment key={session.id}>
                    {renderSessionItem(session, 'chat')}
                  </React.Fragment>
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
                imageList.map((session) => (
                  <React.Fragment key={session.id}>
                    {renderSessionItem(session, 'image')}
                  </React.Fragment>
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
                workspaceList.map((session) => (
                  <React.Fragment key={session.id}>
                    {renderSessionItem(session, 'workspace')}
                  </React.Fragment>
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
