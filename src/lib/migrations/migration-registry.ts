export interface Migration {
  version: string;
  up: (data: any) => Promise<any>;
  down: (data: any) => Promise<any>;
}

export class MigrationRegistry {
  private migrations: Migration[] = [];

  register(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => this.compareVersions(a.version, b.version));
  }

  async migrate(from: string, to: string, data: any): Promise<any> {
    const applicable = this.migrations.filter(migration => 
      this.isVersionBetween(migration.version, from, to)
    );
    
    let result = data;
    for (const migration of applicable) {
      result = await migration.up(result);
    }
    return result;
  }

  async rollback(from: string, to: string, data: any): Promise<any> {
    const applicable = this.migrations
      .filter(migration => this.isVersionBetween(migration.version, to, from))
      .reverse();
    
    let result = data;
    for (const migration of applicable) {
      result = await migration.down(result);
    }
    return result;
  }

  getMigrations(): Migration[] {
    return [...this.migrations];
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(part => parseInt(part, 10));
    const parts2 = v2.split('.').map(part => parseInt(part, 10));
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 !== part2) {
        return part1 - part2;
      }
    }
    
    return 0;
  }

  private isVersionBetween(version: string, from: string, to: string): boolean {
    const isAfterFrom = this.compareVersions(version, from) > 0;
    const isBeforeOrEqualTo = this.compareVersions(version, to) <= 0;
    return isAfterFrom && isBeforeOrEqualTo;
  }
}