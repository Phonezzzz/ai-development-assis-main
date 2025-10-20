import { AppDataSchema } from './data-schema';

export class DataValidator {
  static validateModelId(id: string): boolean {
    if (typeof id !== 'string' || id.trim() === '') {
      return false;
    }

    const invalidValues = ['undefined', 'null', '', 'legacy-model', 'old-model', 'deprecated', 'unknown'];
    return !invalidValues.includes(id.toLowerCase());
  }

  static validateAppData(data: any): data is AppDataSchema {
    if (!data || typeof data !== 'object') {
      return false;
    }

    if (data.version !== 2) {
      return false;
    }

    if (!data.models || typeof data.models !== 'object') {
      return false;
    }

    return true;
  }
}