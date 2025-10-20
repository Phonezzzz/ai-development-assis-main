export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
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

export interface ResponsesRequest {
  model: string;
  prompt: string;
  modalities?: string[];
  max_output_tokens?: number;
}

export interface ModelProvider {
  canHandle(model: string): boolean;
  createCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  createStream(request: ChatCompletionRequest): Promise<ReadableStream>;
  createResponsesStream?(request: ResponsesRequest): Promise<ReadableStreamDefaultReader<Uint8Array>>;
}