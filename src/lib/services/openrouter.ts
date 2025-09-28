import { config } from '@/lib/config';
const DEBUG = String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true';

export interface Model {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  contextLength: number;
  free?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  modalities?: string[];
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class OpenRouterService {
  private baseUrl = config.openrouter.baseUrl;
  private apiKey = config.openrouter.apiKey;

  constructor() {}

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }

  private getCommonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Title': 'AI Agent Workspace',
    };
    const referer = typeof window !== 'undefined' && (window as any).location?.origin
      ? window.location.origin
      : 'http://localhost';
    headers['HTTP-Referer'] = referer;
    if (this.isConfigured()) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  private normalizePrice(value: any): number {
    const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : 0;
    if (!isFinite(n) || isNaN(n)) return 0;
    // If price looks like per 1M tokens (e.g., 5), convert to per 1K (0.005)
    return n >= 1 ? n / 1000 : n;
  }

  // Возвращает базовый URL локального LLM, приоритет: localStorage -> VITE_LOCAL_LLM_URL -> config.localLLMUrl -> дефолт
  private getLocalLLMUrl(): string {
    const lsKey = 'localLLMUrl';
    let url = '';
    try {
      const fromStorage = typeof window !== 'undefined' ? window.localStorage?.getItem(lsKey) : null;
      url = (fromStorage || import.meta.env.VITE_LOCAL_LLM_URL || (config as any).localLLMUrl || 'http://localhost:11964') as string;
    } catch {
      url = (import.meta.env.VITE_LOCAL_LLM_URL || (config as any).localLLMUrl || 'http://localhost:11964') as string;
    }
    // убираем завершающий слэш
    return String(url).replace(/\/+$/, '');
  }

  async getModels(): Promise<Model[]> {
    // Get local models first
    const localModels = this.getLocalModels();

    // Always try to fetch from OpenRouter API first
    try {
      if (DEBUG) {
        console.log('Пытаюсь загрузить модели из OpenRouter API...');
        console.log('API Key configured:', this.isConfigured());
        console.log('Base URL:', this.baseUrl);
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getCommonHeaders(),
      }, 30000);

      if (DEBUG) {
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
      }

      if (response.ok) {
        const data = await response.json();
        if (DEBUG) console.log('Получено моделей:', data.data?.length || 0);
        const models = data.data || [];

        // Transform OpenRouter models to our format
        const transformedModels = models.map((model: any) => ({
          id: model.id,
          name: model.name || model.id,
          provider: this.extractProvider(model.id),
          maxTokens: model.top_provider?.max_completion_tokens || 4096,
          pricing: {
            prompt: this.normalizePrice(model.pricing?.prompt),
            completion: this.normalizePrice(model.pricing?.completion),
          },
          contextLength: model.context_length || 4096,
          free: (parseFloat(model.pricing?.prompt || '0') === 0 && parseFloat(model.pricing?.completion || '0') === 0) || model.id.includes(':free'),
        })).filter((model: Model) =>
          // Filter out models that don't support chat completion
          !model.id.includes('embedding') &&
          !model.id.includes('tts') &&
          !model.id.includes('whisper')
        ).sort((a: Model, b: Model) => {
          // Sort by provider, then by name
          if (a.provider !== b.provider) {
            return a.provider.localeCompare(b.provider);
          }
          return a.name.localeCompare(b.name);
        });

        if (DEBUG) console.log('После фильтрации осталось моделей:', transformedModels.length);
        // Return local models first, then OpenRouter models
        return [...localModels, ...transformedModels];
      } else {
        console.error('OpenRouter API error:', response.status, response.statusText);
        const errorText = await response.text().catch(() => 'Failed to read error');
        if (DEBUG) console.error('Error body:', errorText);
      }
    } catch (error) {
      console.error('Error fetching models from OpenRouter:', error);
    }

    // Fallback to mock models with local models first
    if (DEBUG) console.log('Используются fallback модели');
    return [...localModels, ...this.getMockModels()];
  }

  private getLocalModels(): Model[] {
    return [
      {
        id: 'local/use',
        name: 'Local use',
        provider: 'Local',
        maxTokens: 8192,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 128000,
        free: true,
      }
    ];
  }

  private extractProvider(modelId: string): string {
    const parts = modelId.split('/');
    if (parts.length > 1) {
      const provider = parts[0];
      // Map common provider names to readable format
      const providerMap: { [key: string]: string } = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'meta-llama': 'Meta',
        'mistralai': 'Mistral AI',
        'cohere': 'Cohere',
        'deepseek': 'DeepSeek',
        'qwen': 'Qwen',
        'microsoft': 'Microsoft',
        'nvidia': 'NVIDIA',
        'perplexity': 'Perplexity',
        'huggingfaceh4': 'Hugging Face',
        'nousresearch': 'Nous Research',
        'teknium': 'Teknium',
        'liquid': 'Liquid',
        'alpindale': 'Alpindale',
        'gryphe': 'Gryphe',
        'koboldai': 'KoboldAI',
        'mancer': 'Mancer',
        'neversleep': 'NeverSleep',
        'undi95': 'Undi95',
        'jondurbin': 'Jon Durbin',
        'cognitivecomputations': 'Cognitive Computations',
        'lizpreciatior': 'Liz Preciatior',
        'recursal': 'Recursal',
        'lynn': 'Lynn',
        'flammenai': 'FlammenAI',
        'sophosympatheia': 'Sophosympatheia',
        'rwkv': 'RWKV',
        'togethercomputer': 'Together',
        'databricks': 'Databricks',
        'mattshumer': 'Matt Shumer',
        'austism': 'Austism',
        'sammcj': 'Samm C',
        'nothingiisreal': 'NothingIsReal',
        'sao10k': 'Sao10K',
        'dragonfly': 'Dragonfly',
        'infermatic': 'Infermatic',
        'eva-unit-01': 'Eva Unit 01',
        'thebloke': 'TheBloke',
        'bigcode': 'BigCode',
      };
      return providerMap[provider.toLowerCase()] || provider;
    }
    return 'Unknown';
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (DEBUG) {
      console.log('=== DEBUG: createChatCompletion ===');
      console.log('Request model:', request.model);
      console.log('Is local check:', request.model === 'local' || request.model.startsWith('local/'));
    }

    // Check if this is a local model
    if (request.model === 'local' || request.model.startsWith('local/')) {
      if (DEBUG) console.log('Routing to LOCAL server');
      return this.createLocalChatCompletion(request);
    }

    if (DEBUG) console.log('Routing to OPENROUTER server');

    if (!this.isConfigured()) {
      throw new Error("OpenRouter API key not configured");
    }

    if (request.stream) {
      throw new Error("Потоковые ответы (stream) не реализованы в этом клиенте");
    }

    try {
      const body: any = {
        ...request,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }

      if (DEBUG) {
        const headers = this.getCommonHeaders();
        const safeHeaders = { ...headers };
        if (safeHeaders['Authorization']) {
          safeHeaders['Authorization'] = 'Bearer ***';
        }
        console.log('Отправляю запрос к OpenRouter:', { model: body.model, headers: safeHeaders });
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);

      if (DEBUG) {
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorData.error?.message || "Unknown error"}`);
      }

      const result = await response.json();
      if (DEBUG) console.log('Success response:', result);
      return result;
    } catch (error) {
      console.error("Error in chat completion:", error);
      throw error;
    }
  }

  async createChatCompletionStream(request: ChatCompletionRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    if (DEBUG) {
      console.log('=== DEBUG: createChatCompletionStream ===');
      console.log('Request model:', request.model);
    }
    // Потоковый режим поддерживается только через OpenRouter в этом клиенте
    if (request.model === 'local' || request.model.startsWith('local/')) {
      throw new Error('Потоковые ответы для локальной модели не поддерживаются этим клиентом');
    }
    if (!this.isConfigured()) {
      throw new Error("OpenRouter API key not configured");
    }
    try {
      const body: any = {
        ...request,
        stream: true,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }
      const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);
      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body (stream):', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorData.error?.message || "Unknown error"}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Не удалось получить reader от ответа API');
      }
      return reader as ReadableStreamDefaultReader<Uint8Array>;
    } catch (error) {
      console.error("Error in streaming chat completion:", error);
      throw error;
    }
  }

  async createResponsesStream(params: { model: string; prompt: string; modalities?: string[]; max_output_tokens?: number }): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    if (DEBUG) {
      console.log('=== DEBUG: createResponsesStream ===');
      console.log('Request model:', params.model);
    }
    if (params.model === 'local' || params.model.startsWith('local/')) {
      throw new Error('Потоковые ответы для локальной модели не поддерживаются этим клиентом');
    }
    if (!this.isConfigured()) {
      throw new Error("OpenRouter API key not configured");
    }
    try {
      const body: any = {
        model: params.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: params.prompt }
            ]
          }
        ],
        modalities: params.modalities && params.modalities.length ? params.modalities : ['image', 'text'],
        stream: true,
      };
      if (params.max_output_tokens != null) {
        body.max_output_tokens = params.max_output_tokens;
      }
      const response = await this.fetchWithTimeout(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          ...this.getCommonHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 300000);
      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Error response body (responses stream):', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`OpenRouter Responses API error: ${response.status} ${response.statusText} - ${errorData.error?.message || "Unknown error"}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Не удалось получить reader от ответа Responses API');
      }
      return reader as ReadableStreamDefaultReader<Uint8Array>;
    } catch (error) {
      console.error("Error in responses stream:", error);
      throw error;
    }
  }

  private async createLocalChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const body: any = {
        model: 'default', // Use default model on local server
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
      };
      if (request.max_tokens != null) {
        body.max_tokens = request.max_tokens;
      }

      const base = this.getLocalLLMUrl();

      if (DEBUG) {
        console.log('Отправляю запрос к локальной модели:');
        console.log('Local URL:', base);
        console.log('Model:', body.model);
        // Не логируем промпты/сообщения
      }

      const response = await this.fetchWithTimeout(`${base}/v1/chat/completions`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, 30000);

      if (DEBUG) {
        console.log('Local response status:', response.status);
        console.log('Local response ok:', response.ok);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (DEBUG) console.error('Local error response body:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`Local model API error: ${response.status} ${response.statusText} - ${errorData.error?.message || "Unknown error"}`);
      }

      const result = await response.json();
      if (DEBUG) console.log('Local success response:', result);
      return result;
    } catch (error) {
      console.error("Error in local chat completion:", error);
      throw error;
    }
  }

  async generateCompletion(prompt: string, model?: string, options?: { maxTokens?: number; temperature?: number; systemMessage?: string }): Promise<string> {
    const messages: ChatMessage[] = [];
    
    if (options?.systemMessage) {
      messages.push({
        role: "system",
        content: options.systemMessage
      });
    }
    
    messages.push({
      role: "user",
      content: prompt
    });
    
    const response = await this.createChatCompletion({
      model: model || "openai/gpt-4o-mini",
      messages,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens
    });
    
    return response.choices[0]?.message?.content || "Ошибка генерации ответа";
  }

  private getMockModels(): Model[] {
    return [
      // FREE MODELS (актуальные бесплатные модели)
      {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        name: 'Llama 3.2 3B Instruct (Free)',
        provider: 'Meta',
        maxTokens: 4096,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 131072,
        free: true,
      },
      {
        id: 'meta-llama/llama-3.2-1b-instruct:free',
        name: 'Llama 3.2 1B Instruct (Free)',
        provider: 'Meta',
        maxTokens: 4096,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 131072,
        free: true,
      },
      {
        id: 'microsoft/phi-3-mini-128k-instruct:free',
        name: 'Phi-3 Mini 128K Instruct (Free)',
        provider: 'Microsoft',
        maxTokens: 4096,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 128000,
        free: true,
      },
      {
        id: 'nousresearch/hermes-3-llama-3.1-405b:free',
        name: 'Hermes 3 Llama 3.1 405B (Free)',
        provider: 'Nous Research',
        maxTokens: 4096,
        pricing: { prompt: 0, completion: 0 },
        contextLength: 131072,
        free: true,
      },

      // OPENAI MODELS
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        maxTokens: 4096,
        pricing: { prompt: 0.005, completion: 0.015 },
        contextLength: 128000,
        free: false,
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        maxTokens: 4096,
        pricing: { prompt: 0.00015, completion: 0.0006 },
        contextLength: 128000,
        free: false,
      },
      {
        id: 'openai/gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'OpenAI',
        maxTokens: 4096,
        pricing: { prompt: 0.01, completion: 0.03 },
        contextLength: 128000,
        free: false,
      },
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        provider: 'OpenAI',
        maxTokens: 4096,
        pricing: { prompt: 0.03, completion: 0.06 },
        contextLength: 8192,
        free: false,
      },
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'OpenAI',
        maxTokens: 4096,
        pricing: { prompt: 0.0005, completion: 0.0015 },
        contextLength: 16385,
        free: false,
      },

      // ANTHROPIC MODELS
      {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        maxTokens: 4096,
        pricing: { prompt: 0.003, completion: 0.015 },
        contextLength: 200000,
        free: false,
      },
      {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
        maxTokens: 4096,
        pricing: { prompt: 0.015, completion: 0.075 },
        contextLength: 200000,
        free: false,
      },
      {
        id: 'anthropic/claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'Anthropic',
        maxTokens: 4096,
        pricing: { prompt: 0.003, completion: 0.015 },
        contextLength: 200000,
        free: false,
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        provider: 'Anthropic',
        maxTokens: 4096,
        pricing: { prompt: 0.00025, completion: 0.00125 },
        contextLength: 200000,
        free: false,
      },

      // GOOGLE MODELS
      {
        id: 'google/gemini-pro-1.5',
        name: 'Gemini Pro 1.5',
        provider: 'Google',
        maxTokens: 4096,
        pricing: { prompt: 0.00125, completion: 0.005 },
        contextLength: 2000000,
        free: false,
      },
      {
        id: 'google/gemini-flash-1.5',
        name: 'Gemini Flash 1.5',
        provider: 'Google',
        maxTokens: 4096,
        pricing: { prompt: 0.00025, completion: 0.0075 },
        contextLength: 1000000,
        free: false,
      },
      {
        id: 'google/gemini-pro',
        name: 'Gemini Pro',
        provider: 'Google',
        maxTokens: 4096,
        pricing: { prompt: 0.0005, completion: 0.0015 },
        contextLength: 32768,
        free: false,
      },
      {
        id: 'google/gemini-2.0-flash-image-preview',
        name: 'Gemini 2.0 Flash Image Preview',
        provider: 'Google',
        maxTokens: 4096,
        pricing: { prompt: 0.00125, completion: 0.005 },
        contextLength: 1000000,
        free: false,
      },

      // META MODELS
      {
        id: 'meta-llama/llama-3.1-405b-instruct',
        name: 'Llama 3.1 405B Instruct',
        provider: 'Meta',
        maxTokens: 4096,
        pricing: { prompt: 0.005, completion: 0.015 },
        contextLength: 131072,
        free: false,
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B Instruct',
        provider: 'Meta',
        maxTokens: 4096,
        pricing: { prompt: 0.0009, completion: 0.0009 },
        contextLength: 131072,
        free: false,
      },
      {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B Instruct',
        provider: 'Meta',
        maxTokens: 4096,
        pricing: { prompt: 0.00025, completion: 0.00025 },
        contextLength: 131072,
        free: false,
      },

      // MISTRAL MODELS
      {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        provider: 'Mistral AI',
        maxTokens: 4096,
        pricing: { prompt: 0.008, completion: 0.024 },
        contextLength: 128000,
        free: false,
      },
      {
        id: 'mistralai/mistral-medium',
        name: 'Mistral Medium',
        provider: 'Mistral AI',
        maxTokens: 4096,
        pricing: { prompt: 0.0027, completion: 0.0081 },
        contextLength: 32000,
        free: false,
      },
      {
        id: 'mistralai/mistral-small',
        name: 'Mistral Small',
        provider: 'Mistral AI',
        maxTokens: 4096,
        pricing: { prompt: 0.002, completion: 0.006 },
        contextLength: 32000,
        free: false,
      },

      // OTHER MODELS
      {
        id: 'cohere/command-r-plus',
        name: 'Command R+',
        provider: 'Cohere',
        maxTokens: 4096,
        pricing: { prompt: 0.003, completion: 0.015 },
        contextLength: 128000,
        free: false,
      },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'DeepSeek',
        maxTokens: 4096,
        pricing: { prompt: 0.00014, completion: 0.00028 },
        contextLength: 64000,
        free: false,
      },
      {
        id: 'qwen/qwen-2.5-72b-instruct',
        name: 'Qwen 2.5 72B Instruct',
        provider: 'Qwen',
        maxTokens: 4096,
        pricing: { prompt: 0.0009, completion: 0.0009 },
        contextLength: 131072,
        free: false,
      },
    ];
  }

}

export const openRouterService = new OpenRouterService();