class ServiceHealth {
  private healthStatus = new Map<string, boolean>();
  
  async checkService(name: string, checkFn: () => Promise<boolean>): Promise<boolean> {
    try {
      const isHealthy = await checkFn();
      this.healthStatus.set(name, isHealthy);
      return isHealthy;
    } catch {
      this.healthStatus.set(name, false);
      return false;
    }
  }
  
  isAvailable(name: string): boolean {
    return this.healthStatus.get(name) ?? false;
  }
}

export const serviceHealth = new ServiceHealth();