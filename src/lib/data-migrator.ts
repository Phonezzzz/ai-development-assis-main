import { AppDataSchema, DEFAULT_APP_DATA, LATEST_VERSION } from './data-schema';
import { DataValidator } from './validation/validator';
import { ModelIdSchema } from './validation/schemas';

interface LegacyStorageData {
  'selected-model-chat'?: string | null;
  'selected-model-workspace'?: string | null;
  'selected-model-image-creator'?: string | null;
  'model-reasoning-config-v2'?: any;
  'mode-orchestrator-state'?: any;
}

export class DataMigrator {
  private static readonly STORAGE_KEY = 'app-data';

  static migrateIfNeeded(): AppDataSchema {
    const currentData = this.getCurrentData();
    
    if (currentData.version === LATEST_VERSION) {
      return currentData;
    }

    console.log(`Migrating data from version ${currentData.version || 'legacy'} to ${LATEST_VERSION}`);
    
    // Миграция с legacy структуры
    if (!currentData.version) {
      return this.migrateFromLegacy();
    }

    // Миграция с версии 1 на версию 2
    if (currentData.version === 1) {
      return this.migrateFromV1ToV2(currentData);
    }

    return DEFAULT_APP_DATA;
  }

  private static getCurrentData(): any {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : { ...DEFAULT_APP_DATA };
    } catch {
      return { ...DEFAULT_APP_DATA };
    }
  }

  private static migrateFromLegacy(): AppDataSchema {
    const legacyData: LegacyStorageData = {};
    
    // Собираем данные из legacy ключей
    const legacyKeys = [
      'selected-model-chat',
      'selected-model-workspace', 
      'selected-model-image-creator',
      'model-reasoning-config-v2',
      'mode-orchestrator-state'
    ];

    legacyKeys.forEach(key => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          legacyData[key as keyof LegacyStorageData] = JSON.parse(value);
        }
      } catch {
        // Игнорируем некорректные данные
      }
    });

    const migratedData: AppDataSchema = {
      ...DEFAULT_APP_DATA,
      version: LATEST_VERSION,
    };

    // Мигрируем выбранные модели
    if (legacyData['selected-model-chat'] && DataValidator.validate(legacyData['selected-model-chat'], ModelIdSchema).success) {
      migratedData.models.selected.chat = legacyData['selected-model-chat'];
    }
    if (legacyData['selected-model-workspace'] && DataValidator.validate(legacyData['selected-model-workspace'], ModelIdSchema).success) {
      migratedData.models.selected.workspace = legacyData['selected-model-workspace'];
    }
    if (legacyData['selected-model-image-creator'] && DataValidator.validate(legacyData['selected-model-image-creator'], ModelIdSchema).success) {
      migratedData.models.selected['image-creator'] = legacyData['selected-model-image-creator'];
    }

    // Мигрируем конфигурацию reasoning
    if (legacyData['model-reasoning-config-v2']) {
      const reasoningConfig = legacyData['model-reasoning-config-v2'];
      Object.keys(reasoningConfig).forEach(scope => {
        if (reasoningConfig[scope]) {
          migratedData.models.reasoning[scope] = {
            enabled: reasoningConfig[scope].enabled ?? false,
            modelId: reasoningConfig[scope].modelId ?? '',
            showThinkingProcess: reasoningConfig[scope].showThinkingProcess ?? true,
            thinkingProcessStyle: reasoningConfig[scope].thinkingProcessStyle ?? 'expanded',
            lastToggled: reasoningConfig[scope].lastToggled,
          };
        }
      });
    }

    // Мигрируем состояние orchestrator
    if (legacyData['mode-orchestrator-state']) {
      migratedData.orchestrator = legacyData['mode-orchestrator-state'];
    }

    // Сохраняем мигрированные данные
    this.saveData(migratedData);

    // Очищаем legacy ключи
    legacyKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    console.log('Migration from legacy completed successfully');
    return migratedData;
  }

  private static migrateFromV1ToV2(v1Data: any): AppDataSchema {
    const migratedData: AppDataSchema = {
      ...DEFAULT_APP_DATA,
      version: LATEST_VERSION,
    };

    // Миграция с версии 1 на версию 2
    if (v1Data.models) {
      migratedData.models = {
        ...DEFAULT_APP_DATA.models,
        ...v1Data.models,
      };
    }

    if (v1Data.orchestrator) {
      migratedData.orchestrator = v1Data.orchestrator;
    }

    this.saveData(migratedData);
    console.log('Migration from v1 to v2 completed successfully');
    return migratedData;
  }

  private static saveData(data: AppDataSchema): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save migrated data:', error);
    }
  }

  static getData(): AppDataSchema {
    return this.migrateIfNeeded();
  }

  static setData(data: Partial<AppDataSchema>): void {
    const currentData = this.getData();
    const newData: AppDataSchema = {
      ...currentData,
      ...data,
      version: LATEST_VERSION,
    };
    this.saveData(newData);
  }

  static updateModels(updates: Partial<AppDataSchema['models']>): void {
    const currentData = this.getData();
    const newData: AppDataSchema = {
      ...currentData,
      models: {
        ...currentData.models,
        ...updates,
      },
    };
    this.saveData(newData);
  }

  static updateOrchestrator(updates: Partial<AppDataSchema['orchestrator']>): void {
    const currentData = this.getData();
    const newData: AppDataSchema = {
      ...currentData,
      orchestrator: {
        ...currentData.orchestrator,
        ...updates,
      },
    };
    this.saveData(newData);
  }
}