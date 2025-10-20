import React, { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChatHistory } from '@/components/ChatHistory';
import { SettingsDialog } from '@/components/SettingsDialog';
import { WorkRulesDialog } from '@/components/WorkRulesDialog';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { ChevronLeft, ChevronRight, Bug, TestTube } from 'lucide-react';

interface ModeSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  title: string;
  topSection?: ReactNode;
  bottomSection?: ReactNode;
  messages: Message[];
  onLoadSession: (sessionMessages: Message[]) => void;
  onNewChat: () => void;
  onClearHistory: () => void;
  showRoutingMonitor: boolean;
  showTestSuite: boolean;
  isDevelopment: boolean;
  onToggleRoutingMonitor: () => void;
  onToggleTestSuite: () => void;
}

export function ModeSidebar({
  collapsed,
  onToggleCollapse,
  title,
  topSection,
  bottomSection,
  messages,
  onLoadSession,
  onNewChat,
  onClearHistory,
  showRoutingMonitor,
  showTestSuite,
  isDevelopment,
  onToggleRoutingMonitor,
  onToggleTestSuite
}: ModeSidebarProps) {
  return (
    <aside
      className={cn(
        'bg-neutral-1 border-r border-neutral-4 transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-80'
      )}
    >
      <div className="p-4 border-b border-neutral-4">
        <div className="flex items-center justify-between">
          <h1 className={cn('font-bold text-xl text-orange-500', collapsed && 'hidden')}>
            {title}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="h-8 w-8 p-0 text-neutral-11 hover:text-orange-500 hover:bg-neutral-2"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!collapsed && (
          <div className="p-4 border-t border-neutral-4">
            <ChatHistory
              messages={messages || []}
              onLoadSession={onLoadSession}
              onNewChat={onNewChat}
              onClearHistory={onClearHistory}
            />
          </div>
        )}
        {!collapsed && topSection}
      </div>

      {!collapsed && (
        <div className="p-4 border-t border-neutral-4 space-y-2">
          <SettingsDialog />
          <WorkRulesDialog />
          {isDevelopment && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleRoutingMonitor}
                className="w-full justify-start border-neutral-6 text-neutral-11 hover:text-orange-500 hover:border-orange-600 hover:bg-neutral-2"
              >
                <Bug size={16} />
                Routing Monitor
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleTestSuite}
                className="w-full justify-start border-neutral-6 text-neutral-11 hover:text-orange-500 hover:border-orange-600 hover:bg-neutral-2"
              >
                <TestTube size={16} />
                Test Suite
              </Button>
            </>
          )}
        </div>
      )}
      {!collapsed && bottomSection}
    </aside>
  );
}