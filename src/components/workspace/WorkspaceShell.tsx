import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { memo } from 'react';
import { useWorkspaceChatStore } from '@/stores/workspace-chat-store';
import { useWorkspaceLayoutStore } from '@/stores/workspace-layout-store';
import { useWorkspaceHistoryStore } from '@/stores/workspace-history-store';
import { HistorySidebar } from './HistorySidebar';
import { ChatColumn } from './ChatColumn';
import { WorkbenchPanel } from './WorkbenchPanel';

// ИСПРАВЛЕНО: Мемоизируем компоненты панелей чтобы избежать бесконечного цикла
// при изменении размеров через react-resizable-panels
const MemoizedHistorySidebar = memo(HistorySidebar);
const MemoizedChatColumn = memo(ChatColumn);
const MemoizedWorkbenchPanel = memo(WorkbenchPanel);

export function WorkspaceShell() {
  const { messages, steps, isStreaming } = useWorkspaceChatStore();
  const { splitRatio, terminalHeight, filesVisible, terminalVisible } = useWorkspaceLayoutStore();
  const { sessions, activeSessionId } = useWorkspaceHistoryStore();

  return (
    <div className="flex h-full flex-col">
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Левая панель - HistorySidebar (30%) */}
        <Panel defaultSize={30} minSize={20} maxSize={40}>
          <MemoizedHistorySidebar />
        </Panel>

        <PanelResizeHandle className="w-1 bg-orange-500/15 hover:bg-orange-500/35 transition-all shadow-[0_0_18px_rgba(255,102,0,0.4)]" />

        {/* Центральная панель - ChatColumn (40%) */}
        <Panel defaultSize={40} minSize={30} maxSize={60}>
          <MemoizedChatColumn />
        </Panel>

        <PanelResizeHandle className="w-1 bg-orange-500/15 hover:bg-orange-500/35 transition-all shadow-[0_0_18px_rgba(255,102,0,0.4)]" />

        {/* Правая панель - WorkbenchPanel (30%) */}
        <Panel defaultSize={30} minSize={20} maxSize={40}>
          <MemoizedWorkbenchPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}