import type { Migration } from '../migration-registry';

/**
 * Пример миграции из версии 1.0.0 в 2.0.0
 * Преобразует старую структуру данных в новую
 */
export const v1ToV2Migration: Migration = {
  version: '2.0.0',
  
  async up(data: any): Promise<any> {
    console.log('Применяем миграцию v1-to-v2...');
    
    // Преобразуем данные из старого формата в новый
    if (data && data.version === '1.0.0') {
      return {
        version: '2.0.0',
        // Преобразуем старые поля в новые
        settings: {
          ...data.settings,
          // Добавляем новые поля
          theme: data.settings && data.settings.theme ? data.settings.theme : 'light',
          language: data.settings && data.settings.language ? data.settings.language : 'ru'
        },
        // Реструктурируем данные пользователя
        user: {
          id: data.userId,
          name: data.userName,
          preferences: data.preferences || {}
        },
        // Сохраняем историю изменений
        migrationHistory: [
          ...(data.migrationHistory || []),
          {
            from: '1.0.0',
            to: '2.0.0',
            timestamp: new Date().toISOString(),
            description: 'Миграция на новую структуру данных'
          }
        ]
      };
    }
    
    // Если данные уже в новой версии, возвращаем как есть
    return data;
  },
  
  async down(data: any): Promise<any> {
    console.log('Откатываем миграцию v1-to-v2...');
    
    // Преобразуем данные обратно в старый формат
    if (data && data.version === '2.0.0') {
      return {
        version: '1.0.0',
        settings: {
          ...data.settings
        },
        userId: data.user && data.user.id ? data.user.id : undefined,
        userName: data.user && data.user.name ? data.user.name : undefined,
        preferences: data.user && data.user.preferences ? data.user.preferences : {}
      };
    }
    
    // Если данные в старой версии, возвращаем как есть
    return data;
  }
};

// Экспортируем по умолчанию для удобства импорта
export default v1ToV2Migration;