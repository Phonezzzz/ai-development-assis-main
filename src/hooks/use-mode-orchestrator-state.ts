import { useEffect } from 'react';
import { dataMigration } from '@/lib/services/data-migration';
import { routingLogger } from '@/lib/services/routing-logger';
import { emitAgentError, emitAgentWarning } from '@/lib/services/agent-event-system';
import { toast } from 'sonner';

export function useModeOrchestratorState() {
  const isDevelopment = import.meta.env.DEV;

  useEffect(() => {
    if (isDevelopment) {
      routingLogger.logDebug('Application started in development mode', {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        version: import.meta.env.VITE_APP_VERSION || 'unknown'
      });
    }
  }, [isDevelopment]);

  useEffect(() => {
    const initializeDataMigration = async () => {
      try {
        console.log('🔄 Инициализация миграции данных...');
        const migrationResult = await dataMigration.migrate();

        if (migrationResult.success) {
          if (migrationResult.cleanedItems.length > 0) {
            console.log(`✅ Миграция завершена. Очищено элементов: ${migrationResult.cleanedItems.length}`);
            toast.success(`Данные обновлены: очищено ${migrationResult.cleanedItems.length} элементов`, {
              duration: 3000,
              description: migrationResult.cleanedItems.slice(0, 3).join(', ')
            });
          } else {
            console.log('✅ Миграция завершена. Очистка не требовалась.');
          }

          if (migrationResult.errors.length > 0) {
            console.warn('⚠️ Ошибки миграции:', migrationResult.errors);
            emitAgentWarning({
              message: 'Некоторые данные не удалось очистить',
              description: `${migrationResult.errors.length} ошибок`,
              source: 'mode-orchestrator',
              scope: 'data-migration',
              context: { errors: migrationResult.errors }
            });
          }
        } else {
          console.error('❌ Ошибка миграции данных:', migrationResult.errors);
          emitAgentError({
            message: 'Ошибка при обновлении данных',
            description: 'Проверьте консоль для деталей',
            source: 'mode-orchestrator',
            scope: 'data-migration',
            context: { errors: migrationResult.errors }
          });
        }
      } catch (error) {
        console.error('❌ Критическая ошибка миграции:', error);
        emitAgentError({
          message: 'Критическая ошибка при инициализации данных',
          source: 'mode-orchestrator',
          scope: 'data-migration',
          error
        });
      }
    };

    initializeDataMigration();
  }, []);

  return {
    isDevelopment
  };
}