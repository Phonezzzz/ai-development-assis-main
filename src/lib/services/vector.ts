import { config } from '@/lib/config';
import { agentEventSystem, AGENT_EVENTS, emitAgentError } from './agent-event-system';
import { measureOperation } from '@/lib/services/performance-monitor';
import { VectorMetadata, VectorDocumentMetadata } from '../types/strict-types';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: VectorDocumentMetadata;
  embedding?: number[];
  similarity?: number;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, unknown>;
}

export interface VectorService {
  addDocument(document: VectorDocument): Promise<void>;
  addDocuments(documents: VectorDocument[]): Promise<void>;
  search(query: string, options?: VectorSearchOptions): Promise<VectorDocument[]>;
  deleteDocument(id: string): Promise<void>;
  updateDocument(id: string, document: Partial<VectorDocument>): Promise<void>;
  isAvailable(): boolean;
}

class OpenAIEmbeddingService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = config.openai.apiKey;
    this.baseUrl = config.openai.baseUrl;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
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

  async createEmbedding(text: string): Promise<number[]> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: config.models.embeddingModel,
        }),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: 'Failed to parse error body' } }));
        const errorMessage = `OpenAI API error (${response.status}): ${errorBody.error.message}`;
        console.error('OpenAI embedding request failed:', {
          status: response.status, statusText: response.statusText, error: errorBody, url: `${this.baseUrl}/embeddings`, textLength: text.length
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: config.models.embeddingModel,
        }),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: { message: 'Failed to parse error body' } }));
        const errorMessage = `OpenAI API error (${response.status}): ${errorBody.error.message}`;
        console.error('OpenAI embeddings request failed:', {
          status: response.status, statusText: response.statusText, error: errorBody, url: `${this.baseUrl}/embeddings`, textCount: texts.length
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.data.map((item: { embedding: number[] }) => item.embedding);
    } catch (error) {
      console.error('Error creating embeddings:', JSON.stringify(error, null, 2));
      throw error;
    }
  }
}

class QdrantVectorService implements VectorService {
  private baseUrl: string;
  private apiKey: string;
  private collectionName = 'ai_agent_documents';
  private embeddingService: OpenAIEmbeddingService;
  private initPromise: Promise<void>;

  constructor() {
    this.baseUrl = import.meta.env.DEV ? '/qdrant' : config.qdrant.url;
    this.apiKey = config.qdrant.apiKey;
    this.embeddingService = new OpenAIEmbeddingService();
    this.initPromise = this.initializeCollection();
  }

