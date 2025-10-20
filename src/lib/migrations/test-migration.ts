import { MigrationRegistry } from './migration-registry.ts';
import v1ToV2Migration from './migrations/v1-to-v2.ts';

// Создаем экземпляр реестра миграций
const registry = new MigrationRegistry();

// Регистрируем миграцию
registry.register(v1ToV2Migration);

// Пример данных в формате v1.0.0
const v1Data = {
  version: '1.0.0',
  userId: 'user-123',
  userName: 'Test User',
  settings: {
    notifications: true
  },
  preferences: {
    theme: 'dark'
  }
};

// Тестируем миграцию вверх
async function testMigration() {
  console.log('Исходные данные (v1.0.0):', v1Data);
  
  // Применяем миграцию до версии 2.0.0
  const migratedData = await registry.migrate('1.0.0', '2.0.0', v1Data);
  console.log('После миграции (v2.0.0):', migratedData);
  
  // Тестируем откат
  const rolledBackData = await registry.rollback('2.0.0', '1.0.0', migratedData);
  console.log('После отката (v1.0.0):', rolledBackData);
  
  // Проверяем список зарегистрированных миграций
  console.log('Зарегистрированные миграции:', registry.getMigrations());
}

// Экспортируем для использования в других модулях
export { registry, testMigration };