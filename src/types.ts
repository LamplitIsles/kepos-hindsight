export type RecallBudget = "low" | "mid" | "high";
export type MemoryType = "world" | "experience" | "observation";

export interface RecallSettings {
  budget: RecallBudget;
  maxTokens: number;
  types: MemoryType[];
  preferObservations: boolean;
  topK: number;
  contextTurns: number;
  maxQueryChars: number;
  timeoutMs: number;
}

export interface DshPluginConfig {
  /** Path to the shared Hindsight coding-agent config. */
  configPath?: string;
  /** Limit memory to these DSH agent presets. Defaults to the bundled yuki preset. */
  activePresets?: string[];
  /** Override the bank selected from the shared config. */
  bankId?: string;
  recall?: Partial<RecallSettings>;
}

export interface HindsightFileConfig {
  apiUrl?: string;
  apiToken?: string;
  bankId?: string;
  dynamicBankId?: boolean;
  bankIdTemplate?: string;
  mapPathToBank?: Record<string, string>;
  disabled?: boolean;
  retainSessions?: boolean;
  harnesses?: Record<string, HindsightFileConfig>;
  banks?: Record<string, HindsightFileConfig>;
  companion?: {
    activePresets?: string[];
    recall?: Partial<RecallSettings>;
  };
}

export interface ResolvedCompanionConfig {
  enabled: boolean;
  apiUrl: string;
  apiToken?: string;
  bankId: string;
  retainSessions: boolean;
  activePresets: string[];
  recall: RecallSettings;
}

export interface RecalledMemory {
  id?: string;
  text: string;
  type?: MemoryType | string;
  score?: number;
  [key: string]: unknown;
}

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}
