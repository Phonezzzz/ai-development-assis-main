import { ScrollArea } from '@/components/ui/scroll-area';

interface HistoryItem {
  index: number;
  title: string;
  resultSummary?: string;
}

interface HistorySummaryProps {
  items: HistoryItem[];
}

/**
 * Компактная сводка завершённых шагов плана
 * Показывает только краткие результаты в ScrollArea для компактности
 */
export function HistorySummary({ items }: HistorySummaryProps) {
  if (!items?.length) {
    return null;
  }

  return (
    <div className="rounded-md border bg-card">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
        История шагов
      </div>
      <ScrollArea className="max-h-44">
        <ul className="px-3 pb-3 text-sm">
          {items.map((item) => (
            <li key={item.index} className="space-y-0.5 py-1.5">
              <div className="font-medium text-foreground">
                Шаг {item.index + 1}: {item.title}
              </div>
              {item.resultSummary ? (
                <div className="text-xs text-muted-foreground">
                  {item.resultSummary}
                </div>
              ) : (
                <div className="text-xs italic text-muted-foreground">—</div>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
