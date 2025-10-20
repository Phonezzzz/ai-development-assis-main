/* eslint-disable import/no-cycle */
import { dataMigration } from '@/lib/services/data-migration';
import { routingLogger } from '@/lib/services/routing-logger';
import { llmService } from '@/lib/services/llm';
import { vectorService } from '@/lib/services/vector';
import { errorHandler } from '@/lib/services/error-handler';
import { imageGenerationService } from '@/lib/services/image-generation';
import {
  openRouterService,
} from '@/lib/services/openrouter';
import type { ChatCompletionRequest } from '@/lib/services/providers/model-provider';

type VectorDocumentPayload = Parameters<typeof vectorService.addDocument>[0];
type ImageGenerationPayload = Parameters<typeof imageGenerationService.generateImage>[0];

export const orchestratorApi = {
  data: {
    migrate: () => dataMigration.migrate(),
    getMigrationInfo: () => dataMigration.getMigrationInfo(),
  },
  logging: {
    logApiCall: (...args: Parameters<typeof routingLogger.logApiCall>) =>
      routingLogger.logApiCall(...args),
    logApiResponse: (...args: Parameters<typeof routingLogger.logApiResponse>) =>
      routingLogger.logApiResponse(...args),
    logError: (...args: Parameters<typeof routingLogger.logError>) =>
      routingLogger.logError(...args),
    logDebug: (...args: Parameters<typeof routingLogger.logDebug>) =>
      routingLogger.logDebug(...args),
    logModelSelection: (
      ...args: Parameters<typeof routingLogger.logModelSelection>
    ) => routingLogger.logModelSelection(...args),
  },
  llm: {
    askQuestion: (prompt: string, modelId: string) =>
      llmService.askQuestion(prompt, modelId),
  },
  vector: {
    addDocument: (payload: VectorDocumentPayload) =>
      vectorService.addDocument(payload),
  },
  errors: {
    handle: (error: unknown, scope?: string) =>
      errorHandler.handleError(error, scope),
  },
  image: {
    generateImage: (options: ImageGenerationPayload) =>
      imageGenerationService.generateImage(options),
    createChatCompletionStream: (request: ChatCompletionRequest) =>
      openRouterService.createChatCompletionStream(request),
  },
};

export type OrchestratorApi = typeof orchestratorApi;