  isAvailable(): boolean {
    return !!this.baseUrl && this.embeddingService.isAvailable();
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

  private getEmbeddingDimension(): number {
    const dims: Record<string, number> = {
      'text-embedding-ada-002': 1536,
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
    };
    return dims[config.models.embeddingModel] || 1536;
  }

  private async initializeCollection(): Promise<void> {
    if (!this.isAvailable()) {
      console.debug('Qdrant service not available, skipping initialization');
      return;
    }

    try {
      console.debug('Initializing Qdrant collection:', JSON.stringify(this.collectionName, null, 2));

      // Check if collection exists with shorter timeout
      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}`, {
        headers: this.getHeaders(),
      }, 5000); // Reduced timeout to 5 seconds

      if (response.status === 404) {
        console.debug('Collection does not exist, creating:', JSON.stringify(this.collectionName, null, 2));
        // Create collection
        const createResponse = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify({
            vectors: {
              size: this.getEmbeddingDimension(),
              distance: 'Cosine',
            },
          }),
        }, 10000); // Reduced timeout to 10 seconds

        if (!createResponse.ok) {
          const errorBody = await createResponse.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
          throw new Error(`Qdrant create collection error: ${createResponse.statusText} - ${errorBody.status.error}`);
        }
        console.debug('Collection created successfully:', JSON.stringify(this.collectionName, null, 2));
      } else {
        console.debug('Collection already exists:', JSON.stringify(this.collectionName, null, 2));
      }
    } catch (error) {
      console.error('Error initializing Qdrant collection:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    return headers;
  }

  private generateCompatibleId(originalId: string): number {
    // Generate a numeric ID that's compatible with Qdrant
    // Use a simple hash function to convert string to number
    let hash = 0;
    for (let i = 0; i < originalId.length; i++) {
      const char = originalId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  async addDocument(document: VectorDocument): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Qdrant or OpenAI not configured');
    }

    try {
      await this.initPromise;
      const embedding = await this.embeddingService.createEmbedding(document.content);

      // Ensure document ID is compatible with Qdrant (use hash for safety)
      const documentId = this.generateCompatibleId(document.id);

      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: [{
            id: documentId,
            vector: embedding,
            payload: {
              original_id: document.id,
              content: document.content,
              ...document.metadata,
              timestamp: new Date().toISOString(),
            },
          }],
        }),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
        throw new Error(`Qdrant addDocument error: ${response.statusText} - ${errorBody.status.error}`);
      }
    } catch (error) {
      console.error('Error adding document to Qdrant:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Qdrant or OpenAI not configured');
    }

    try {
      await this.initPromise;
      const texts = documents.map(doc => doc.content);
      const embeddings = await this.embeddingService.createEmbeddings(texts);
      
      const points = documents.map((doc, index) => ({
        id: this.generateCompatibleId(doc.id),
        vector: embeddings[index],
        payload: {
          original_id: doc.id,
          content: doc.content,
          ...doc.metadata,
          timestamp: new Date().toISOString(),
        },
      }));

      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ points }),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
        throw new Error(`Qdrant addDocuments error: ${response.statusText} - ${errorBody.status.error}`);
      }
    } catch (error) {
      console.error('Error adding documents to Qdrant:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async search(query: string, options: VectorSearchOptions = {}): Promise<VectorDocument[]> {
    if (!this.isAvailable()) {
      throw new Error('Qdrant or OpenAI not configured');
    }

    try {
      const queryEmbedding = await this.embeddingService.createEmbedding(query);
      
      // Build Qdrant filter from options.filter:
      // - { key: 'projectId', match: { value: '...' } }
      // - { key: 'type', match: { value: 'project_file' } }
      // - { key: 'language', match: { any: ['ts','js'] } } for $in
      const buildQdrantFilter = (raw?: Record<string, unknown>) => {
        if (!raw) return undefined as undefined | { must: unknown[] };
        const must: unknown[] = [];
        for (const [key, val] of Object.entries(raw)) {
          if (val == null) continue;
          if (typeof val === 'object' && val !== null && '$in' in val) {
            const inValue = (val as Record<string, unknown>).$in;
            const arr = Array.isArray(inValue) ? inValue : [];
            if (arr.length > 0) {
              must.push({ key, match: { any: arr } });
            }
          } else if (typeof val !== 'object') {
            must.push({ key, match: { value: val } });
          } else {
            // Fallback: if object without $in, try direct equality if value present
            if (val !== null && 'value' in val) {
              must.push({ key, match: { value: (val as Record<string, unknown>).value } });
            }
          }
        }
        return must.length > 0 ? { must } : undefined;
      };

      const qdrantFilter = buildQdrantFilter(options.filter);

      const body: Record<string, unknown> = {
        vector: queryEmbedding,
        limit: options.limit || 10,
        score_threshold: options.threshold || 0.7,
        with_payload: true,
      };
      if (qdrantFilter) {
        body.filter = qdrantFilter;
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
        throw new Error(`Qdrant search error: ${response.statusText} - ${errorBody.status.error}`);
      }

      const data = await response.json();

      return data.result.map((item: { id: string | number; score: number; payload: VectorDocumentMetadata & { original_id?: string; content?: string } }) => ({
        id: item.payload.original_id || item.id.toString(),
        content: item.payload.content || '',
        metadata: item.payload,
        similarity: item.score,
      }));
    } catch (error) {
      console.error('Error searching in Qdrant:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.initPromise;
      const documentId = this.generateCompatibleId(id);
      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points/delete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          points: [documentId],
        }),
      }, 30000);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
        throw new Error(`Qdrant deleteDocument error: ${response.statusText} - ${errorBody.status.error}`);
      }
    } catch (error) {
      console.error('Error deleting document from Qdrant:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async updateDocument(id: string, document: Partial<VectorDocument>): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.initPromise;
      const documentId = this.generateCompatibleId(id);

      if (document.content) {
        // If content changed, update embedding too
        const embedding = await this.embeddingService.createEmbedding(document.content);

        const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify({
            points: [{
              id: documentId,
              vector: embedding,
              payload: {
                original_id: id,
                content: document.content,
                ...document.metadata,
                timestamp: new Date().toISOString(),
              },
            }],
          }),
        }, 30000);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
          throw new Error(`Qdrant updateDocument error: ${response.statusText} - ${errorBody.status.error}`);
        }
      } else {
        // Update only payload
        const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}/points/payload`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            points: [documentId],
            payload: {
              original_id: id,
              ...document.metadata,
              timestamp: new Date().toISOString(),
            },
          }),
        }, 30000);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ status: { error: 'Failed to parse error body' } }));
          throw new Error(`Qdrant updateDocument payload error: ${response.statusText} - ${errorBody.status.error}`);
        }
      }
    } catch (error) {
      console.error('Error updating document in Qdrant:', JSON.stringify(error, null, 2));
      throw error;
    }
  }
}

