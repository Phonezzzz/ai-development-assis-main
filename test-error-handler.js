// Простой тест для проверки работы ErrorHandler
// Этот файл можно запустить в консоли браузера на работающем приложении

// Тест 1: Проверка классификации сетевых ошибок
console.log('=== Тест 1: Сетевая ошибка ===');
const networkError = new Error('Failed to fetch');
const networkClassification = window.errorHandler?.classifyError(networkError, 'Network test');
console.log('Network error classification:', networkClassification);

// Тест 2: Проверка классификации ошибки таймаута
console.log('=== Тест 2: Ошибка таймаута ===');
const timeoutError = new Error('Request timeout');
const timeoutClassification = window.errorHandler?.classifyError(timeoutError, 'Timeout test');
console.log('Timeout error classification:', timeoutClassification);

// Тест 3: Проверка классификации ошибки аутентификации
console.log('=== Тест 3: Ошибка аутентификации ===');
const authError = new Error('Unauthorized - 401');
const authClassification = window.errorHandler?.classifyError(authError, 'Auth test');
console.log('Auth error classification:', authClassification);

// Тест 4: Проверка классификации ошибки локального сервера
console.log('=== Тест 4: Ошибка локального сервера ===');
const localError = new Error('Connection refused to localhost:11964');
const localClassification = window.errorHandler?.classifyError(localError, 'Local server test');
console.log('Local server error classification:', localClassification);

// Тест 5: Проверка классификации ошибки модели
console.log('=== Тест 5: Ошибка модели ===');
const modelError = new Error('Model not found');
const modelClassification = window.errorHandler?.classifyError(modelError, 'Model test');
console.log('Model error classification:', modelClassification);

// Тест 6: Проверка обработки ошибки через toast
console.log('=== Тест 6: Показ toast уведомления ===');
if (window.errorHandler) {
  // Показываем тестовое уведомление
  const testError = new Error('Тестовая ошибка для проверки toast');
  window.errorHandler.handleError(testError, 'Test context');
  console.log('Toast notification should appear');
} else {
  console.log('ErrorHandler не доступен в window объекте');
}

console.log('=== Все тесты завершены ===');