import { ModelInfo, ReasoningConfig } from '../types/models';
import { MigrationRegistry } from '../migrations';

// Создаем экземпляр реестра миграций
const migrationRegistry = new MigrationRegistry();

/**
 * Интерфейс для версии миграции
 */
interface MigrationVersion {
  version: string;
  description: string;
  timestamp: Date;
  migrated: boolean;
}

/**
 * Интерфейс для результата миграции
 */
interface MigrationResult {
  success: boolean;
  version: string;
  cleanedItems: string[];
  errors: string[];
  timestamp: Date;
}

/**
 * Интерфейс для статистики очистки
 */
export interface CleanupStats {
  totalItems: number;
  cleanedItems: number;
  errors: string[];
  cleanedKeys: string[];
}

/**
 * Класс для миграции данных и очистки некорректных состояний
 */
export class DataMigration {
  private readonly MIGRATION_VERSION_KEY = 'data-migration-version';
  private readonly MIGRATION_HISTORY_KEY = 'data-migration-history';
  private readonly LATEST_VERSION = '1.0.0';
  
  // Ключи localStorage которые требуют очистки
  private readonly MODEL_KEYS = [
    'selected-model:chat',
    'selected-model:workspace',
    'selected-model:image-creator',
    'model-reasoning-config',
    'available-models',
    'model-cache',
    'model-manager-state'
  ];

  // Ключи для очистки устаревших данных
  private readonly DEPRECATED_KEYS = [
    'model-config',
    'model-settings',
    'legacy-models',
    'old-model-cache',
    'model-state-backup',
    'selected-model-backup',
    'reasoning-state-backup'
  ];