// Factory function that requires Qdrant availability
export function createVectorService(): VectorService {
  console.log('Creating Qdrant vector service...');

  const qdrantService = new QdrantVectorService();

  if (!qdrantService.isAvailable()) {
    throw new Error('Qdrant service misconfigured: ensure embeddings and Qdrant environment variables are set.');
  }

  console.log('Qdrant service available, using remote service');
  return qdrantService;
}

type VectorServiceStatus = 'idle' | 'initializing' | 'ready' | 'unavailable';

export interface VectorServiceHealth {
  status: VectorServiceStatus;
  lastSuccess: Date | null;
  lastError: {
    timestamp: Date;
    message: string;
    operation?: string;
  } | null;
}

class VectorServiceFactory {
  private instance: VectorService | null = null;
  private initializingPromise: Promise<VectorService> | null = null;
  private health: VectorServiceHealth = { status: 'idle', lastSuccess: null, lastError: null };
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly HEALTH_CHECK_INTERVAL = 60_000;
  private readonly INITIALIZATION_TIMEOUT = 10_000;

  async getInstance(): Promise<VectorService> {
    if (this.instance) {
      return this.instance;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.setHealthStatus('initializing');

    this.initializingPromise = (async () => {
      try {
        const service = await this.createWithTimeout(this.INITIALIZATION_TIMEOUT);
        this.instance = service;
        this.onSuccess();
        this.scheduleHealthCheck();
        return service;
      } catch (error) {
        this.instance = null;
        this.onFailure(error as Error, 'initialization');
        throw error;
      } finally {
        this.initializingPromise = null;
      }
    })();

    return this.initializingPromise;
  }

  async runWithInstance<T>(operation: string, fn: (service: VectorService) => Promise<T>): Promise<T> {
    const service = await this.getInstance();
    try {
      const result = await fn(service);
      this.onSuccess();
      return result;
    } catch (error) {
      this.instance = null;
      this.onFailure(error as Error, operation);
      throw error;
    }
  }

  getHealth(): VectorServiceHealth {
    return {
      status: this.health.status,
      lastSuccess: this.health.lastSuccess,
      lastError: this.health.lastError
    };
  }

  private async createWithTimeout(timeoutMs: number): Promise<VectorService> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<VectorService>([
        (async () => createVectorService())(),
        new Promise<VectorService>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Vector service initialization timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private scheduleHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheck().catch((error) => {
        this.instance = null;
        this.onFailure(error as Error, 'health-check');
      });
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private async runHealthCheck(): Promise<void> {
    if (this.initializingPromise) {
      return;
    }

    if (!this.instance) {
      await this.getInstance();
      return;
    }

    if (!this.instance.isAvailable()) {
      throw new Error('Vector service reported unavailable');
    }

    this.onSuccess();
  }

  private onSuccess(): void {
    this.health.lastSuccess = new Date();
    this.health.lastError = null;
    this.setHealthStatus('ready', true);
  }

  private onFailure(error: Error, operation: string): void {
    const message = error.message || 'Unknown vector service error';
    this.health.lastError = {
      timestamp: new Date(),
      message,
      operation,
    };
    this.setHealthStatus('unavailable', true);
    emitAgentError({
      message,
      source: 'vector-service',
      scope: operation,
      timestamp: this.health.lastError.timestamp.toISOString(),
    });
  }

  private setHealthStatus(status: VectorServiceStatus, forceEmit = false): void {
    const statusChanged = this.health.status !== status;
    this.health.status = status;
    if (statusChanged || forceEmit) {
      this.emitStateChange();
    }
  }

  private emitStateChange(): void {
    agentEventSystem.emit(AGENT_EVENTS.STATE_CHANGED, {
      source: 'vector-service',
      status: this.health.status,
      lastSuccess: this.health.lastSuccess ? this.health.lastSuccess.toISOString() : null,
      lastError: this.health.lastError
        ? {
            timestamp: this.health.lastError.timestamp.toISOString(),
            message: this.health.lastError.message,
            operation: this.health.lastError.operation,
          }
        : undefined,
    });
  }
}

export const vectorServiceFactory = new VectorServiceFactory();

const vectorServiceProxy: VectorService = {
  addDocument: (document) =>
    measureOperation(
      'vector:addDocument',
      () => vectorServiceFactory.runWithInstance('addDocument', (service) => service.addDocument(document)),
      {
        requestId: document.id,
        data: {
          documentId: document.id,
          hasEmbedding: Boolean(document.embedding),
          metadataKeys: Object.keys(document.metadata ?? {}).length
        },
        onSuccessData: () => ({
          success: true
        }),
        onErrorData: (error) => ({
          documentId: document.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    ),
  addDocuments: (documents) =>
    measureOperation(
      'vector:addDocuments',
      () => vectorServiceFactory.runWithInstance('addDocuments', (service) => service.addDocuments(documents)),
      {
        data: {
          batchSize: documents.length
        },
        onSuccessData: () => ({
          inserted: documents.length
        }),
        onErrorData: (error) => ({
          batchSize: documents.length,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    ),
  search: (query, options) =>
    measureOperation(
      'vector:search',
      () => vectorServiceFactory.runWithInstance('search', (service) => service.search(query, options)) as Promise<VectorDocument[]>,
      {
        data: {
          queryLength: query.length,
          limit: options ? options.limit : undefined,
          threshold: options ? options.threshold : undefined
        },
        onSuccessData: (result: unknown) => {
          if (!Array.isArray(result) || result.length === 0) {
            return { resultCount: 0, topScore: undefined };
          }
          const firstDoc = result[0] as VectorDocument;
          return {
            resultCount: result.length,
            topScore: firstDoc.similarity
          };
        },
        onErrorData: (error) => ({
          queryLength: query.length,
          limit: options ? options.limit : undefined,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    ) as Promise<VectorDocument[]>,
  deleteDocument: (id) =>
    measureOperation(
      'vector:deleteDocument',
      () => vectorServiceFactory.runWithInstance('deleteDocument', (service) => service.deleteDocument(id)),
      {
        requestId: id,
        data: {
          documentId: id
        },
        onSuccessData: () => ({
          deleted: true
        }),
        onErrorData: (error) => ({
          documentId: id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    ),
  updateDocument: (id, document) =>
    measureOperation(
      'vector:updateDocument',
      () => vectorServiceFactory.runWithInstance('updateDocument', (service) => service.updateDocument(id, document)),
      {
        requestId: id,
        data: {
          documentId: id,
          hasContentUpdate: Boolean(document.content),
          metadataKeys: Object.keys(document.metadata ?? {}).length
        },
        onSuccessData: () => ({
          updated: true
        }),
        onErrorData: (error) => ({
          documentId: id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    ),
  isAvailable: () => vectorServiceFactory.getHealth().status === 'ready',
};

export const vectorService = vectorServiceProxy;

export function getVectorServiceHealth(): VectorServiceHealth {
  return vectorServiceFactory.getHealth();
}