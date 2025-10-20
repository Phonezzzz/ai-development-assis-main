import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ModeShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  content: ReactNode;
  mainClassName?: string;
}

export function ModeShell({
  sidebar,
  header,
  content,
  mainClassName,
}: ModeShellProps) {
  return (
    <div className="flex h-screen bg-black text-white dark">
      {sidebar}
      <div className={cn('flex-1 flex flex-col overflow-hidden relative bg-neutral-1', mainClassName)}>
        <div className="mode-buttons">
          {header}
        </div>
        <div className="flex-1 overflow-hidden">
          {content}
        </div>
      </div>
    </div>
  );
}

export interface ModeSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  title: string;
  topSection?: ReactNode;
  bottomSection?: ReactNode;
}

export function ModeSidebar({
  collapsed,
  onToggleCollapse,
  title,
  topSection,
  bottomSection,
}: ModeSidebarProps) {
  return (
    <aside
      className={cn(
        'bg-neutral-1 border-r border-neutral-4 transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-80',
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
        {!collapsed && topSection}
      </div>

      {!collapsed && bottomSection}
    </aside>
  );
}