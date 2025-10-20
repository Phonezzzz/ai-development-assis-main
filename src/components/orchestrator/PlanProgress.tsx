/**
 * Прогресс-бар для отслеживания выполнения шагов плана
 * Показывает процент завершения по количеству шагов
 */
interface PlanProgressProps {
  total: number; // Всего шагов в плане
  currentIndex: number; // Текущий индекс шага (может быть -1 если завершено)
}

export function PlanProgress({ total, currentIndex }: PlanProgressProps) {
  // -1 означает завершение (все шаги пройдены)
  const done = currentIndex < 0 ? total : Math.min(currentIndex, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="w-full space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {done}/{total} шагов ({pct}%)
      </div>
    </div>
  );
}
