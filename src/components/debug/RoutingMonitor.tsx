import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { routingLogger, RoutingLogEntry, RequestMetrics } from '@/lib/services/routing-logger';
import { 
  Clock, 
  Warning, 
  Check, 
  X, 
  Circle, 
  Lightning, 
  MagnifyingGlass,
  Funnel,
  Download,
  Trash,
  ArrowClockwise,
  ChartBar,
  TrendUp,
  Cpu,
  Globe
} from '@phosphor-icons/react';

interface RoutingMonitorProps {
  className?: string;
}

export const RoutingMonitor: React.FC<RoutingMonitorProps> = ({ className }) => {
  const [logs, setLogs] = useState<RoutingLogEntry[]>([]);
  const [metrics, setMetrics] = useState<RequestMetrics | null>(null);
  const [filter, setFilter] = useState({
    type: 'all' as RoutingLogEntry['type'] | 'all',
    level: 'all' as RoutingLogEntry['level'] | 'all',
    category: 'all' as RoutingLogEntry['category'] | 'all',
    model: '',
    search: ''
  });
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Загрузка данных
  const loadData = () => {
    setLogs(routingLogger.getLogs());
    setMetrics(routingLogger.getMetrics());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Автообновление
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Фильтрация логов
  const filteredLogs = useMemo(() => {
    return routingLogger.getLogs({
      type: filter.type === 'all' ? undefined : filter.type,
      level: filter.level === 'all' ? undefined : filter.level,
      category: filter.category === 'all' ? undefined : filter.category,
      model: filter.model || undefined,
      search: filter.search || undefined
    });
  }, [logs, filter]);

  // Уникальные модели для фильтра
  const uniqueModels = useMemo(() => {
    const models = new Set(logs.map(log => log.model).filter((m): m is string => Boolean(m)));
    return Array.from(models);
  }, [logs]);

  // Очистка логов
  const clearLogs = () => {
    routingLogger.clearLogs();
    loadData();
  };

  // Экспорт логов
  const exportLogs = () => {
    const data = routingLogger.exportLogs();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routing-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Получение иконки для уровня лога
  const getLevelIcon = (level: RoutingLogEntry['level']) => {
    switch (level) {
      case 'error':
        return <X className="h-4 w-4 text-red-500" />;
      case 'warn':
        return <Warning className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Check className="h-4 w-4 text-blue-500" />;
      case 'debug':
        return <Circle className="h-4 w-4 text-gray-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-500" />;
    }
  };

  // Получение цвета для типа лога
  const getTypeColor = (type: RoutingLogEntry['type']) => {
    switch (type) {
      case 'request':
        return 'bg-blue-100 text-blue-800';
      case 'response':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'routing':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Форматирование времени
  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Форматирование длительности
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Заголовок и управление */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Circle className="h-5 w-5" />
              Монитор маршрутизации запросов
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
              >
                <ArrowClockwise className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                Автообновление
              </Button>
              <Button variant="outline" size="sm" onClick={loadData}>
                <ArrowClockwise className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={exportLogs}>
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={clearLogs}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Метрики */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Всего запросов</p>
                  <p className="text-2xl font-bold">{metrics.totalRequests}</p>
                </div>
                <Circle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Успешных</p>
                  <p className="text-2xl font-bold text-green-600">{metrics.successfulRequests}</p>
                </div>
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ошибок</p>
                  <p className="text-2xl font-bold text-red-600">{metrics.failedRequests}</p>
                </div>
                <X className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Среднее время</p>
                  <p className="text-2xl font-bold">{formatDuration(metrics.averageResponseTime)}</p>
                </div>
                <Clock className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Логи</TabsTrigger>
          <TabsTrigger value="stats">Статистика</TabsTrigger>
          <TabsTrigger value="errors">Ошибки</TabsTrigger>
        </TabsList>

        {/* Логи */}
        <TabsContent value="logs" className="space-y-4">
          {/* Фильтры */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="relative">
                  <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    value={filter.search}
                    onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10"
                  />
                </div>
                
                <Select value={filter.type} onValueChange={(value: string) => setFilter(prev => ({ ...prev, type: value as 'all' | RoutingLogEntry['type'] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    <SelectItem value="request">Запросы</SelectItem>
                    <SelectItem value="response">Ответы</SelectItem>
                    <SelectItem value="error">Ошибки</SelectItem>
                    <SelectItem value="routing">Маршрутизация</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filter.level} onValueChange={(value: string) => setFilter(prev => ({ ...prev, level: value as 'all' | RoutingLogEntry['level'] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Уровень" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все уровни</SelectItem>
                    <SelectItem value="error">Ошибки</SelectItem>
                    <SelectItem value="warn">Предупреждения</SelectItem>
                    <SelectItem value="info">Инфо</SelectItem>
                    <SelectItem value="debug">Отладка</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filter.category} onValueChange={(value: string) => setFilter(prev => ({ ...prev, category: value as 'all' | RoutingLogEntry['category'] }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Категория" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все категории</SelectItem>
                    <SelectItem value="model-selection">Выбор модели</SelectItem>
                    <SelectItem value="routing">Маршрутизация</SelectItem>
                    <SelectItem value="api-call">API вызовы</SelectItem>
                    <SelectItem value="performance">Производительность</SelectItem>
                    <SelectItem value="error">Ошибки</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filter.model} onValueChange={(value) => setFilter(prev => ({ ...prev, model: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Модель" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Все модели</SelectItem>
                    {uniqueModels.map(model => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Список логов */}
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="space-y-1 p-4">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Нет логов, соответствующих фильтрам
                    </div>
                  ) : (
                    filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="mt-0.5">
                          {getLevelIcon(log.level)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className={getTypeColor(log.type)}>
                              {log.type}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {log.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(log.timestamp)}
                            </span>
                            {log.duration && (
                              <Badge variant="outline" className="text-xs">
                                <Lightning className="h-3 w-3 mr-1" />
                                {formatDuration(log.duration)}
                              </Badge>
                            )}
                            {log.model && (
                              <Badge variant="outline" className="text-xs">
                                {log.model.startsWith('local') ? <Cpu className="h-3 w-3 mr-1" /> : <Globe className="h-3 w-3 mr-1" />}
                                {log.model}
                              </Badge>
                            )}
                          </div>
                          
                          <p className="text-sm font-medium mb-1">{log.message}</p>
                          
                          {Boolean(log.data && typeof log.data === 'object' && Object.keys(log.data as Record<string, unknown>).length > 0) && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Детали ({Object.keys(log.data as Record<string, unknown>).length})
                              </summary>
                              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Статистика */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Использование моделей */}
            {metrics && Object.keys(metrics.modelUsage).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ChartBar className="h-5 w-5" />
                    Использование моделей
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.modelUsage)
                      .sort(([,a], [,b]) => b - a)
                      .map(([model, count]) => (
                        <div key={model} className="flex items-center justify-between">
                          <span className="text-sm flex items-center gap-2">
                            {model.startsWith('local') ? <Cpu className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                            {model}
                          </span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Использование провайдеров */}
            {metrics && Object.keys(metrics.providerUsage).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendUp className="h-5 w-5" />
                    Использование провайдеров
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.providerUsage)
                      .sort(([,a], [,b]) => b - a)
                      .map(([provider, count]) => (
                        <div key={provider} className="flex items-center justify-between">
                          <span className="text-sm">{provider}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Типы ошибок */}
            {metrics && Object.keys(metrics.errorTypes).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Warning className="h-5 w-5" />
                    Типы ошибок
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(metrics.errorTypes)
                      .sort(([,a], [,b]) => b - a)
                      .map(([errorType, count]) => (
                        <div key={errorType} className="flex items-center justify-between">
                          <span className="text-sm">{errorType}</span>
                          <Badge variant="destructive">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Ошибки */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="space-y-1 p-4">
                  {routingLogger.getErrors().length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Ошибок не найдено
                    </div>
                  ) : (
                    routingLogger.getErrors().map((log) => (
                      <div
                        key={log.id}
                        className="p-4 rounded-lg border border-red-200 bg-red-50"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <X className="h-5 w-5 text-red-500" />
                          <span className="font-medium text-red-800">
                             {(log.data && typeof log.data === 'object' && 'errorType' in log.data ? (log.data as Record<string, unknown>).errorType : 'Error') as string}
                           </span>
                          <span className="text-sm text-red-600">
                            {formatTime(log.timestamp)}
                          </span>
                          {log.model && (
                            <Badge variant="outline" className="text-xs">
                              {log.model}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-red-700 mb-2">{log.message}</p>
                        
                        {Boolean(log.data && typeof log.data === 'object' && Object.keys(log.data as Record<string, unknown>).length > 0) && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-red-600 hover:text-red-800">
                              Контекст ошибки
                            </summary>
                            <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};