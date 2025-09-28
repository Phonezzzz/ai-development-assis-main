import { openRouterService } from './openrouter';

/**
 * Direct LLM service for simple question answering
 */
export class LLMService {
  async askQuestion(question: string, model?: string): Promise<string> {
    // 1. Проверяем выбрана ли модель
    if (!model) {
      throw new Error('Пожалуйста, выберите модель из списка');
    }

    try {
      // 2. Отправляем запрос (openrouter.ts сам разберется куда)
      const chatResponse = await openRouterService.createChatCompletion({
        model: model, // БЕЗ дефолтов!
        messages: [
          {
            role: 'system',
            content: 'Ты полезный ИИ-ассистент. Отвечай подробно и информативно на русском языке.'
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
      });

      return chatResponse.choices[0]?.message?.content || 'Извините, не удалось получить ответ.';
    } catch (error) {
      console.error('Error asking LLM question:', error);
      throw new Error('Не удалось получить ответ от ИИ. Проверьте настройки API.');
    }
  }

  async generateResponse(prompt: string, model?: string): Promise<string> {
    // 1. Проверяем выбрана ли модель
    if (!model) {
      throw new Error('Пожалуйста, выберите модель из списка');
    }

    try {
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

      return chatResponse.choices[0]?.message?.content || 'Ошибка генерации ответа';
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Ошибка генерации ответа');
    }
  }
}

export const llmService = new LLMService();
