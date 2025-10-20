import { openRouterService } from './openrouter';
import { routingLogger } from './routing-logger';
import { errorHandler } from './error-handler';
import { ProcessedError, ErrorType } from '../errors';

/**
 * Direct LLM service for simple question answering
 */
export class LLMService {
  async askQuestion(question: string, model?: string): Promise<string> {
    const requestId = `llm_ask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    // Логируем начало запроса
    routingLogger.logApiCall(requestId, 'POST', 'llm/askQuestion', {
      model,
      questionLength: question.length,
      questionPreview: question.substring(0, 100) + (question.length > 100 ? '...' : '')
    });

    // 1. Проверяем выбрана ли модель
    if (!model) {
      const error = new Error('Пожалуйста, выберите модель из списка');
      routingLogger.logError(requestId, error, { 
        stage: 'validation',
        errorCode: 'NO_MODEL_SELECTED'
      });
      errorHandler.handleError(error, 'Model selection validation');
      throw error;
    }

    try {
      routingLogger.logDebug(`Starting askQuestion with model: ${model}`, { 
        requestId, 
        questionLength: question.length 
      });

      // 2. Отправляем запрос (openrouter.ts сам разберется куда)
      const chatResponse = await openRouterService.createChatCompletion({
        model: model, // БЕЗ дефолтов!
        messages: [
          {
            role: 'system',
            content: `Ты крутой неформальный помощник. Общаешься как с близким другом - без лишних церемоний, можешь материться, шутить и говорить как есть. Не притворяйся вежливым роботом - будь собой.

## Алгоритм работы в чате

### 1. Понимание запроса (ГЛАВНОЕ!)
- НЕ БУКВОЕДСТВУЙ - всегда ищи суть того, что человек хочет
- Если чувствуешь, что вопрос туманный - переспроси нормально: "Слушай, а ты про что конкретно?"
- Учитывай контекст всего разговора, а не только последнее сообщение

### 2. Оценка своих возможностей (ЧЕСТНОСТЬ!)
- Если что-то не знаешь или не можешь - СРАЗУ ГОВОРИ
- Фразы типа: "Хуй знает, не в курсе", "Не, это не мое", "Тут я пас" - НОРМАЛЬНО
- Лучше честно сказать "не знаю", чем выдумывать хуйню

### 3. Структура ответа
ЕСЛИ знаю ответ: отвечаю коротко и по делу, добавляю детали только если нужно, могу пошутить
ЕСЛИ не знаю точно: честно говорю что не уверен, даю то что знаю с пометкой "может быть не точно"
ЕСЛИ вообще хуй пойми что спрашивают: переспрашиваю нормально, пытаюсь угадать что имелось в виду

## Стиль общения
✅ ДЕЛАЙ:
- Используй мат естественно (не через слово, но и не бойся)
- Говори "я хуй знаю" вместо "к сожалению, у меня нет информации"
- Шути, используй сленг
- Давай прямые ответы без воды
- Говори свое мнение если есть

❌ НЕ ДЕЛАЙ:
- Не извиняйся по 100 раз за мат или прямоту
- Не начинай каждый ответ с "Конечно!" или "Разумеется!"
- Не пиши простыни текста если можно коротко
- Не притворяйся что знаешь если не знаешь

## Обработка сложных вопросов
Если тема серьезная (здоровье, финансы, право): даю общую инфу что знаю, но ОБЯЗАТЕЛЬНО говорю "но иди к специалисту, я ж не врач/юрист/etc"


## Главное правило
БУДЬ ЧЕСТНЫМ И ПОЛЕЗНЫМ, А НЕ ВЕЖЛИВЫМ РОБОТОМ. Люди ценят когда с ними говорят по-человечески.`
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
      });

      const duration = Math.round(performance.now() - startTime);

      // Проверяем структуру ответа вместо optional chaining
      if (!chatResponse.choices || !chatResponse.choices[0] || !chatResponse.choices[0].message) {
        throw new Error('Некорректный ответ от API: отсутствует choices[0].message');
      }
      const content = chatResponse.choices[0].message.content;
      if (!content || !content.trim()) {
        throw new Error('API returned empty content');
      }
      const result = content;

      // Логируем успешный результат
      routingLogger.logApiResponse(requestId, 200, duration, result.length);
      routingLogger.logPerformance(requestId, 'llm_askQuestion', duration, {
        model,
        questionLength: question.length,
        resultLength: result.length,
        tokens: chatResponse.usage ? chatResponse.usage.total_tokens : 0,
        promptTokens: chatResponse.usage ? chatResponse.usage.prompt_tokens : 0,
        completionTokens: chatResponse.usage ? chatResponse.usage.completion_tokens : 0
      });

      routingLogger.logDebug(`askQuestion completed successfully`, { 
        requestId, 
        model,
        duration,
        resultLength: result.length 
      });

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, { 
          stage: 'askQuestion_error',
          totalDuration: duration,
          model,
          questionLength: question.length
        });
      } else {
        routingLogger.logError(requestId, String(error), { 
          stage: 'askQuestion_unknown_error',
          totalDuration: duration,
          model,
          questionLength: question.length
        });
      }
      
      console.error('Error asking LLM question:', JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof ProcessedError)) {
        errorHandler.handleError(error, 'Ask question');
        throw new ProcessedError(error instanceof Error ? error.message : String(error));
      }
      
      throw new Error('Не удалось получить ответ от ИИ. Проверьте настройки API.');
    }
  }

  async generateResponse(prompt: string, model?: string): Promise<string> {
    const requestId = `llm_gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    // Логируем начало генерации
    routingLogger.logApiCall(requestId, 'POST', 'llm/generateResponse', {
      model,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
    });

    // 1. Проверяем выбрана ли модель
    if (!model) {
      const error = new Error('Пожалуйста, выберите модель из списка');
      routingLogger.logError(requestId, error, { 
        stage: 'validation',
        errorCode: 'NO_MODEL_SELECTED'
      });
      errorHandler.handleError(error, 'Model selection validation');
      throw error;
    }

    try {
      routingLogger.logDebug(`Starting generateResponse with model: ${model}`, { 
        requestId, 
        promptLength: prompt.length 
      });

      // 2. Отправляем запрос (openrouter.ts сам разберется куда)
      const chatResponse = await openRouterService.createChatCompletion({
        model: model, // БЕЗ дефолтов!
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
      });

      const duration = Math.round(performance.now() - startTime);

      // Проверяем структуру ответа вместо optional chaining
      if (!chatResponse.choices || !chatResponse.choices[0] || !chatResponse.choices[0].message) {
        throw new Error('Некорректный ответ от API: отсутствует choices[0].message');
      }
      const content = chatResponse.choices[0].message.content;
      if (!content || !content.trim()) {
        throw new Error('API returned empty content');
      }
      const result = content;

      // Логируем успешный результат
      routingLogger.logApiResponse(requestId, 200, duration, result.length);
      routingLogger.logPerformance(requestId, 'llm_generateResponse', duration, {
        model,
        promptLength: prompt.length,
        resultLength: result.length,
        tokens: chatResponse.usage ? chatResponse.usage.total_tokens : 0,
        promptTokens: chatResponse.usage ? chatResponse.usage.prompt_tokens : 0,
        completionTokens: chatResponse.usage ? chatResponse.usage.completion_tokens : 0
      });

      routingLogger.logDebug(`generateResponse completed successfully`, { 
        requestId, 
        model,
        duration,
        resultLength: result.length 
      });

      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      
      if (error instanceof Error) {
        routingLogger.logError(requestId, error, { 
          stage: 'generateResponse_error',
          totalDuration: duration,
          model,
          promptLength: prompt.length
        });
      } else {
        routingLogger.logError(requestId, String(error), { 
          stage: 'generateResponse_unknown_error',
          totalDuration: duration,
          model,
          promptLength: prompt.length
        });
      }
      
      console.error('Error generating response:', JSON.stringify(error, null, 2));
      
      // Обрабатываем ошибку через ErrorHandler, если это не уже обработанная ошибка
      if (!(error instanceof ProcessedError)) {
        errorHandler.handleError(error, 'Generate response');
        throw new ProcessedError(error instanceof Error ? error.message : String(error));
      }
      
      throw new Error('Ошибка генерации ответа');
    }
  }
}

export const llmService = new LLMService();
