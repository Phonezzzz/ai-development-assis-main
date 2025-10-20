import React from 'react';
import { useAgent } from '@/hooks/useAgent';
import { useContextTracker } from '@/hooks/use-context-tracker';
import { WorkMode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, ChatCircle, FileText, Target, Code, Warning, Clock, MagnifyingGlass, TrendUp, Gauge, Trash } from '@phosphor-icons/react';

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
    smartContext,
    analyzeContext,
  } = useAgent();

  const {
    contextData,
    getContextBreakdown,
    checkContextLimit,
    resetContext
  } = useContextTracker();

  const { isAnalyzing: contextLoading, analysis: context, error: contextError, lastAnalyzedQuery } = smartContext;
  const contextBreakdown = getContextBreakdown();
  const contextLimitCheck = checkContextLimit(8000); // Используем стандартный лимит

  // Запускаем поиск при изменении запроса
  React.useEffect(() => {
    console.log('🔍 SmartContextPanel useEffect triggered', JSON.stringify({
      query: query.trim(),
      lastAnalyzedQuery,
      hasQuery: !!query.trim(),
      queryChanged: query !== lastAnalyzedQuery
    }, null, 2));
    
    if (query.trim() && query !== lastAnalyzedQuery) {
      console.log('🔄 Calling analyzeContext...');
      analyzeContext(query, mode);
    }
  }, [query, mode, lastAnalyzedQuery, analyzeContext]);

  const suggestions = context && context.keyTopics ? context.keyTopics : [];
  const contextInfo = context ? {
    summary: context.contextSummary,
    documentCount: context.relevantDocuments.length,
    avgRelevance: context.relevantDocuments.length > 0 
      ? context.relevantDocuments.reduce((sum, doc) => sum + (doc.similarity || 0), 0) / context.relevantDocuments.length
      : 0
  } : null;

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

  const getContextUsageColor = (percentage: number) => {
    if (percentage < 60) return 'text-green-600';
    if (percentage < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getContextUsageBgColor = (percentage: number) => {
    if (percentage < 60) return 'bg-green-500';
    if (percentage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleClearContext = () => {
    resetContext();
    // Можно добавить дополнительную логику очистки если нужно
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
            
            {/* Отображение использования контекста */}
            {contextBreakdown.total > 0 && (
              <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Использование контекста</span>
                  <span className={`text-sm font-semibold ${getContextUsageColor(contextLimitCheck.percentage)}`}>
                    {Math.round(contextLimitCheck.percentage)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full ${getContextUsageBgColor(contextLimitCheck.percentage)} transition-all duration-300`}
                    style={{ width: `${Math.min(contextLimitCheck.percentage, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{contextBreakdown.total.toLocaleString()} токенов</span>
                  <span>Лимит: 8,000</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <div>Сообщения: {contextBreakdown.messages.toLocaleString()}</div>
                  <div>Система: {contextBreakdown.system.toLocaleString()}</div>
                  <div>Файлы: {contextBreakdown.files.toLocaleString()}</div>
                </div>
                {contextLimitCheck.isNearLimit && (
                  <div className="mt-2 text-xs text-yellow-600">
                    ⚠️ Контекст приближается к лимиту
                  </div>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={handleClearContext}
                >
                  <Trash size={14} className="mr-2" />
                  Очистить контекст
                </Button>
              </div>
            )}
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
          {contextLoading && (
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
        {/* Информация об использовании контекста */}
        {contextBreakdown.total > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Gauge size={16} />
                <span className="text-sm font-medium">Использование контекста</span>
              </div>
              <span className={`text-sm font-semibold ${getContextUsageColor(contextLimitCheck.percentage)}`}>
                {Math.round(contextLimitCheck.percentage)}%
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div 
                className={`h-2 rounded-full ${getContextUsageBgColor(contextLimitCheck.percentage)} transition-all duration-300`}
                style={{ width: `${Math.min(contextLimitCheck.percentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{contextBreakdown.total.toLocaleString()} токенов</span>
              <span>Лимит: 8,000</span>
            </div>
            {contextLimitCheck.isNearLimit && (
              <div className="mt-1 text-xs text-yellow-600">
                ⚠️ Контекст приближается к лимиту
              </div>
            )}
          </div>
        )}

        {/* Состояние загрузки */}
        {contextLoading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {/* Ошибка */}
        {contextError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <Warning size={16} />
              {contextError}
            </div>
          </div>
        )}

        {/* Контекст найден */}
        {context && !contextLoading && (
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
                      {context.relevantDocuments.slice(0, 5).map((doc) => {
                        // Получаем filepath и валидируем его
                        const filepath = doc.metadata ? doc.metadata.filepath : undefined;
                        if (!filepath) {
                          console.error(`Document ${doc.id} missing filepath in metadata`);
                          // Пропускаем документ без filepath вместо показа fallback
                          return null;
                        }

                        return (
                          <div
                            key={doc.id}
                            className="p-2 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {getTypeIcon(doc.type)}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate">
                                    {String(filepath)}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {doc.content.slice(0, 80)}...
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {doc.similarity && (
                                  <div
                                    className={`w-2 h-2 rounded-full ${getRelevanceColor(doc.similarity)}`}
                                    title={`Релевантность: ${Math.round(doc.similarity * 100)}%`}
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
                        );
                      })}
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
        {context && !contextLoading && context.relevantDocuments.length === 0 && (
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