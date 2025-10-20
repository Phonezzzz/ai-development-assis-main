import { AgentMemory } from '@/lib/types';
import { agentEventSystem, AGENT_EVENTS } from './agent-event-system';

class AgentMemoryService {
  private readonly STORAGE_KEY = 'agent-memory';

  async addMemory(memory: Omit<AgentMemory, 'id'>): Promise<AgentMemory> {
    try {
      const fullMemory: AgentMemory = {
        ...memory,
        id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date()
      };

      const existingMemories = await this.loadMemory(memory.sessionId);
      const updatedMemories = [...existingMemories, fullMemory];
      
      await this.saveMemory(memory.sessionId, updatedMemories);
      
      agentEventSystem.emit(AGENT_EVENTS.MEMORY_ADDED, fullMemory);
      agentEventSystem.emit(AGENT_EVENTS.MEMORY_SAVED, fullMemory);
      
      return fullMemory;
    } catch (error) {
      console.error('Error adding memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async loadMemory(sessionId: string): Promise<AgentMemory[]> {
    try {
      const storageKey = `${this.STORAGE_KEY}-${sessionId}`;
      const stored = localStorage.getItem(storageKey);
      const memories = stored ? JSON.parse(stored) : [];

      // Восстанавливаем даты из строк
      return memories.map((memory: { id: string; session_id: string; context: string; timestamp: string | Date; metadata?: Record<string, unknown>; type: string; importance: number }) => ({
        ...memory,
        timestamp: new Date(memory.timestamp)
      }));
    } catch (error) {
      console.error('Error loading memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async saveMemory(sessionId: string, memories: AgentMemory[]): Promise<void> {
    try {
      const storageKey = `${this.STORAGE_KEY}-${sessionId}`;
      localStorage.setItem(storageKey, JSON.stringify(memories));
      
      agentEventSystem.emit(AGENT_EVENTS.MEMORY_SAVED, { sessionId, count: memories.length });
    } catch (error) {
      console.error('Error saving memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async deleteMemory(sessionId: string, memoryId: string): Promise<void> {
    try {
      const memories = await this.loadMemory(sessionId);
      const filteredMemories = memories.filter(memory => memory.id !== memoryId);
      await this.saveMemory(sessionId, filteredMemories);
      
      agentEventSystem.emit(AGENT_EVENTS.MEMORY_DELETED, { memoryId, sessionId });
    } catch (error) {
      console.error('Error deleting memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async clearMemory(sessionId: string): Promise<void> {
    try {
      const storageKey = `${this.STORAGE_KEY}-${sessionId}`;
      localStorage.removeItem(storageKey);
      
      agentEventSystem.emit(AGENT_EVENTS.MEMORY_CLEARED, { sessionId });
    } catch (error) {
      console.error('Error clearing memory:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    return this.clearMemory(sessionId);
  }

  async getAllSessions(): Promise<string[]> {
    try {
      const sessions: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.STORAGE_KEY)) {
          const sessionId = key.replace(`${this.STORAGE_KEY}-`, '');
          sessions.push(sessionId);
        }
      }
      return sessions;
    } catch (error) {
      console.error('Error getting sessions:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async getMemoryStats(sessionId: string): Promise<{
    totalMemories: number;
    memoryByType: Record<string, number>;
    oldestMemory?: Date;
    newestMemory?: Date;
  }> {
    const memories = await this.loadMemory(sessionId);
    const memoryByType: Record<string, number> = {};
    
    memories.forEach(memory => {
      memoryByType[memory.type] = (memoryByType[memory.type] || 0) + 1;
    });

    const timestamps = memories.map(m => m.timestamp.getTime());
    const oldest = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
    const newest = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

    return {
      totalMemories: memories.length,
      memoryByType,
      oldestMemory: oldest,
      newestMemory: newest
    };
  }
}

export const agentMemoryService = new AgentMemoryService();