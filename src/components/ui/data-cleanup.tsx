import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Trash, 
  Warning, 
  CheckCircle, 
  Info, 
  Clock,
  Database,
  Broom,
  ArrowClockwise
} from '@phosphor-icons/react';
import { dataMigration, CleanupStats } from '@/lib/services/data-migration';
import { toast } from 'sonner';

interface DataCleanupProps {
  onCleanupComplete?: () => void;
}

export function DataCleanup({ onCleanupComplete }: DataCleanupProps) {
  const [isCleaning, setIsCleaning] = useState(false);
  const [migrationInfo, setMigrationInfo] = useState(dataMigration.getMigrationInfo());
  const [cleanupStats, setCleanupStats] = useState<CleanupStats | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Обновляем информацию о миграции
  useEffect(() => {
    const updateInfo = () => {
      setMigrationInfo(dataMigration.getMigrationInfo());
    };

    updateInfo();
    const interval = setInterval(updateInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  // Полная очистка данных моделей
  const handleFullCleanup = async () => {
    setIsCleaning(true);
    
    try {
      console.log('🧹 Начинаем полную очистку данных моделей...');
      toast.info('Начинаю очистку данных...', {
        description: 'Это может занять несколько секунд'
      });

      const stats = await dataMigration.fullCleanup();
      setCleanupStats(stats);

      if (stats.errors.length === 0) {
        toast.success('Очистка завершена успешно', {
          description: `Удалено ${stats.cleanedItems}/${stats.totalItems} элементов`
        });
      } else {
        toast.warning('Очистка завершена с ошибками', {
          description: `${stats.errors.length} ошибок при очистке`
        });
      }

      // Обновляем информацию о миграции
      setMigrationInfo(dataMigration.getMigrationInfo());
      
      // Вызываем колбэк если он предоставлен
      if (onCleanupComplete) {
        onCleanupComplete();
      }

    } catch (error) {
      console.error('❌ Ошибка при очистке данных:', JSON.stringify(error, null, 2));
      toast.error('Критическая ошибка при очистке данных', {
        description: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    } finally {
      setIsCleaning(false);
    }
  };

  // Повторная миграция
  const handleRerunMigration = async () => {
    setIsCleaning(true);
    
    try {
      console.log('🔄 Повторный запуск миграции...');
      toast.info('Запускаю миграцию данных...');

      const result = await dataMigration.migrate();
      
      if (result.success) {
        toast.success('Миграция завершена', {
          description: result.cleanedItems.length > 0 
            ? `Очищено ${result.cleanedItems.length} элементов`
            : 'Очистка не требовалась'
        });
      } else {
        toast.error('Ошибка миграции', {
          description: result.errors.join(', ')
        });
      }

      // Обновляем информацию
      setMigrationInfo(dataMigration.getMigrationInfo());
      
      if (onCleanupComplete) {
        onCleanupComplete();
      }

    } catch (error) {
      console.error('❌ Ошибка при миграции:', JSON.stringify(error, null, 2));
      toast.error('Ошибка миграции данных');
    } finally {
      setIsCleaning(false);
    }
  };

  // Форматирование даты
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Получение цвета статуса версии
  const getVersionStatusColor = (current: string, latest: string) => {
    if (current === latest) return 'bg-green-100 text-green-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  return (
    <div className="space-y-4">
      {/* Информация о текущем состоянии */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Состояние данных моделей
          </CardTitle>
          <CardDescription>
            Информация о версии данных и целостности системы
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Текущая версия:</span>
                <Badge className={getVersionStatusColor(migrationInfo.currentVersion, migrationInfo.latestVersion)}>
                  {migrationInfo.currentVersion}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Актуальная версия:</span>
                <Badge variant="outline">{migrationInfo.latestVersion}</Badge>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Статус:</span>
                <Badge className={migrationInfo.currentVersion === migrationInfo.latestVersion ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {migrationInfo.currentVersion === migrationInfo.latestVersion ? 'Актуально' : 'Требуется обновление'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">История миграций:</span>
                <Badge variant="secondary">{migrationInfo.history.length} записей</Badge>
              </div>
            </div>
          </div>

          {migrationInfo.currentVersion !== migrationInfo.latestVersion && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Warning className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                Требуется обновление данных. Рекомендуется запустить миграцию.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Кнопки действий */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Broom className="h-5 w-5" />
            Очистка данных
          </CardTitle>
          <CardDescription>
            Инструменты для очистки и восстановления данных моделей
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Повторная миграция */}
            <Button
              variant="outline"
              onClick={handleRerunMigration}
              disabled={isCleaning}
              className="flex items-center gap-2"
            >
              <ArrowClockwise className={`h-4 w-4 ${isCleaning ? 'animate-spin' : ''}`} />
              {isCleaning ? 'Миграция...' : 'Повторная миграция'}
            </Button>

            {/* Полная очистка */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  disabled={isCleaning}
                  className="flex items-center gap-2"
                >
                  <Trash className="h-4 w-4" />
                  {isCleaning ? 'Очистка...' : 'Сбросить все настройки'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <Warning className="h-5 w-5 text-destructive" />
                    Подтвердите сброс данных
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Это действие <strong>безвозвратно удалит</strong> все данные моделей:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Выбранные модели для всех режимов</li>
                      <li>Конфигурацию reasoning</li>
                      <li>Кэш моделей</li>
                      <li>Устаревшие данные</li>
                    </ul>
                    <p className="text-destructive font-medium">
                      После сброса потребуется заново выбрать модели и настроить параметры.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleFullCleanup}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {isCleaning ? 'Очистка...' : 'Сбросить все'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Статистика последней очистки */}
          {cleanupStats && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Статистика последней очистки
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Всего элементов:</span>
                  <div className="font-medium">{cleanupStats.totalItems}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Очищено:</span>
                  <div className="font-medium text-green-600">{cleanupStats.cleanedItems}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Ошибок:</span>
                  <div className="font-medium text-red-600">{cleanupStats.errors.length}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Эффективность:</span>
                  <div className="font-medium">
                    {cleanupStats.totalItems > 0 
                      ? `${Math.round((cleanupStats.cleanedItems / cleanupStats.totalItems) * 100)}%`
                      : 'N/A'
                    }
                  </div>
                </div>
              </div>
              
              {cleanupStats.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800">
                    Ошибки ({cleanupStats.errors.length})
                  </summary>
                  <ScrollArea className="mt-2 h-20">
                    <ul className="text-xs space-y-1">
                      {cleanupStats.errors.map((error: string, index: number) => (
                        <li key={index} className="text-red-600">• {error}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* История миграций */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            История миграций
          </CardTitle>
          <CardDescription>
            История обновлений данных моделей
          </CardDescription>
        </CardHeader>
        <CardContent>
          {migrationInfo.history.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>История миграций пуста</p>
            </div>
          ) : (
            <ScrollArea className="h-40">
              <div className="space-y-2">
                {migrationInfo.history.map((entry, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-2 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.migrated ? 'default' : 'destructive'}>
                        {entry.version}
                      </Badge>
                      <span className="text-sm">{entry.description}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.migrated ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Warning className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DataCleanup;