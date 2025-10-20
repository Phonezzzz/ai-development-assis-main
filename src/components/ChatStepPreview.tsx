import { useMemo, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { cn, formatTimestamp } from '@/lib/utils';

interface ChatStepPreviewProps {
  title: string;
  preview: string;
  content: string;
  typeLabel?: string;
  timestamp?: Date;
  meta?: string;
  isActive?: boolean;
  onSelect?: () => void;
}

export function ChatStepPreview({
  title,
  preview,
  content,
  typeLabel,
  timestamp,
  meta,
  isActive = false,
  onSelect,
}: ChatStepPreviewProps) {
  const [open, setOpen] = useState(false);

  const sanitizedPreview = useMemo(() => {
    if (!preview) {
      return 'Нет содержимого';
    }
    return preview.replace(/\s+/g, ' ').trim() || 'Нет содержимого';
  }, [preview]);

  const formattedTimestamp = useMemo(() => {
    if (!timestamp) {
      return null;
    }
    return formatTimestamp(timestamp);
  }, [timestamp]);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (!prev && onSelect) {
        onSelect();
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        'rounded-md transition-colors border border-transparent',
        open || isActive ? 'bg-accent/40 border-accent/50' : 'hover:bg-accent/20'
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
      >
        <div className="flex items-center gap-2">
          {typeLabel ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-muted-foreground/30 rounded px-1.5 py-0.5">
              {typeLabel}
            </span>
          ) : null}
          <span className="text-sm font-medium truncate flex-1">{title}</span>
          {meta ? <span className="text-[10px] text-muted-foreground whitespace-nowrap">{meta}</span> : null}
          {formattedTimestamp ? (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formattedTimestamp}</span>
          ) : null}
          <CaretDown
            size={14}
            className={cn('text-muted-foreground transition-transform flex-shrink-0', open ? 'rotate-180' : 'rotate-0')}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{sanitizedPreview}</div>
      </button>
      {open ? (
        <div className="px-3 pb-3">
          <div className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <MarkdownMessage content={content || 'Нет содержимого'} className="prose-sm leading-relaxed" />
          </div>
        </div>
      ) : null}
    </div>
  );
}