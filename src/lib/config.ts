// Environment configuration with proper typing
export const config = {
  // OpenRouter configuration
  openrouter: {
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
    baseUrl: import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  },
  
  // ElevenLabs configuration
  elevenlabs: {
    apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY || '',
    baseUrl: import.meta.env.VITE_ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1',
  },
  
  // OpenAI configuration (for embeddings)
  openai: {
    apiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
  
  // Qdrant configuration
  qdrant: {
    url: import.meta.env.VITE_QDRANT_URL || 'http://localhost:6333',
    apiKey: import.meta.env.VITE_QDRANT_API_KEY || '',
  },

  // Local LLM configuration
  localLLMUrl: import.meta.env.VITE_LOCAL_LLM_URL || 'http://localhost:11964',

  // Default models
  models: {
    defaultLLM: 'meta-llama/llama-3.1-8b-instruct:free',
    embeddingModel: 'text-embedding-3-large',
    voiceModel: 'eleven_multilingual_v2',
  },
  
  // Feature flags
  features: {
    realTimeVectorSearch: true,
    voiceSynthesis: true,
    projectIndexing: true,
    agentSystem: true,
  },
};

// Type definitions for configuration
export type Config = typeof config;

// Helper function to check if API keys are configured
export const isConfigured = {
  openrouter: () => !!config.openrouter.apiKey,
  elevenlabs: () => !!config.elevenlabs.apiKey,
  openai: () => !!config.openai.apiKey,
  qdrant: () => !!config.qdrant.url,
};

// Validation functions (relaxed: validate only features that are enabled)
export const validateConfig = () => {
  const errors: string[] = [];

  if (config.features.agentSystem && !isConfigured.openrouter()) {
    errors.push('OpenRouter API ключ должен быть настроен (для работы агентной системы)');
  }

  if (config.features.voiceSynthesis && !isConfigured.elevenlabs()) {
    errors.push('ElevenLabs API ключ должен быть настроен (для синтеза речи)');
  }

  if (config.features.realTimeVectorSearch) {
    if (!isConfigured.openai()) {
      errors.push('OpenAI API ключ должен ыть настроен (для embeddings)');
    }
    if (!isConfigured.qdrant()) {
      errors.push('Qdrant URL должен быть настроен (для vector search)');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};