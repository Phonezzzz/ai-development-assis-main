import { useMemo, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useKV } from '@/shims/spark-hooks';
import { Message } from '@/lib/types';
import { cn, formatTimestamp } from '@/lib/utils';
import { ChatCircle, CaretDown } from '@phosphor-icons/react';
import { ChatStepPreview } from '@/components/ChatStepPreview';
import { useWorkspaceHistoryStore } from '@/stores/workspace-history-store';
import type { WorkspaceSession } from '@/types/workspace';

interface HistorySidebarProps {
  onLoadSession?: (sessionId: string) => void;
}

export function HistorySidebar({ onLoadSession }: HistorySidebarProps) {
  const { sessions, activeSessionId, setActiveSession } = useWorkspaceHistoryStore();
  const [workspaceChat] = useKV<Array<{ id: string; question: string; answer: string; timestamp: Date; isTyping?: boolean }>>('workspace-chat', []);
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const normalizeDate = (value: Date | string | number | undefined | null) => {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
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

  const currentWorkspaceSession = useMemo(() => (
    (workspaceChat && workspaceChat.length > 0)
      ? { 
          id: 'current_ws', 
          title: 'Текущая сессия',
          messages: toWorkspaceMessages(workspaceChat), 
          timestamp: new Date()
        }
      : null
  ), [workspaceChat]);

  const workspaceList = useMemo(() => {
    // sessions гарантирован как массив благодаря zustand store initialState
    const list = sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }, [sessions]);

  const getPreview = (session: WorkspaceSession) => {
    return session.description || session.name || '';
  };

  const buildSessionContent = (session: WorkspaceSession) => {
    const baseContent = session.description || 'Нет описания';
    return `**${session.name || 'Workspace Сессия'}**\n\n${baseContent}`.trim();
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

  const handleOpen = (session: WorkspaceSession) => {
    setSelectedId(session.id);
    setActiveSession(session.id);
    if (onLoadSession) {
      onLoadSession(session.id);
    }
  };

  const SectionHeader = ({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) => (
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
      <span className="flex-shrink-0"><ChatCircle size={14} className="text-green-500" /></span>
      <span className="truncate">Workspace History</span>
      <span className={cn("ml-auto transition-transform", isOpen ? "rotate-180" : "rotate-0")}>
        <CaretDown size={14} />
      </span>
    </button>
  );

  const renderSessionItem = (session: WorkspaceSession) => {
    return (
      <ChatStepPreview
        key={`workspace_${session.id}`}
        title={session.name || 'Workspace Сессия'}
        preview={getPreview(session)}
        content={buildSessionContent(session)}
        typeLabel="WS"
        timestamp={normalizeDate(session.createdAt)}
        meta={undefined}
        isActive={selectedId === session.id || activeSessionId === session.id}
        onSelect={() => handleOpen(session)}
      />
    );
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="p-4 rounded-xl bg-neutral-2/85 shadow-[0_0_22px_rgba(255,102,0,0.28)]">
        <h3 className="font-semibold">Workspace Sessions</h3>
      </div>
      <ScrollArea className="flex-1 rounded-xl bg-neutral-1/80 shadow-[0_0_26px_rgba(255,102,0,0.18)]">
        <div className="p-3 space-y-2">
          <SectionHeader
            isOpen={expanded}
            onToggle={() => setExpanded(prev => !prev)}
          />
          {expanded && (
            <div className="mb-2 space-y-1">
              {workspaceList.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/80">Нет workspace сессий</div>
              ) : (
                workspaceList.map((session) => renderSessionItem(session))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}