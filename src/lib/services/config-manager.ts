export interface ConfigSources {
  localStorage?: boolean;
  env?: boolean;
  config?: boolean;
}

export class ConfigManager {
  private cache = new Map<string, any>();

  /**
   * Получить значение конфигурации с указанным приоритетом источников
   * @param key Ключ конфигурации
   * @param defaultValue Значение по умолчанию
   * @param sources Настройки источников (по умолчанию все источники включены)
   */
  get<T>(key: string, defaultValue: T, sources: ConfigSources = {}): T {
    // Используем кэш если значение уже загружено
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const {
      localStorage: useLocalStorage = true,
      env: useEnv = true,
      config: useConfig = true
    } = sources;

    let value: T | undefined;

    // Приоритет источников: localStorage → env → config → default
    if (useLocalStorage) {
      value = this.getFromLocalStorage(key);
      if (value !== undefined) return this.cacheAndReturn(key, value);
    }

    if (useEnv) {
      value = this.getFromEnv(key);
      if (value !== undefined) return this.cacheAndReturn(key, value);
    }

    if (useConfig) {
      value = this.getFromConfig(key);
      if (value !== undefined) return this.cacheAndReturn(key, value);
    }

    // Возвращаем значение по умолчанию и кэшируем его
    return this.cacheAndReturn(key, defaultValue);
  }

  /**
   * Установить значение в localStorage и обновить кэш
   */
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.cache.set(key, value);
    } catch (error) {
      console.warn(`Не удалось сохранить значение в localStorage для ключа "${key}":`, error);
      throw new Error(`Failed to set config value for key "${key}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Очистить кэш для конкретного ключа или полностью
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  private getFromLocalStorage<T>(key: string): T | undefined {
    try {
      const item = localStorage.getItem(key);
      if (item) {
        return JSON.parse(item);
      }
    } catch (error) {
      console.warn(`Не удалось прочитать значение из localStorage для ключа "${key}":`, error);
      throw new Error(`Failed to get config value from localStorage for key "${key}": ${error instanceof Error ? error.message : String(error)}`);
    }
    return undefined;
  }

  private getFromEnv<T>(key: string): T | undefined {
    const envKey = `VITE_${key.toUpperCase()}`;
    const value = import.meta.env[envKey];
    
    if (value === undefined || value === '') {
      return undefined;
    }

    // Пытаемся преобразовать строковые значения в соответствующие типы
    if (value === 'true') return true as T;
    if (value === 'false') return false as T;
    if (!isNaN(Number(value))) return Number(value) as T;
    
    return value as T;
  }

  private getFromConfig<T>(key: string): T | undefined {
    // Разбираем путь к конфигурации (например: "openrouter.apiKey")
    const path = key.split('.');
    let current: any = config;

    for (const part of path) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }

    return current as T;
  }

  private cacheAndReturn<T>(key: string, value: T): T {
    this.cache.set(key, value);
    return value;
  }
}

// Импортируем существующую конфигурацию
import { config, Config } from '@/lib/config';

// Типы для известных конфигов
export type KnownConfigKeys = 
  | 'openrouter.apiKey'
  | 'openrouter.baseUrl'
  | 'elevenlabs.apiKey'
  | 'elevenlabs.baseUrl'
  | 'groq.apiKey'
  | 'groq.baseUrl'
  | 'openai.apiKey'
  | 'openai.baseUrl'
  | 'qdrant.url'
  | 'qdrant.apiKey'
  | 'api.baseUrl'
  | 'api.token'
  | 'localLLMUrl'
  | 'models.defaultLLM'
  | 'models.embeddingModel'
  | 'models.voiceModel'
  | 'features.realTimeVectorSearch'
  | 'features.voiceSynthesis'
  | 'features.projectIndexing'
  | 'features.agentSystem';

// Создаем экземпляр ConfigManager для глобального использования
export const configManager = new ConfigManager();