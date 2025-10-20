import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ExecutionToolbarProps {
  canCancel: boolean;
  canRetry: boolean;
  retryLabel?: string;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * Компактная панель управления выполнением плана
 * Показывает кнопки Cancel (во время выполнения) и Retry (при ошибке/готовности)
 */
export function ExecutionToolbar({
  canCancel,
  canRetry,
  retryLabel = 'Повторить шаг',
  onCancel,
  onRetry,
}: ExecutionToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={!canCancel}
            >
              Отмена
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Остановить выполнение и сохранить позицию
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              onClick={onRetry}
              disabled={!canRetry}
            >
              {retryLabel}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Перезапустить с текущего шага
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
