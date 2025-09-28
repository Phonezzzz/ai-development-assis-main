import { config } from '@/lib/config';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
  similarity?: number;
}

export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        const errorMessage = `OpenAI API error (${response.status}): ${errorBody?.error?.message || response.statusText}`;
        console.error('OpenAI embedding request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorBody,
          url: `${this.baseUrl}/embeddings`,
          textLength: text.length
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        const errorMessage = `OpenAI API error (${response.status}): ${errorBody?.error?.message || response.statusText}`;
        console.error('OpenAI embeddings request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorBody,
          url: `${this.baseUrl}/embeddings`,
          textCount: texts.length
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error('Error creating embeddings:', error);
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
      console.log('Qdrant service not available, skipping initialization');
      return;
    }

    try {
      console.log('Initializing Qdrant collection:', this.collectionName);

      // Check if collection exists with shorter timeout
      const response = await this.fetchWithTimeout(`${this.baseUrl}/collections/${this.collectionName}`, {
        headers: this.getHeaders(),
      }, 5000); // Reduced timeout to 5 seconds

      if (response.status === 404) {
        console.log('Collection does not exist, creating:', this.collectionName);
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
          const errorBody = await createResponse.json().catch(() => ({ message: 'Failed to parse error body' }));
          throw new Error(`Qdrant create collection error: ${createResponse.statusText} - ${errorBody?.status?.error || createResponse.statusText}`);
        }
        console.log('Collection created successfully:', this.collectionName);
      } else {
        console.log('Collection already exists:', this.collectionName);
      }
    } catch (error) {
      console.error('Error initializing Qdrant collection:', error);
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        throw new Error(`Qdrant addDocument error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error adding document to Qdrant:', error);
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        throw new Error(`Qdrant addDocuments error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error adding documents to Qdrant:', error);
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
      const buildQdrantFilter = (raw?: Record<string, any>) => {
        if (!raw) return undefined as undefined | { must: any[] };
        const must: any[] = [];
        for (const [key, val] of Object.entries(raw)) {
          if (val == null) continue;
          if (typeof val === 'object' && ('$in' in val)) {
            const arr = Array.isArray((val as any).$in) ? (val as any).$in : [];
            if (arr.length > 0) {
              must.push({ key, match: { any: arr } });
            }
          } else if (typeof val !== 'object') {
            must.push({ key, match: { value: val } });
          } else {
            // Fallback: if object without $in, try direct equality if value present
            if ('value' in (val as any)) {
              must.push({ key, match: { value: (val as any).value } });
            }
          }
        }
        return must.length > 0 ? { must } : undefined;
      };

      const qdrantFilter = buildQdrantFilter(options.filter);

      const body: any = {
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        throw new Error(`Qdrant search error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
      }

      const data = await response.json();
      
      return data.result.map((item: any) => ({
        id: item.payload.original_id || item.id.toString(),
        content: item.payload.content,
        metadata: item.payload,
        similarity: item.score,
      }));
    } catch (error) {
      console.error('Error searching in Qdrant:', error);
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
        const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
        throw new Error(`Qdrant deleteDocument error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting document from Qdrant:', error);
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
          const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
          throw new Error(`Qdrant updateDocument error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
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
          const errorBody = await response.json().catch(() => ({ message: 'Failed to parse error body' }));
          throw new Error(`Qdrant updateDocument payload error: ${response.statusText} - ${errorBody?.status?.error || response.statusText}`);
        }
      }
    } catch (error) {
      console.error('Error updating document in Qdrant:', error);
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

export const vectorService = createVectorService();