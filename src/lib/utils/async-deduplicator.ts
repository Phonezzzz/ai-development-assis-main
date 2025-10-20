export class AsyncDeduplicator<T> {
  private pending = new Map<string, Promise<T>>();
  
  async dedupe(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    
    const promise = fn().finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }
}

export const asyncDeduplicator = new AsyncDeduplicator();