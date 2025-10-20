export interface AppDataSchema {
  version: 2;
  models: {
    selected: Record<string, string | null>;
    reasoning: Record<string, {
      enabled: boolean;
      modelId: string;
      showThinkingProcess: boolean;
      thinkingProcessStyle: 'expanded' | 'collapsed' | 'hidden';
      lastToggled?: string;
    }>;
  };
  orchestrator?: {
    activeMode?: string;
    messages?: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: string;
    }>;
    savePoints?: Array<{
      id: string;
      name: string;
      timestamp: string;
      data: any;
    }>;
  };
}

export const LATEST_VERSION = 2;

export const DEFAULT_APP_DATA: AppDataSchema = {
  version: 2,
  models: {
    selected: {},
    reasoning: {},
  },
};