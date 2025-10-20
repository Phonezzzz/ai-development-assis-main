import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useModelSelection } from '@/hooks/use-model-selection';
import { useKV } from '@/shims/spark-hooks';
import { cn } from '@/lib/utils';
import { Clock, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';

interface SavePoint {
  id: string;
  timestamp: Date;
  contextUsed: number;
  messagesCount: number;
  description?: string;
}

interface ContextUsageBarProps {
  currentContextUsage: number;
  onRestoreToSavePoint?: (savePointId: string) => void;
  className?: string;
}

export function ContextUsageBar({
  currentContextUsage,
  onRestoreToSavePoint,
  className
}: ContextUsageBarProps) {
  const { currentModel } = useModelSelection();
  const [savePoints, setSavePoints] = useKV<SavePoint[]>('context-save-points', []);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const maxContext = currentModel && currentModel.contextLength ? currentModel.contextLength : 4096; // Default to 4k if no model
  const usagePercentage = (currentContextUsage / maxContext) * 100;


  // Create segments based on save points
  const segments = useMemo(() => {
    const points = [
      { id: 'start', contextUsed: 0, timestamp: new Date(), messagesCount: 0 },
      ...savePoints,
      { id: 'current', contextUsed: currentContextUsage, timestamp: new Date(), messagesCount: 0 }
    ].sort((a, b) => a.contextUsed - b.contextUsed);

    return points.slice(0, -1).map((point, index) => {
      const nextPoint = points[index + 1];
      const segmentUsage = nextPoint.contextUsed - point.contextUsed;
      const segmentPercentage = (segmentUsage / maxContext) * 100;

      return {
        id: point.id,
        startContext: point.contextUsed,
        endContext: nextPoint.contextUsed,
        usage: segmentUsage,
        percentage: segmentPercentage,
        timestamp: point.timestamp,
        description: point.description || `${point.messagesCount} сообщений`,
        isCurrent: nextPoint.id === 'current'
      };
    });
  }, [savePoints, currentContextUsage, maxContext]);

  const handleSavePoint = () => {
    const newSavePoint: SavePoint = {
      id: `save_${Date.now()}`,
      timestamp: new Date(),
      contextUsed: currentContextUsage,
      messagesCount: 0, // TODO: get actual message count
      description: `Save Point ${(savePoints && savePoints.length ? savePoints.length : 0) + 1}`
    };

    setSavePoints(prev => [...(prev || []), newSavePoint]);
  };

  const handleRestoreToPoint = (savePointId: string) => {
    if (onRestoreToSavePoint) {
      onRestoreToSavePoint(savePointId);
    }
  };

  const formatContext = (tokens: number) => {
    if (tokens < 1000) return `${tokens}`;
    if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
    return `${(tokens / 1000000).toFixed(1)}M`;
  };

  const getSegmentColor = (segment: { id: string; startContext: number; endContext: number; usage: number; percentage: number; timestamp: Date; description: string; isCurrent: boolean }) => {
    if (segment.isCurrent) {
      if (segment.percentage > 80) return 'bg-red-500';
      if (segment.percentage > 60) return 'bg-yellow-500';
      return 'bg-green-500';
    }
    return 'bg-blue-500';
  };

  return (
    <Card className={cn("p-3", className)}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted-foreground" />
            <span className="text-sm font-medium">Использование контекста</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSavePoint}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
            >
              <FloppyDisk size={12} className="mr-1" />
              Save Point
            </Button>
          </div>
        </div>

        {/* Progress Bar with Segments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatContext(currentContextUsage)}</span>
            <span>{formatContext(maxContext)}</span>
          </div>

          <div className="relative h-6 bg-muted rounded-lg overflow-hidden">
            {segments.map((segment, index) => (
              <div
                key={segment.id}
                className={cn(
                  "absolute top-0 h-full transition-all duration-200 cursor-pointer",
                  getSegmentColor(segment),
                  hoveredSegment === segment.id && "opacity-80 ring-2 ring-white"
                )}
                style={{
                  left: `${(segment.startContext / maxContext) * 100}%`,
                  width: `${segment.percentage}%`,
                }}
                onMouseEnter={() => setHoveredSegment(segment.id)}
                onMouseLeave={() => setHoveredSegment(null)}
                onClick={() => segment.id !== 'current' && handleRestoreToPoint(segment.id)}
                title={`${segment.description} - ${formatContext(segment.usage)} токенов`}
              >
                {segment.percentage > 5 && (
                  <div className="flex items-center justify-center h-full text-xs text-white font-medium">
                    {formatContext(segment.usage)}
                  </div>
                )}
              </div>
            ))}

            {/* Usage indicator */}
            <div
              className="absolute top-0 w-0.5 h-full bg-white shadow-lg"
              style={{ left: `${usagePercentage}%` }}
            />
          </div>

          {/* Usage percentage */}
          <div className="flex items-center justify-center">
            <Badge variant={usagePercentage > 90 ? "destructive" : usagePercentage > 70 ? "default" : "secondary"}>
              {usagePercentage.toFixed(1)}% использовано
            </Badge>
          </div>
        </div>

        {/* Hovered segment info */}
        {hoveredSegment && (
          <div className="text-xs text-center text-muted-foreground">
            {(() => {
              const segment = segments.find(s => s.id === hoveredSegment);
              return segment ? segment.description : '';
            })()}
            {hoveredSegment !== 'current' && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <ArrowCounterClockwise size={10} />
                <span>Нажмите для возврата к этой точке</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}