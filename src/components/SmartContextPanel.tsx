import React from 'react';
import { useSmartContext } from '@/hooks/use-smart-context';
import { WorkMode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, ChatCircle, FileText, Target, Code, Warning, Clock, MagnifyingGlass, TrendUp } from '@phosphor-icons/react';

interface SmartContextPanelProps {
  query: string;
  mode: WorkMode;
  onSuggestionClick?: (suggestion: string) => void;
  className?: string;
}

export function SmartContextPanel({ 
  query, 
  mode, 
  onSuggestionClick,
  className = '' 
}: SmartContextPanelProps) {
  const {
    isLoading,
    context,
    error,
    lastQuery,
    searchContext,
    getQuickSuggestions,
    getContextInfo,
  } = useSmartContext({ autoSearch: true, debounceMs: 800 });

  // Запускаем поиск при изменении запроса
  React.useEffect(() => {
    if (query.trim() && query !== lastQuery) {
      searchContext(query, mode);
    }
  }, [query, mode, lastQuery, searchContext]);

  const suggestions = getQuickSuggestions(query, mode);
  const contextInfo = getContextInfo();

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'message': return <ChatCircle size={16} />;
      case 'file': return <FileText size={16} />;
      case 'plan': return <Target size={16} />;
      case 'code': return <Code size={16} />;
      case 'error': return <Warning size={16} />;
      default: return <Brain size={16} />;
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (!query.trim()) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain size={20} />
            Умный контекст
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <MagnifyingGlass size={48} className="mx-auto mb-4 opacity-50" />
            <p>Введите запрос для поиска релевантного контекста</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain size={20} />
          Умный контекст
          {isLoading && (
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
          )}
        </CardTitle>
        {contextInfo && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendUp size={14} />
            {contextInfo.summary}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Состояние загрузки */}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {/* Ошибка */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <Warning size={16} />
              {error}
            </div>
          </div>
        )}

        {/* Контекст найден */}
        {context && !isLoading && (
          <>
            {/* Статистика контекста */}
            {contextInfo && (
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className="text-lg font-semibold">{contextInfo.documentCount}</div>
                  <div className="text-xs text-muted-foreground">документов</div>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <div className="text-lg font-semibold">
                    {Math.round(contextInfo.avgRelevance * 100)}%
                  </div>
                  <div className="text-xs text-muted-foreground">релевантность</div>
                </div>
              </div>
            )}

            {/* Релевантные документы */}
            {context.relevantDocuments.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText size={16} />
                    Релевантные документы
                  </h4>
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {context.relevantDocuments.slice(0, 5).map((doc, index) => (
                        <div
                          key={doc.id}
                          className="p-2 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {getTypeIcon(doc.type)}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate">
                                  {doc.metadata?.filepath || `${doc.type}_${index + 1}`}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {doc.content.slice(0, 80)}...
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {doc.relevanceScore && (
                                <div
                                  className={`w-2 h-2 rounded-full ${getRelevanceColor(doc.relevanceScore)}`}
                                  title={`Релевантность: ${Math.round(doc.relevanceScore * 100)}%`}
                                />
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {doc.type}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock size={12} className="text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(doc.timestamp).toLocaleDateString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}

            {/* Ключевые темы */}
            {context.keyTopics.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3">Ключевые темы</h4>
                  <div className="flex flex-wrap gap-1">
                    {context.keyTopics.slice(0, 8).map((topic, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="text-xs cursor-pointer hover:bg-accent"
                        onClick={() => onSuggestionClick?.(topic)}
                      >
                        #{topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Предлагаемые вопросы */}
            {suggestions.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-3">Предлагаемые вопросы</h4>
                  <div className="space-y-1">
                    {suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-left h-auto p-2 text-xs"
                        onClick={() => onSuggestionClick?.(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Пустой результат */}
        {context && !isLoading && context.relevantDocuments.length === 0 && (
          <div className="text-center text-muted-foreground py-6">
            <MagnifyingGlass size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Релевантный контекст не найден</p>
            <p className="text-xs">Попробуйте изменить запрос или добавить больше контента</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SmartContextPanel;