  /**
   * Получение текущих данных для миграции
   */
  private getCurrentData(): any {
    const data: any = {};
    
    // Собираем все данные из localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            data[key] = JSON.parse(value);
          }
        } catch {
          // Игнорируем некорректные JSON данные
          data[key] = localStorage.getItem(key);
        }
      }
    }
    
    return {
      version: this.getCurrentVersion(),
      data: data
    };
  }

  /**
   * Сохранение данных после миграции
   */
  private saveData(data: any): void {
    if (data && data.data) {
      // Сохраняем данные обратно в localStorage
      Object.keys(data.data).forEach(key => {
        try {
          const value = data.data[key];
          if (typeof value === 'object') {
            localStorage.setItem(key, JSON.stringify(value));
          } else {
            localStorage.setItem(key, value);
          }
        } catch (error) {
          console.error(`Ошибка сохранения ключа ${key}:`, error);
        }
      });
    }
  }

  /**
   * Выполнение миграции данных при инициализации приложения
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      version: this.LATEST_VERSION,
      cleanedItems: [],
      errors: [],
      timestamp: new Date()
    };

    try {
      const current = this.getCurrentVersion();
      if (current === this.LATEST_VERSION) {
        console.log('✅ Миграция не требуется, версия данных актуальна:', this.LATEST_VERSION);
        return result;
      }

      console.log('🔄 Начинаем миграцию данных...');
      console.log(`📦 Миграция с версии ${current} до ${this.LATEST_VERSION}`);

      const data = await migrationRegistry.migrate(
        current,
        this.LATEST_VERSION,
        this.getCurrentData()
      );
      this.saveData(data);
      
      // Обновляем версию ПОСЛЕ успешной миграции
      this.updateMigrationVersion();

      // Сохраняем историю миграций
      this.saveMigrationHistory(result);

      console.log('✅ Миграция данных завершена успешно');
      return result;
    } catch (error) {
      console.error('❌ Ошибка при миграции данных:', error);
      result.success = false;
      result.errors.push(`Migration error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  /**
   * Полная очистка всех данных моделей
   */
  async fullCleanup(): Promise<CleanupStats> {
    console.log('🧹 Начинаем полную очистку данных моделей...');
    
    const stats: CleanupStats = {
      totalItems: 0,
      cleanedItems: 0,
      errors: [],
      cleanedKeys: []
    };

    try {
      // Очищаем все ключи моделей
      this.MODEL_KEYS.forEach(key => {
        stats.totalItems++;
        if (this.removeLocalStorageItem(key)) {
          stats.cleanedItems++;
          stats.cleanedKeys.push(key);
        }
      });

      // Очищаем устаревшие ключи
      this.DEPRECATED_KEYS.forEach(key => {
        stats.totalItems++;
        if (this.removeLocalStorageItem(key)) {
          stats.cleanedItems++;
          stats.cleanedKeys.push(key);
        }
      });

      console.log(`✅ Очистка завершена: ${stats.cleanedItems}/${stats.totalItems} элементов удалено`);
      return stats;
    } catch (error) {
      console.error('❌ Ошибка при очистке данных:', JSON.stringify(error, null, 2));
      stats.errors.push(`Cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return stats;
    }
  }

  /**
   * Очистка конфигурации reasoning
   */
  private cleanupReasoningConfig(): CleanupStats {
    const stats: CleanupStats = {
      totalItems: 0,
      cleanedItems: 0,
      errors: [],
      cleanedKeys: []
    };

    const reasoningKey = 'model-reasoning-config';
    stats.totalItems++;

    try {
      const value = localStorage.getItem(reasoningKey);
      if (value) {
        try {
          const config: ReasoningConfig = JSON.parse(value);
          
          // Проверяем валидность конфигурации
          if (!this.isValidReasoningConfig(config)) {
            if (this.removeLocalStorageItem(reasoningKey)) {
              stats.cleanedItems++;
              stats.cleanedKeys.push(reasoningKey);
              console.log(`🗑️ Удалена некорректная конфигурация reasoning`);
            }
          } else {
            // Исправляем конфигурацию если нужно
            const fixedConfig = this.fixReasoningConfig(config);
            if (fixedConfig) {
              localStorage.setItem(reasoningKey, JSON.stringify(fixedConfig));
              stats.cleanedKeys.push(`${reasoningKey} (fixed)`);
              console.log(`🔧 Конфигурация reasoning исправлена`);
            }
          }
        } catch (parseError) {
          // Некорректный JSON
          if (this.removeLocalStorageItem(reasoningKey)) {
            stats.cleanedItems++;
            stats.cleanedKeys.push(reasoningKey);
            console.log(`🗑️ Удалена некорректная JSON конфигурация reasoning`);
          }
        }
      }
    } catch (error) {
      const errorMsg = `Error processing reasoning config: ${error instanceof Error ? error.message : 'Unknown error'}`;
      stats.errors.push(errorMsg);
      console.error(errorMsg);
    }

    return stats;
  }

  /**
   * Валидация конфигурации reasoning
   */
  private isValidReasoningConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const cfg = config as Record<string, unknown>;

    return (
      typeof cfg.enabled === 'boolean' &&
      typeof cfg.modelId === 'string' &&
      typeof cfg.showThinkingProcess === 'boolean' &&
      typeof cfg.thinkingProcessStyle === 'string' &&
      ['expanded', 'collapsed', 'hidden'].includes(cfg.thinkingProcessStyle)
    );
  }

  /**
   * Исправление конфигурации reasoning
   */
  private fixReasoningConfig(config: ReasoningConfig): ReasoningConfig | null {
    let needsFix = false;
    const fixed = { ...config };
    
    if (!fixed.thinkingProcessStyle) {
      fixed.thinkingProcessStyle = 'expanded';
      needsFix = true;
    }
    
    if (typeof fixed.showThinkingProcess !== 'boolean') {
      fixed.showThinkingProcess = true;
      needsFix = true;
    }
    
    return needsFix ? fixed : null;
  }

  /**
   * Получение текущей версии миграции
   */
  private getCurrentVersion(): string {
    try {
      return localStorage.getItem(this.MIGRATION_VERSION_KEY) || '0.0.0';
    } catch (error) {
      throw new Error(`Failed to get migration version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Проверка нужна ли миграция
   */
  private shouldMigrate(currentVersion: string): boolean {
    return currentVersion !== this.LATEST_VERSION;
  }

  /**
   * Обновление версии миграции
   */
  private updateMigrationVersion(): void {
    try {
      localStorage.setItem(this.MIGRATION_VERSION_KEY, this.LATEST_VERSION);
    } catch (error) {
      console.error('Ошибка сохранения версии миграции:', JSON.stringify(error, null, 2));
    }
  }

  /**
   * Сохранение истории миграций
   */
  private saveMigrationHistory(result: MigrationResult): void {
    try {
      const history = this.getMigrationHistory();
      history.push({
        version: result.version,
        description: `Migration to version ${result.version}`,
        timestamp: result.timestamp,
        migrated: result.success
      });
      
      // Ограничиваем историю 10 записями
      if (history.length > 10) {
        history.splice(0, history.length - 10);
      }
      
      localStorage.setItem(this.MIGRATION_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Ошибка сохранения истории миграций:', JSON.stringify(error, null, 2));
    }
  }

  /**
   * Получение истории миграций
   */
  getMigrationHistory(): MigrationVersion[] {
    try {
      const history = localStorage.getItem(this.MIGRATION_HISTORY_KEY);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      throw new Error(`Failed to get migration history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Получение информации о миграции
   */
  getMigrationInfo(): { currentVersion: string; latestVersion: string; history: MigrationVersion[] } {
    return {
      currentVersion: this.getCurrentVersion(),
      latestVersion: this.LATEST_VERSION,
      history: this.getMigrationHistory()
    };
  }

  /**
   * Безопасное удаление элемента localStorage
   */
  private removeLocalStorageItem(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Ошибка удаления ключа ${key}:`, JSON.stringify(error, null, 2));
      return false;
    }
  }
}

// Экспорт синглтона
export const dataMigration = new DataMigration();