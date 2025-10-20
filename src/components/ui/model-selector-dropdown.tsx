import { useState, useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { CaretDown, MagnifyingGlass, Robot, CheckCircle, Warning, ArrowClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { ModelOption } from '@/lib/types';

interface ModelSelectorDropdownProps {
  availableModels: ModelOption[];
  selectedModel?: string;
  currentModel?: ModelOption;
  onModelSelect: (modelId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

export function ModelSelectorDropdown({
  availableModels,
  selectedModel,
  currentModel,
  onModelSelect,
  isLoading = false,
  error = null,
  onRefresh,
  className
}: ModelSelectorDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const getModelName = (): string => {
    return currentModel?.name || 'Не выбрана';
  };

  // Группировка моделей по провайдерам
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {};

    const filteredModels = availableModels.filter(model =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filteredModels.forEach(model => {
      if (!groups[model.provider]) {
        groups[model.provider] = [];
      }
      groups[model.provider].push(model);
    });

    return groups;
  }, [availableModels, searchQuery]);

  const getProviderIcon = (provider: string) => {
    const icons: Record<string, string> = {
      'OpenAI': '🤖',
      'Anthropic': '🧠',
      'Meta': '📘',
      'Google': '🔍',
      'Mistral AI': '🌊',
      'Local': '💻',
    };
    return icons[provider] || '🔮';
  };

  const handleModelSelect = (modelId: string) => {
    onModelSelect(modelId);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 w-6 p-0 transition-all duration-200 border",
            currentModel
              ? "bg-orange-500/20 border-orange-500/50 hover:bg-orange-500/30 hover:border-orange-500 hover:shadow-[0_0_8px_rgba(255,102,0,0.3)]"
              : "bg-neutral-3 hover:bg-neutral-2 border-transparent hover:border-orange-500 hover:shadow-[0_0_8px_rgba(255,102,0,0.3)]",
            className
          )}
          title={`Модель: ${getModelName()}`}
          disabled={isLoading}
        >
          {isLoading ? (
            <ArrowClockwise size={14} className="animate-spin" />
          ) : (
            <Robot size={14} className={currentModel ? "text-orange-400" : "text-neutral-11"} />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[400px] max-h-[500px] overflow-y-auto bg-neutral-1 border border-orange-500/25"
      >
        {/* Заголовок с поиском */}
        <div className="p-2 space-y-2 sticky top-0 bg-neutral-1 border-b border-orange-500/25">
          <div className="flex items-center justify-between">
            <DropdownMenuLabel>Выбор модели</DropdownMenuLabel>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                className="h-6 w-6 p-0"
                title="Обновить список моделей"
              >
                <ArrowClockwise size={14} />
              </Button>
            )}
          </div>

          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск модели..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm bg-neutral-2 border-orange-500/25"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {/* Индикатор загрузки */}
        {isLoading && (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {/* Ошибка */}
        {error && !isLoading && (
          <div className="p-4">
            <div className="flex items-center gap-2 text-red-400">
              <Warning size={16} />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Список моделей по провайдерам */}
        {!isLoading && !error && Object.keys(groupedModels).length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Модели не найдены
          </div>
        )}

        {!isLoading && !error && Object.entries(groupedModels).map(([provider, models]) => (
          <DropdownMenuGroup key={provider}>
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{getProviderIcon(provider)}</span>
              <span>{provider}</span>
              <Badge variant="outline" className="text-xs">{models.length}</Badge>
            </DropdownMenuLabel>

            {models.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
                className={cn(
                  "flex items-start gap-2 p-3 cursor-pointer",
                  selectedModel === model.id && "bg-orange-500/20"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{model.name}</span>
                    {model.free && <Badge variant="secondary" className="text-xs">Free</Badge>}
                    {model.supportsReasoning && (
                      <Badge variant="outline" className="text-xs">Reasoning</Badge>
                    )}
                  </div>
                  {model.description && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {model.description}
                    </div>
                  )}
                </div>
                {selectedModel === model.id && (
                  <CheckCircle size={16} className="text-orange-500 flex-shrink-0" />
                )}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
